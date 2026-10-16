-- Read-only. Stop on any mismatch; never display hashes/passwords/session tokens.
\set ON_ERROR_STOP on
BEGIN READ ONLY;
DO $$ BEGIN
 IF current_database() <> 'kape_sa_likod' OR inet_server_addr() IS NOT NULL THEN
  RAISE EXCEPTION 'Expected dedicated database through a local Unix socket';
 END IF;
 IF (SELECT count(*) FROM kape.categories) <> 3 OR (SELECT count(*) FROM kape.product_sizes) <> 2
 OR (SELECT count(*) FROM kape.products) <> 21 OR (SELECT count(*) FROM kape.product_variants) <> 37
 OR (SELECT count(*) FROM kape.schema_migrations) <> 3 THEN
  RAISE EXCEPTION 'Activation counts differ: STOP and inspect without changing data';
 END IF;
 IF (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) <> 'kape_sa_likod_owner' THEN
  RAISE EXCEPTION 'Unexpected database owner';
 END IF;
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='kape_sa_likod_app' AND rolcanlogin
  AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls)
 OR pg_has_role('kape_sa_likod_app','kape_sa_likod_owner','MEMBER') THEN
  RAISE EXCEPTION 'Application role is missing or has unexpected privileges';
 END IF;
END $$;
SELECT (SELECT count(*) FROM kape.categories) categories,
 (SELECT count(*) FROM kape.product_sizes) sizes,(SELECT count(*) FROM kape.products) products,
 (SELECT count(*) FROM kape.product_variants) variants,(SELECT count(*) FROM kape.schema_migrations) migrations;
DO $$ BEGIN
 IF EXISTS (SELECT FROM (VALUES
 ('001_catalog.sql','639a892ae4346a80871188a1afe6798be3f95ff4d410481c414ff501d4e76b4a'),
 ('002_orders_and_administration.sql','b3e3d6ac0b8a5223550598c90e95a05c85cbbd46a2b788b8f17dd6d40765e123'),
 ('003_backend_features.sql','107ff26c63f8322420e43efbe64d1319128531cacdbbc15b6263993cc71e0fda')) AS expected(version,sha256) LEFT JOIN kape.schema_migrations m USING(version) WHERE m.sha256 IS DISTINCT FROM expected.sha256) THEN
 RAISE EXCEPTION 'Migration checksum mismatch: STOP';
 END IF;
END $$;
SELECT version FROM kape.schema_migrations ORDER BY version;
SHOW listen_addresses;
SHOW port;
SHOW password_encryption;
-- Rule ordering matters: first matching rule wins. No HBA options/secrets printed.
SELECT rule_number,type,database,user_name,address,netmask,auth_method,error
FROM pg_hba_file_rules ORDER BY rule_number;
SELECT rolname,rolpassword IS NOT NULL AS password_is_set,
 coalesce(rolpassword LIKE 'SCRAM-SHA-256$%',false) AS has_scram_verifier
FROM pg_authid WHERE rolname='kape_sa_likod_app';
COMMIT;
