// Generación de slugs: 6 caracteres sin ambigüedades (sin i, l, o, 0, 1).

export const SLUG_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const SLUG_LENGTH = 6;
export const SLUG_RE = /^[abcdefghjkmnpqrstuvwxyz23456789]{6}$/;

export function isValidSlug(slug) {
  return typeof slug === 'string' && SLUG_RE.test(slug);
}

// Muestreo por rechazo para evitar sesgo de módulo.
export function randomSlug() {
  const n = SLUG_ALPHABET.length; // 31
  const limit = 256 - (256 % n);
  let out = '';
  while (out.length < SLUG_LENGTH) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    for (const b of bytes) {
      if (b < limit) {
        out += SLUG_ALPHABET[b % n];
        if (out.length === SLUG_LENGTH) break;
      }
    }
  }
  return out;
}
