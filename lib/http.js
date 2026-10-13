// Helpers de respuesta HTTP.

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

export function error(status, message) {
  return json({ error: message }, status);
}

export function noContent() {
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

export function methodNotAllowed(allowed) {
  return json({ error: 'método no permitido' }, 405, { Allow: allowed.join(', ') });
}

// Lee el cuerpo JSON. Devuelve { ok: true, body } o { ok: false, response }.
export async function readJson(request) {
  let text;
  try {
    text = await request.text();
  } catch {
    return { ok: false, response: error(400, 'no se pudo leer el cuerpo de la petición') };
  }
  if (text.trim() === '') return { ok: true, body: {} };
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, response: error(400, 'el cuerpo no es JSON válido') };
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, response: error(400, 'el cuerpo debe ser un objeto JSON') };
  }
  return { ok: true, body };
}

// URL base para shortUrl: PUBLIC_BASE_URL si existe, si no el origin de la petición.
export function baseUrl(env, request) {
  const configured = (env.PUBLIC_BASE_URL || '').trim();
  if (configured) return configured.replace(/\/+$/, '');
  return new URL(request.url).origin;
}
