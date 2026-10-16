-- PREPARATION ONLY. Execute only after explicit live-provisioning approval.
-- psql -X --host=/var/run/postgresql --username=postgres --dbname=postgres \
--   --set=approve_provision=true --file=apps/api/db/provision.sql
\set ON_ERROR_STOP on
\if :{?approve_provision}
\else
  \echo 'Refusing provisioning: explicit approve_provision=true required.'
  SELECT 1 / 0; -- ON_ERROR_STOP: abort the script with a nonzero exit
\endif
SELECT :'approve_provision' = 'true' AND current_database() = 'postgres'
       AND current_user = 'postgres' AND inet_server_addr() IS NULL AS approved \gset
\if :approved
\else
  \echo 'Requires postgres superuser on postgres database through a local Unix socket.'
  SELECT 1 / 0; -- ON_ERROR_STOP: abort the script with a nonzero exit
\endif
-- Fail rather than reuse or change pre-existing database/roles.
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_database WHERE datname = 'kape_sa_likod')
     OR EXISTS (SELECT FROM pg_roles WHERE rolname IN ('kape_sa_likod_owner', 'kape_sa_likod_app')) THEN
    RAISE EXCEPTION 'Database or role already exists; inspect manually. No automatic reuse.';
  END IF;
END $$;
BEGIN;
CREATE ROLE kape_sa_likod_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE kape_sa_likod_app LOGIN PASSWORD NULL NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 20;
COMMIT;
-- CREATE DATABASE cannot run within a transaction. A failure needs manual review.
CREATE DATABASE kape_sa_likod OWNER kape_sa_likod_owner TEMPLATE template0 ENCODING 'UTF8';
REVOKE ALL ON DATABASE kape_sa_likod FROM PUBLIC;
GRANT CONNECT ON DATABASE kape_sa_likod TO kape_sa_likod_app;
ALTER ROLE kape_sa_likod_app IN DATABASE kape_sa_likod SET search_path = pg_catalog, kape;
ALTER ROLE kape_sa_likod_app IN DATABASE kape_sa_likod SET statement_timeout = '15s';
ALTER ROLE kape_sa_likod_app IN DATABASE kape_sa_likod SET idle_in_transaction_session_timeout = '30s';
\connect kape_sa_likod
BEGIN;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
SET LOCAL ROLE kape_sa_likod_owner;
CREATE SCHEMA kape AUTHORIZATION kape_sa_likod_owner;
REVOKE ALL ON SCHEMA kape FROM PUBLIC;
GRANT USAGE ON SCHEMA kape TO kape_sa_likod_app;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
-- No blanket future table/sequence grants. Each migration grants only what it needs.
COMMIT;
\echo 'Provisioned without a password. Runtime password authentication remains disabled until separately configured.'
