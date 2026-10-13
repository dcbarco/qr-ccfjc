// Validación de entrada para códigos.

export const MAX_CODES = 20;
export const MAX_LABEL = 60;
export const MAX_TARGET = 2048;

// Valida label/target presentes en el cuerpo.
// Devuelve { ok: true, values } (solo con las claves presentes) o { ok: false, message }.
export function validateCodeInput(body) {
  const values = {};

  if (body.label !== undefined && body.label !== null) {
    if (typeof body.label !== 'string') {
      return { ok: false, message: 'label debe ser texto' };
    }
    const label = body.label.trim();
    if (label.length > MAX_LABEL) {
      return { ok: false, message: `label no puede superar ${MAX_LABEL} caracteres` };
    }
    values.label = label;
  }

  if (body.target !== undefined && body.target !== null) {
    if (typeof body.target !== 'string') {
      return { ok: false, message: 'target debe ser texto' };
    }
    const target = body.target.trim();
    if (target !== '') {
      if (target.length > MAX_TARGET) {
        return { ok: false, message: `target no puede superar ${MAX_TARGET} caracteres` };
      }
      if (!isHttpUrl(target)) {
        return { ok: false, message: 'target debe ser una URL absoluta http:// o https://' };
      }
    }
    values.target = target;
  }

  return { ok: true, values };
}

function isHttpUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== '';
}
