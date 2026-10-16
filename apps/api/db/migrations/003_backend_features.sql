-- Additive migration. 001 and 002 remain byte-for-byte unchanged.
ALTER TABLE kape.products ADD COLUMN description text NOT NULL DEFAULT '' CHECK (length(description) <= 2000);
ALTER TABLE kape.orders ADD COLUMN reference text NOT NULL DEFAULT ('KSL-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16))) UNIQUE;
ALTER TABLE kape.orders ADD COLUMN payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid'));
ALTER TABLE kape.admin_sessions ADD COLUMN csrf_token text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', '') CHECK (length(csrf_token) BETWEEN 32 AND 128);
ALTER TABLE kape.payments ADD COLUMN recorded_by uuid REFERENCES kape.admin_users(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX one_cash_payment_per_order ON kape.payments(order_id) WHERE status = 'paid' AND method = 'cash';
CREATE TABLE kape.cafe_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  name text NOT NULL DEFAULT 'Kape sa Likod' CHECK (length(name) BETWEEN 1 AND 120),
  counter_note text NOT NULL DEFAULT 'Please pay at the counter.' CHECK (length(counter_note) <= 500),
  timezone text NOT NULL DEFAULT 'Asia/Manila',
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO kape.cafe_settings(id) VALUES (true);
CREATE TRIGGER settings_touch BEFORE UPDATE ON kape.cafe_settings FOR EACH ROW EXECUTE FUNCTION kape.touch_updated_at();
CREATE TABLE kape.login_attempts (
  identity_hash bytea PRIMARY KEY CHECK (octet_length(identity_hash) = 32),
  failures integer NOT NULL DEFAULT 0 CHECK (failures >= 0),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz
);
CREATE INDEX admin_sessions_expiry_idx ON kape.admin_sessions(expires_at);
CREATE INDEX orders_reference_search_idx ON kape.orders(reference text_pattern_ops);
-- Runtime needs explicit DML for implemented server-authorized administration.
-- No schema privileges, ownership, DELETE on history, TRUNCATE, role membership,
-- default future grants, or broad ALL PRIVILEGES. Session revocation is an UPDATE.
GRANT INSERT ON kape.categories, kape.product_sizes, kape.products, kape.product_variants,
  kape.admin_users, kape.admin_sessions, kape.login_attempts,
  kape.order_status_events, kape.payments, kape.audit_events TO kape_sa_likod_app;
GRANT SELECT ON kape.admin_users, kape.admin_sessions, kape.login_attempts,
  kape.order_status_events, kape.payments, kape.audit_events, kape.cafe_settings TO kape_sa_likod_app;
GRANT UPDATE (name, sort_order, is_active) ON kape.categories TO kape_sa_likod_app;
GRANT UPDATE (name, category_id, description, image_path, sort_order, is_active) ON kape.products TO kape_sa_likod_app;
GRANT UPDATE (price_centavos, is_active) ON kape.product_variants TO kape_sa_likod_app;
GRANT UPDATE (status, payment_status) ON kape.orders TO kape_sa_likod_app;
GRANT UPDATE (display_name, password_hash, role, is_active) ON kape.admin_users TO kape_sa_likod_app;
GRANT UPDATE (revoked_at) ON kape.admin_sessions TO kape_sa_likod_app;
GRANT UPDATE (failures, window_started_at, blocked_until) ON kape.login_attempts TO kape_sa_likod_app;
GRANT UPDATE (name, counter_note, timezone) ON kape.cafe_settings TO kape_sa_likod_app;
-- Identity sequences only; no access to setval or order-history sequences.
GRANT USAGE ON SEQUENCE kape.categories_id_seq, kape.product_sizes_id_seq,
  kape.products_id_seq, kape.product_variants_id_seq TO kape_sa_likod_app;

GRANT SELECT (version, sha256) ON kape.schema_migrations TO kape_sa_likod_app;
