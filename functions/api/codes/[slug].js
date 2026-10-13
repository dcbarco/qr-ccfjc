// PATCH /api/codes/:slug  — edita label/target
// DELETE /api/codes/:slug — borra el código y sus scans
import { json, error, noContent, readJson, baseUrl } from '../../../lib/http.js';
import { getDb, updateCode, deleteCode } from '../../../lib/db.js';
import { validateCodeInput } from '../../../lib/validate.js';
import { isValidSlug } from '../../../lib/slug.js';

const NOT_FOUND = 'código no encontrado';

export async function onRequestPatch({ request, env, params }) {
  const slug = params.slug;
  if (!isValidSlug(slug)) return error(404, NOT_FOUND);

  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;

  const v = validateCodeInput(parsed.body);
  if (!v.ok) return error(400, v.message);

  const db = await getDb(env);
  const code = await updateCode(db, slug, v.values, baseUrl(env, request));
  if (!code) return error(404, NOT_FOUND);
  return json(code);
}

export async function onRequestDelete({ env, params }) {
  const slug = params.slug;
  if (!isValidSlug(slug)) return error(404, NOT_FOUND);

  const db = await getDb(env);
  const deleted = await deleteCode(db, slug);
  if (!deleted) return error(404, NOT_FOUND);
  return noContent();
}
