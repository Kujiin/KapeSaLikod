-- Accounts are application identities, never PostgreSQL login roles.
CREATE TABLE kape.admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL CHECK (email = lower(btrim(email)) AND position('@' IN email) > 1),
  password_hash text NOT NULL CHECK (length(password_hash) > 0),
  display_name text NOT NULL CHECK (length(btrim(display_name)) > 0),
  role text NOT NULL CHECK (role IN ('owner', 'manager', 'staff')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email)
);
CREATE TRIGGER admins_touch BEFORE UPDATE ON kape.admin_users FOR EACH ROW EXECUTE FUNCTION kape.touch_updated_at();
CREATE TABLE kape.admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES kape.admin_users(id) ON DELETE RESTRICT,
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);
CREATE INDEX admin_sessions_user_idx ON kape.admin_sessions(admin_user_id);
CREATE TABLE kape.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_type text NOT NULL CHECK (order_type IN ('Dine In', 'Take Out')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'preparing', 'ready', 'completed', 'cancelled')),
  currency text NOT NULL DEFAULT 'PHP' CHECK (currency = 'PHP'),
  total_centavos bigint NOT NULL CHECK (total_centavos >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER orders_touch BEFORE UPDATE ON kape.orders FOR EACH ROW EXECUTE FUNCTION kape.touch_updated_at();
CREATE INDEX orders_queue_idx ON kape.orders(status, created_at);
CREATE TABLE kape.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES kape.orders(id) ON DELETE RESTRICT,
  variant_id bigint NOT NULL REFERENCES kape.product_variants(id) ON DELETE RESTRICT,
  product_name text NOT NULL CHECK (length(btrim(product_name)) > 0),
  category_name text NOT NULL CHECK (length(btrim(category_name)) > 0),
  size_label text NOT NULL CHECK (length(btrim(size_label)) > 0),
  unit_price_centavos integer NOT NULL CHECK (unit_price_centavos >= 0),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 999),
  line_total_centavos bigint GENERATED ALWAYS AS (unit_price_centavos::bigint * quantity) STORED
);
CREATE INDEX order_items_order_idx ON kape.order_items(order_id);
CREATE INDEX order_items_variant_idx ON kape.order_items(variant_id);
-- Deferred checks allow header + lines to be inserted in a single transaction.
CREATE FUNCTION kape.check_order_total() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE oid uuid; expected bigint; actual numeric; n bigint;
BEGIN
  IF TG_TABLE_NAME = 'order_items' AND TG_OP = 'UPDATE' THEN
    IF OLD.order_id <> NEW.order_id THEN
      RAISE EXCEPTION 'Moving historical items between orders is forbidden';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'orders' THEN oid := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN oid := OLD.order_id;
  ELSE oid := NEW.order_id; END IF;
  SELECT total_centavos INTO expected FROM kape.orders WHERE id = oid FOR UPDATE;
  SELECT coalesce(sum(line_total_centavos), 0), count(*) INTO actual, n FROM kape.order_items WHERE order_id = oid;
  IF n = 0 OR expected IS DISTINCT FROM actual THEN
    RAISE EXCEPTION 'Order must have items and total must match lines' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER order_total_header AFTER INSERT OR UPDATE ON kape.orders
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION kape.check_order_total();
CREATE CONSTRAINT TRIGGER order_total_lines AFTER INSERT OR UPDATE OR DELETE ON kape.order_items
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION kape.check_order_total();
CREATE TABLE kape.order_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES kape.orders(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('pending', 'accepted', 'preparing', 'ready', 'completed', 'cancelled')),
  actor_admin_id uuid REFERENCES kape.admin_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_status_events_order_idx ON kape.order_status_events(order_id, created_at);
CREATE TABLE kape.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES kape.orders(id) ON DELETE RESTRICT,
  method text NOT NULL CHECK (method IN ('cash', 'external')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  amount_centavos bigint NOT NULL CHECK (amount_centavos > 0),
  external_reference text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_order_idx ON kape.payments(order_id);
CREATE TRIGGER payments_touch BEFORE UPDATE ON kape.payments FOR EACH ROW EXECUTE FUNCTION kape.touch_updated_at();
CREATE TABLE kape.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_admin_id uuid REFERENCES kape.admin_users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (length(btrim(action)) > 0),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_actor_idx ON kape.audit_events(actor_admin_id, created_at);
CREATE TABLE kape.idempotency_keys (
  key uuid PRIMARY KEY,
  request_hash bytea NOT NULL CHECK (octet_length(request_hash) = 32),
  order_id uuid NOT NULL UNIQUE REFERENCES kape.orders(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > created_at)
);
-- Customer API permissions only. No catalog writes, admin credentials, payments,
-- status updates, deletes, DDL, or sequence grants. UUID order IDs need no sequence.
GRANT SELECT, INSERT ON kape.orders, kape.order_items, kape.idempotency_keys TO kape_sa_likod_app;
-- Runtime cannot UPDATE/DELETE items: historical snapshots remain immutable.
-- Staff grants and authentication endpoints require a later reviewed migration.
