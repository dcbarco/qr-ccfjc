// Autenticación Bearer ADMIN_TOKEN para todas las rutas /api/*.
import { error } from '../../lib/http.js';

const encoder = new TextEncoder();

// Comparación en tiempo constante: se comparan los SHA-256 (longitud fija).
async function safeEqual(a, b) {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function auth(context) {
  const { request, env } = context;
  const expected = env.ADMIN_TOKEN;
  if (!expected) return error(500, 'ADMIN_TOKEN no configurado');

  const header = request.headers.get('Authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const provided = match ? match[1].trim() : '';
  if (!(await safeEqual(provided, expected))) {
    return error(401, 'unauthorized');
  }

  try {
    return await context.next();
  } catch (err) {
    console.error(err);
    return error(500, 'error interno del servidor');
  }
}

export const onRequest = [auth];
