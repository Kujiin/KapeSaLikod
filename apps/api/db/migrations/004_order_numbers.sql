-- New orders use a persistent, seven-digit sequence. Existing references remain
-- unchanged so historical receipts, searches and idempotent retries stay valid.
CREATE SEQUENCE kape.order_reference_seq AS bigint
  MINVALUE 1 MAXVALUE 9999999 START WITH 1 NO CYCLE;
-- Preserve imported references if a reviewed data import already used this format.
SELECT setval('kape.order_reference_seq',
  coalesce(max(substring(reference FROM 13)::bigint), 1),
  max(substring(reference FROM 13)::bigint) IS NOT NULL)
FROM kape.orders WHERE reference ~ '^KapeSaLikod-[0-9]{7}$';
ALTER TABLE kape.orders ALTER COLUMN reference
  SET DEFAULT ('KapeSaLikod-' || lpad(nextval('kape.order_reference_seq')::text, 7, '0'));
GRANT USAGE ON SEQUENCE kape.order_reference_seq TO kape_sa_likod_app;
-- No UPDATE on the sequence: runtime cannot reset it with setval(). Sequence
-- allocations survive rollback, so gaps are normal; numbers never reset daily.
