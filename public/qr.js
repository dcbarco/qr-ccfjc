// Generación de QR (SVG / PNG) sobre la librería vendorizada qrcode-generator.
// La librería se carga como <script> clásico y expone `qrcode` como global.

const QUIET = 4; // zona de silencio estándar (módulos)

function lib() {
  const f = globalThis.qrcode;
  if (typeof f !== 'function') throw new Error('No se pudo cargar la librería de QR.');
  if (f.stringToBytesFuncs && f.stringToBytesFuncs['UTF-8']) {
    f.stringToBytes = f.stringToBytesFuncs['UTF-8'];
  }
  return f;
}

/** Devuelve la matriz de módulos (array de arrays booleanos). Corrección de errores M. */
export function qrMatrix(text) {
  const qr = lib()(0, 'M'); // 0 = versión automática
  qr.addData(String(text), 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const rows = [];
  for (let r = 0; r < n; r++) {
    const row = new Array(n);
    for (let c = 0; c < n; c++) row[c] = qr.isDark(r, c);
    rows.push(row);
  }
  return rows;
}

/** SVG como string. `size` en px (atributos width/height); viewBox en módulos. */
export function qrSvg(text, size) {
  const m = qrMatrix(text);
  const n = m.length;
  const dim = n + QUIET * 2;
  let d = '';
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!m[r][c]) { c++; continue; }
      const start = c;
      while (c < n && m[r][c]) c++;
      d += `M${start + QUIET} ${r + QUIET}h${c - start}v1h-${c - start}z`;
    }
  }
  const wh = size ? ` width="${size}" height="${size}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}"${wh} shape-rendering="crispEdges">` +
    `<rect width="${dim}" height="${dim}" fill="#ffffff"/>` +
    `<path d="${d}" fill="#000000"/></svg>`;
}

/** Renderiza el SVG en un canvas (fondo blanco) y devuelve un Blob PNG. Solo navegador. */
export function qrPngBlob(text, px = 1024) {
  const svg = qrSvg(text, px);
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = px;
        canvas.height = px;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, px, px);
        ctx.drawImage(img, 0, 0, px, px);
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo generar el PNG.'))), 'image/png');
      } catch (e) {
        reject(e);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo generar el PNG.')); };
    img.src = url;
  });
}
