import { z, object, text, email, password, parse } from '../validation.js';
import { digest, token, hashPassword, verifyPassword, fail } from '../security.js';
import { transaction, audit } from '../db.js';

export function authRoutes(app, pool, config) {
  const cookieOptions = { httpOnly: true, secure: config.production, sameSite: 'strict', path: '/', maxAge: config.sessionHours * 3600 };
  app.post('/v1/auth/login', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = parse(object({ email, password: z.string().min(1).max(128) }), request.body);
    const identity = digest(body.email);
    const outcome = await transaction(pool, async client => {
      await client.query('INSERT INTO kape.login_attempts(identity_hash) VALUES($1) ON CONFLICT DO NOTHING', [identity]);
      const { rows: [attempt] } = await client.query('SELECT *, blocked_until > now() AS blocked FROM kape.login_attempts WHERE identity_hash=$1 FOR UPDATE', [identity]);
      if (attempt.blocked) return null;
      const { rows: [user] } = await client.query('SELECT * FROM kape.admin_users WHERE email=$1', [body.email]);
      const valid = await verifyPassword(body.password, user?.password_hash);
      if (!valid || !user?.is_active) {
        await client.query(`UPDATE kape.login_attempts SET
          failures=CASE WHEN window_started_at < now()-interval '15 minutes' THEN 1 ELSE failures+1 END,
          blocked_until=CASE WHEN window_started_at >= now()-interval '15 minutes' AND failures >= 4 THEN now()+interval '15 minutes' ELSE NULL END,
          window_started_at=CASE WHEN window_started_at < now()-interval '15 minutes' THEN now() ELSE window_started_at END
          WHERE identity_hash=$1`, [identity]);
        return null;
      }
      await client.query('UPDATE kape.login_attempts SET failures=0, blocked_until=NULL,window_started_at=now() WHERE identity_hash=$1',[identity]);
      const session = token(); const csrf = token();
      await client.query(`INSERT INTO kape.admin_sessions(admin_user_id,token_hash,csrf_token,expires_at)
        VALUES($1,$2,$3,now()+interval '8 hours')`,[user.id,digest(session),csrf]);
      await audit(client, user, 'login', 'admin_user', user.id);
      return { session, csrf, user: { id:user.id, display_name:user.display_name, email:user.email, role:user.role } };
    });
    if (!outcome) fail(401,'Email or password is incorrect, or sign-in is temporarily locked.');
    reply.setCookie(config.cookieName, outcome.session, cookieOptions);
    return { user:outcome.user, csrf:outcome.csrf };
  });
}

export async function authenticatedRoutes(app, pool, config, routes) {
  await app.register(async admin => {
    admin.addHook('onRequest', async request => {
      const raw = request.cookies[config.cookieName];
      if (!raw || !/^[a-f0-9]{64}$/.test(raw)) fail(401,'Please sign in.');
      const {rows:[session]} = await pool.query(`SELECT s.id AS session_id,s.csrf_token,u.id,u.email,u.display_name,u.role
        FROM kape.admin_sessions s JOIN kape.admin_users u ON u.id=s.admin_user_id
        WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.is_active`,[digest(raw)]);
      if (!session) fail(401,'Your session expired. Please sign in again.');
      request.admin = session;
      if (!['GET','HEAD','OPTIONS'].includes(request.method) && request.headers['x-csrf-token'] !== session.csrf_token) fail(403,'Refresh your session and try again.');
    });
    admin.get('/v1/admin/session', async request => ({user:{id:request.admin.id,email:request.admin.email,display_name:request.admin.display_name,role:request.admin.role},csrf:request.admin.csrf_token}));
    admin.post('/v1/admin/logout', async (request,reply) => {
      await pool.query('UPDATE kape.admin_sessions SET revoked_at=now() WHERE id=$1',[request.admin.session_id]);
      reply.clearCookie(config.cookieName,{path:'/',secure:config.production,httpOnly:true,sameSite:'strict'});
      return {ok:true};
    });
    admin.post('/v1/admin/password', async (request,reply) => {
      const body=parse(object({current_password:text(128),new_password:password}),request.body);
      const {rows:[user]}=await pool.query('SELECT password_hash FROM kape.admin_users WHERE id=$1',[request.admin.id]);
      if (!await verifyPassword(body.current_password,user.password_hash)) fail(400,'Current password is incorrect.');
      const hashed=await hashPassword(body.new_password);
      await transaction(pool,async client=>{
        await client.query('UPDATE kape.admin_users SET password_hash=$1 WHERE id=$2',[hashed,request.admin.id]);
        await client.query('UPDATE kape.admin_sessions SET revoked_at=now() WHERE admin_user_id=$1 AND revoked_at IS NULL',[request.admin.id]);
        await audit(client,request.admin,'password_changed','admin_user',request.admin.id);
      });
      reply.clearCookie(config.cookieName,{path:'/'}); return {ok:true};
    });
    await routes(admin);
  });
}
