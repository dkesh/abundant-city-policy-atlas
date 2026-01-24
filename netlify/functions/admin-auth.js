/**
 * Netlify Function: Admin Auth
 * Endpoint: /.netlify/functions/admin-auth (or /api/admin-auth)
 * POST: login with { "password": "..." }. Sets HttpOnly cookie on success.
 * GET: logout. Clears cookie.
 */

const { sessionCookieHeader, clearCookieHeader, corsHeaders } = require('./admin-auth-utils');

function json(event, body, statusCode = 200, extraHeaders = {}) {
  return {
    statusCode,
    headers: { ...corsHeaders(event), ...extraHeaders },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  const headers = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod === 'GET') {
    return json(
      event,
      { success: true, message: 'Logged out' },
      200,
      { 'Set-Cookie': clearCookieHeader() }
    );
  }

  if (event.httpMethod !== 'POST') {
    return json(event, { success: false, error: 'Method not allowed' }, 405);
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { password } = body;

    if (!password) {
      return json(event, { success: false, error: 'password is required' }, 400);
    }

    const expected = process.env.ADMIN_PASSWORD;
    if (!expected) {
      return json(event, { success: false, error: 'Admin auth not configured' }, 500);
    }

    if (password !== expected) {
      return json(event, { success: false, error: 'Invalid password' }, 401);
    }

    return json(
      event,
      { success: true, message: 'Logged in' },
      200,
      { 'Set-Cookie': sessionCookieHeader() }
    );
  } catch (e) {
    return json(event, { success: false, error: 'Invalid request' }, 400);
  }
};
