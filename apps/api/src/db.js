import pg from 'pg';
export const poolFor = config => new pg.Pool(config.database);
export async function transaction(pool, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
export const audit = (client, user, action, entity, id, metadata = {}) => client.query(
  'INSERT INTO kape.audit_events(actor_admin_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5)',
  [user.id, action, entity, String(id), metadata]);
