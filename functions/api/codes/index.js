// GET /api/codes  — lista
// POST /api/codes — crea
import { json, error, readJson, baseUrl } from '../../../lib/http.js';
import { getDb, listCodes, createCode } from '../../../lib/db.js';
import { validateCodeInput, MAX_CODES } from '../../../lib/validate.js';

export async function onRequestGet({ request, env }) {
  const db = await getDb(env);
  const codes = await listCodes(db, baseUrl(env, request));
  return json({ codes, limit: MAX_CODES });
}

export async function onRequestPost({ request, env }) {
  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;

  const v = validateCodeInput(parsed.body);
  if (!v.ok) return error(400, v.message);

  const db = await getDb(env);
  const result = await createCode(db, v.values, baseUrl(env, request));
  if (result.limitReached) {
    return error(409, `se alcanzó el máximo de ${MAX_CODES} códigos`);
  }
  return json(result.code, 201);
}
