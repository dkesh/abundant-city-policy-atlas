/**
 * Shared admin auth utilities for Netlify functions.
 * Cookie-based session: HMAC-signed payload, HttpOnly, Secure, SameSite=Strict.
 */

const crypto = require('crypto');

const COOKIE_NAME = 'admin_session';
const MAX_AGE_SEC = 24 * 60 * 60; // 24 hours

function getSecret() {
  const s = process.env.ADMIN_PASSWORD;
  if (!s) throw new Error('ADMIN_PASSWORD is not set');
  return s;
}

function createSignedPayload() {
  const secret = getSecret();
  const ts = Math.floor(Date.now() / 1000);
  const hmac = crypto.createHmac('sha256', secret).update(String(ts)).digest('hex');
  const payload = JSON.stringify({ ts, hmac });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

function verifySignedPayload(value) {
  if (!value) return false;
  try {
    const payload = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    const { ts, hmac } = payload;
    if (typeof ts !== 'number' || typeof hmac !== 'string') return false;
    const secret = getSecret();
    const expected = crypto.createHmac('sha256', secret).update(String(ts)).digest('hex');
    if (expected !== hmac) return false;
    const now = Math.floor(Date.now() / 1000);
    if (now - ts > MAX_AGE_SEC) return false;
    return true;
  } catch (_) {
    return false;
  }
}

function parseCookie(header) {
  if (!header) return null;
  const parts = header.split(';').map((s) => s.trim());
  for (const p of parts) {
    const [name, ...v] = p.split('=');
    if (name.trim().toLowerCase() === COOKIE_NAME.toLowerCase()) {
      return (v.join('=') || '').trim();
    }
  }
  return null;
}

function getCookieFromRequest(event) {
  const h = event.headers?.cookie || event.headers?.Cookie;
  return parseCookie(h);
}

function isAuthenticated(event) {
  const cookie = getCookieFromRequest(event);
  return verifySignedPayload(cookie);
}

function sessionCookieHeader() {
  const value = createSignedPayload();
  return [
    `${COOKIE_NAME}=${value}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    `Max-Age=${MAX_AGE_SEC}`,
  ].join('; ');
}

function clearCookieHeader() {
  return [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    'Max-Age=0',
  ].join('; ');
}

/** CORS headers for admin API. Use request Origin when credentials are sent (avoid *). */
function corsHeaders(event) {
  const origin = event.headers?.origin || event.headers?.Origin;
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
  };
}

module.exports = {
  COOKIE_NAME,
  getSecret,
  createSignedPayload,
  verifySignedPayload,
  parseCookie,
  getCookieFromRequest,
  isAuthenticated,
  sessionCookieHeader,
  clearCookieHeader,
  corsHeaders,
};
