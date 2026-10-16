import { randomBytes, createHash, scrypt as callbackScrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(callbackScrypt);
export const digest = value => createHash('sha256').update(value).digest();
export const token = () => randomBytes(32).toString('hex');
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${salt}$${key.toString('hex')}`;
}
export async function verifyPassword(password, stored) {
  const [, salt, encoded] = (stored || '').split('$');
  // Do equivalent expensive work for unknown users. Never log supplied secrets.
  const actual = await scrypt(password, salt || 'invalid-user-salt', 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const expected = encoded ? Buffer.from(encoded, 'hex') : Buffer.alloc(64);
  return expected.length === actual.length && timingSafeEqual(actual, expected) && !!encoded;
}
export function fail(statusCode, message) { throw Object.assign(new Error(message), { statusCode }); }
export function authorize(roles) {
  return async request => {
    if (!request.admin) fail(401, 'Please sign in.');
    if (!roles.includes(request.admin.role)) fail(403, 'Your account cannot perform this action.');
  };
}
export const managers = authorize(['owner', 'manager']);
export const owners = authorize(['owner']);
