// Acceso a D1: bootstrap del esquema y consultas.
import { MAX_CODES } from './validate.js';
import { randomSlug } from './slug.js';

const DAY_MS = 86400000;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS codes (
    slug TEXT PRIMARY KEY,
    label TEXT NOT NULL DEFAULT '',
    target TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL,
    ts INTEGER NOT NULL,
    country TEXT NOT NULL DEFAULT 'XX'
  )`,
  `CREATE INDEX IF NOT EXISTS idx_scans_slug_ts ON scans (slug, ts)`,
];

// Una vez por isolate (por binding). Si falla, se reintenta en la siguiente petición.
const ready = new WeakMap();

export function ensureSchema(db) {
  if (!db) throw new Error('Binding D1 "DB" no configurado');
  let p = ready.get(db);
  if (!p) {
    p = db.batch(SCHEMA.map((sql) => db.prepare(sql))).catch((err) => {
      ready.delete(db);
      throw err;
    });
    ready.set(db, p);
  }
  return p;
}

export async function getDb(env) {
  await ensureSchema(env.DB);
  return env.DB;
}

function toCode(row, base) {
  return {
    slug: row.slug,
    label: row.label ?? '',
    target: row.target ?? '',
    shortUrl: `${base}/r/${row.slug}`,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    scans: {
      total: row.total ?? 0,
      last7d: row.last7d ?? 0,
      lastAt: row.last_at ?? null,
    },
  };
}

const CODE_SELECT = `
  SELECT c.slug, c.label, c.target, c.created_at, c.updated_at,
         COUNT(s.id) AS total,
         COALESCE(SUM(CASE WHEN s.ts >= ?1 THEN 1 ELSE 0 END), 0) AS last7d,
         MAX(s.ts) AS last_at
  FROM codes c
  LEFT JOIN scans s ON s.slug = c.slug`;

export async function listCodes(db, base) {
  const since = Date.now() - 7 * DAY_MS;
  const { results } = await db
    .prepare(`${CODE_SELECT} GROUP BY c.slug ORDER BY c.created_at DESC, c.slug`)
    .bind(since)
    .all();
  return results.map((r) => toCode(r, base));
}

export async function getCode(db, slug, base) {
  const since = Date.now() - 7 * DAY_MS;
  const row = await db
    .prepare(`${CODE_SELECT} WHERE c.slug = ?2 GROUP BY c.slug`)
    .bind(since, slug)
    .first();
  return row ? toCode(row, base) : null;
}

// Crea un código respetando el límite de forma atómica.
// Devuelve { code } o { limitReached: true }.
export async function createCode(db, { label = '', target = '' }, base) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const slug = randomSlug();
    const now = Date.now();
    const res = await db
      .prepare(
        `INSERT OR IGNORE INTO codes (slug, label, target, created_at, updated_at)
         SELECT ?1, ?2, ?3, ?4, ?4
         WHERE (SELECT COUNT(*) FROM codes) < ?5`
      )
      .bind(slug, label, target, now, MAX_CODES)
      .run();
    if (res.meta.changes === 1) {
      return { code: await getCode(db, slug, base) };
    }
    const { n } = await db.prepare('SELECT COUNT(*) AS n FROM codes').first();
    if (n >= MAX_CODES) return { limitReached: true };
    // Si no, fue colisión de slug: reintentar.
  }
  throw new Error('No se pudo generar un slug único');
}

// Actualiza label/target. Devuelve el Code o null si no existe.
export async function updateCode(db, slug, values, base) {
  const sets = [];
  const params = [];
  if (values.label !== undefined) {
    sets.push(`label = ?${params.push(values.label)}`);
  }
  if (values.target !== undefined) {
    sets.push(`target = ?${params.push(values.target)}`);
  }
  if (sets.length > 0) {
    sets.push(`updated_at = ?${params.push(Date.now())}`);
    const res = await db
      .prepare(`UPDATE codes SET ${sets.join(', ')} WHERE slug = ?${params.push(slug)}`)
      .bind(...params)
      .run();
    if (res.meta.changes === 0) return null;
  }
  return getCode(db, slug, base);
}

export async function deleteCode(db, slug) {
  const [, del] = await db.batch([
    db.prepare('DELETE FROM scans WHERE slug = ?1').bind(slug),
    db.prepare('DELETE FROM codes WHERE slug = ?1').bind(slug),
  ]);
  return del.meta.changes > 0;
}

export async function getTarget(db, slug) {
  return db.prepare('SELECT slug, target FROM codes WHERE slug = ?1').bind(slug).first();
}

export async function recordScan(db, slug, country) {
  await db
    .prepare('INSERT INTO scans (slug, ts, country) VALUES (?1, ?2, ?3)')
    .bind(slug, Date.now(), country || 'XX')
    .run();
}

function utcDay(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export async function getStats(db, slug) {
  const exists = await db.prepare('SELECT 1 AS ok FROM codes WHERE slug = ?1').bind(slug).first();
  if (!exists) return null;

  const now = Date.now();
  const todayStart = Math.floor(now / DAY_MS) * DAY_MS;
  const start = todayStart - 29 * DAY_MS;
  const since7d = now - 7 * DAY_MS;

  const [summary, daily, countries] = await db.batch([
    db
      .prepare(
        `SELECT COUNT(*) AS total, MAX(ts) AS last_at,
                COALESCE(SUM(CASE WHEN ts >= ?2 THEN 1 ELSE 0 END), 0) AS last7d
         FROM scans WHERE slug = ?1`
      )
      .bind(slug, since7d),
    db
      .prepare(
        `SELECT (ts / ${DAY_MS}) AS d, COUNT(*) AS count
         FROM scans WHERE slug = ?1 AND ts >= ?2
         GROUP BY d`
      )
      .bind(slug, start),
    db
      .prepare(
        `SELECT COALESCE(NULLIF(country, ''), 'XX') AS country, COUNT(*) AS count
         FROM scans WHERE slug = ?1
         GROUP BY 1 ORDER BY count DESC, country ASC LIMIT 10`
      )
      .bind(slug),
  ]);

  const s = summary.results[0] || {};
  const byDay = new Map(daily.results.map((r) => [r.d * DAY_MS, r.count]));
  const days = [];
  for (let i = 0; i < 30; i++) {
    const t = start + i * DAY_MS;
    days.push({ day: utcDay(t), count: byDay.get(t) ?? 0 });
  }

  return {
    slug,
    total: s.total ?? 0,
    lastAt: s.last_at ?? null,
    last7d: s.last7d ?? 0,
    daily: days,
    countries: countries.results.map((r) => ({ country: r.country, count: r.count })),
  };
}
