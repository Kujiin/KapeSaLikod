-- Run as local postgres through Remote SSH; no writes, passwords, or session tokens.
BEGIN READ ONLY;
SELECT version,sha256,applied_at FROM kape.schema_migrations ORDER BY version;
SELECT c.name AS category,p.name,s.label,v.price_centavos,p.is_active,v.is_active
FROM kape.products p JOIN kape.categories c ON c.id=p.category_id
JOIN kape.product_variants v ON v.product_id=p.id JOIN kape.product_sizes s ON s.id=v.size_id
ORDER BY c.sort_order,p.sort_order,s.sort_order;
SELECT reference,order_type,status,payment_status,total_centavos,created_at
FROM kape.orders ORDER BY created_at DESC LIMIT 50;
SELECT action,entity_type,entity_id,created_at FROM kape.audit_events ORDER BY created_at DESC LIMIT 50;
COMMIT;
