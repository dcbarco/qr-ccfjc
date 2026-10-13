// GET /api/codes/:slug/stats
import { json, error } from '../../../../lib/http.js';
import { getDb, getStats } from '../../../../lib/db.js';
import { isValidSlug } from '../../../../lib/slug.js';

export async function onRequestGet({ env, params }) {
  const slug = params.slug;
  if (!isValidSlug(slug)) return error(404, 'código no encontrado');

  const db = await getDb(env);
  const stats = await getStats(db, slug);
  if (!stats) return error(404, 'código no encontrado');
  return json(stats);
}
