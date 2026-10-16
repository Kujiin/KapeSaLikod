import { isAbsolute } from 'node:path';
export function configuration(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const host = env.PGHOST || '/var/run/postgresql';
  if (!(host.startsWith('/') || host === '127.0.0.1' || host === '::1')) throw new Error('PostgreSQL must be local');
  if (env.PGDATABASE && env.PGDATABASE !== 'kape_sa_likod') throw new Error('Unexpected database name');
  if (env.PGUSER && env.PGUSER !== 'kape_sa_likod_app') throw new Error('Use the restricted application role');
  const origins = (env.ALLOWED_ORIGINS || 'http://127.0.0.1:4173').split(',');
  for (const origin of origins) {
    const u = new URL(origin);
    if (u.origin !== origin || (production && u.protocol !== 'https:')) throw new Error('Origins must be exact origins, HTTPS in production');
  }
  const uploadDir = env.UPLOAD_DIR || '/var/lib/kape-sa-likod/uploads';
  if (!isAbsolute(uploadDir)) throw new Error('UPLOAD_DIR must be absolute');
  const port = Number(env.PORT || 3100);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid API port');
  return {
    production, port, origins, uploadDir, cookieName: production ? '__Host-ksl_session' : 'ksl_session',
    sessionHours: 8,
    database: { host, port: Number(env.PGPORT || 5432), database: 'kape_sa_likod', user: 'kape_sa_likod_app',
      password: env.PGPASSWORD, max: 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000,
      application_name: 'kape-sa-likod-api' },
  };
}
