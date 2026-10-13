// GET /r/:slug — redirección pública (302, nunca 301) y registro del scan.
import { getDb, getTarget, recordScan } from '../../lib/db.js';
import { isValidSlug } from '../../lib/slug.js';

const NO_STORE = 'no-store';

function page(status, title, message) {
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<style>
  html, body { margin: 0; background: #fff; color: #000; }
  body { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
         min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 16px; box-sizing: border-box; }
  main { border: 6px solid #000; border-radius: 0; padding: 32px 28px; max-width: 520px; width: 100%; box-sizing: border-box; }
  h1 { margin: 0 0 12px; font-size: 28px; line-height: 1.15; text-transform: uppercase; }
  p { margin: 0; font-size: 16px; line-height: 1.5; }
</style>
</head>
<body>
<main>
<h1>${title}</h1>
<p>${message}</p>
</main>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': NO_STORE,
      'X-Robots-Tag': 'noindex',
    },
  });
}

function notFound() {
  return page(404, 'QR no encontrado', 'Este código QR no existe o fue eliminado.');
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const method = request.method;
  if (method !== 'GET' && method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  }

  const slug = params.slug;
  if (!isValidSlug(slug)) return notFound();

  let row;
  try {
    const db = await getDb(env);
    row = await getTarget(db, slug);
  } catch (err) {
    console.error(err);
    return page(500, 'Error', 'No se pudo procesar el código QR. Intenta de nuevo.');
  }
  if (!row) return notFound();

  if (method === 'GET') {
    const country = request.cf?.country || 'XX';
    context.waitUntil(
      recordScan(env.DB, slug, country).catch((err) => console.error('recordScan', err))
    );
  }

  if (row.target) {
    return new Response(null, {
      status: 302,
      headers: { Location: row.target, 'Cache-Control': NO_STORE },
    });
  }
  return page(200, 'Sin destino', 'Este QR aún no tiene destino.');
}
