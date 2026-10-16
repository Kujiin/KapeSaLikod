CREATE TABLE kape.categories (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL UNIQUE CHECK (length(btrim(name)) > 0),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE kape.product_sizes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  label text NOT NULL UNIQUE CHECK (length(btrim(label)) > 0),
  ounces smallint NOT NULL UNIQUE CHECK (ounces > 0),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0)
);
CREATE TABLE kape.products (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_id bigint NOT NULL REFERENCES kape.categories(id) ON DELETE RESTRICT,
  name text NOT NULL UNIQUE CHECK (length(btrim(name)) > 0),
  image_path text,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_category_idx ON kape.products(category_id);
CREATE TABLE kape.product_variants (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id bigint NOT NULL REFERENCES kape.products(id) ON DELETE RESTRICT,
  size_id bigint NOT NULL REFERENCES kape.product_sizes(id) ON DELETE RESTRICT,
  price_centavos integer NOT NULL CHECK (price_centavos >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, size_id)
);
CREATE INDEX product_variants_size_idx ON kape.product_variants(size_id);
CREATE FUNCTION kape.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN NEW.updated_at = clock_timestamp(); RETURN NEW; END $$;
CREATE TRIGGER categories_touch BEFORE UPDATE ON kape.categories FOR EACH ROW EXECUTE FUNCTION kape.touch_updated_at();
CREATE TRIGGER products_touch BEFORE UPDATE ON kape.products FOR EACH ROW EXECUTE FUNCTION kape.touch_updated_at();
CREATE TRIGGER variants_touch BEFORE UPDATE ON kape.product_variants FOR EACH ROW EXECUTE FUNCTION kape.touch_updated_at();
GRANT SELECT ON kape.categories, kape.product_sizes, kape.products, kape.product_variants TO kape_sa_likod_app;
