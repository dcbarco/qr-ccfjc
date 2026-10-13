-- Esquema D1 para qr-ccfjc.
-- Las Functions crean estas tablas automáticamente (CREATE TABLE IF NOT EXISTS) en la
-- primera petición; este archivo es solo para uso manual opcional:
--   npx wrangler d1 execute qr-ccfjc --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS codes (
  slug TEXT PRIMARY KEY,
  label TEXT NOT NULL DEFAULT '',
  target TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  ts INTEGER NOT NULL,
  country TEXT NOT NULL DEFAULT 'XX'
);

CREATE INDEX IF NOT EXISTS idx_scans_slug_ts ON scans (slug, ts);
