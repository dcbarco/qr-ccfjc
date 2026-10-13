// QR//DINÁMICOS — panel de administración (sin framework, sin build).
import { qrSvg, qrPngBlob } from './qr.js';

const TOKEN_KEY = 'qr_admin_token';
const DEFAULT_LIMIT = 20;

const state = {
  codes: [],
  limit: DEFAULT_LIMIT,
  loading: false,
};

// ---------- utilidades DOM ----------
const $ = (id) => document.getElementById(id);

/** Crea un elemento. attrs: props/atributos; children: nodos o strings (como texto). */
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return el;
}

function setMsg(el, text, kind) {
  el.textContent = text || '';
  el.classList.toggle('is-err', kind === 'err');
  el.classList.toggle('is-ok', kind === 'ok');
}

function svgNode(svgString) {
  const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
  return document.importNode(doc.documentElement, true);
}

const pad2 = (n) => String(n).padStart(2, '0');

// ---------- almacenamiento del token ----------
let memToken = ''; // respaldo si localStorage no está disponible
function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return memToken; }
}
function setToken(t) {
  memToken = t;
  try { localStorage.setItem(TOKEN_KEY, t); } catch { /* sin almacenamiento: queda en memoria */ }
}
function clearToken() {
  memToken = '';
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignorar */ }
}

// ---------- API ----------
class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function api(method, path, body) {
  const headers = { Authorization: `Bearer ${getToken()}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('No se pudo conectar con el servidor. Revisa tu conexión.', 0);
  }
  let data = null;
  if (res.status !== 204) {
    const txt = await res.text();
    if (txt) { try { data = JSON.parse(txt); } catch { data = null; } }
  }
  if (res.status === 401) {
    handleUnauthorized();
    throw new ApiError((data && data.error) || 'No autorizado.', 401);
  }
  if (!res.ok) {
    throw new ApiError((data && data.error) || `Error del servidor (${res.status}).`, res.status);
  }
  return data;
}

function handleUnauthorized() {
  clearToken();
  showLogin('Token inválido o sesión caducada. Vuelve a entrar.');
}

// ---------- formato ----------
const rtf = (() => {
  try { return new Intl.RelativeTimeFormat('es', { numeric: 'auto' }); } catch { return null; }
})();

function relTime(ms) {
  if (ms == null) return 'nunca';
  const diff = (ms - Date.now()) / 1000; // negativo = pasado
  const abs = Math.abs(diff);
  const units = [
    ['year', 31536000], ['month', 2592000], ['week', 604800],
    ['day', 86400], ['hour', 3600], ['minute', 60],
  ];
  if (abs < 45) return 'ahora mismo';
  for (const [u, s] of units) {
    if (abs >= s) {
      const v = Math.round(diff / s);
      return rtf ? rtf.format(v, u) : `hace ${Math.abs(v)} ${u}`;
    }
  }
  const v = Math.round(diff / 60);
  return rtf ? rtf.format(v, 'minute') : `hace ${Math.abs(v)} min`;
}

function absDate(ms) {
  try {
    return new Date(ms).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });
  } catch { return new Date(ms).toISOString(); }
}

const regionNames = (() => {
  try { return new Intl.DisplayNames(['es'], { type: 'region' }); } catch { return null; }
})();
function countryName(code) {
  if (!code || code === 'XX') return 'Desconocido';
  if (code === 'T1') return 'Tor';
  try { return (regionNames && regionNames.of(code)) || code; } catch { return code; }
}

/** Normaliza una URL escrita por el usuario. Devuelve {value} o {error}. */
function normalizeTarget(raw) {
  let v = raw.trim();
  if (v === '') return { value: '' };
  if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) v = `https://${v}`; // "ejemplo.com" → "https://ejemplo.com"
  let u;
  try { u = new URL(v); } catch { return { error: 'URL no válida.' }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { error: 'Solo se permiten URLs http:// o https://.' };
  if (!u.hostname) return { error: 'URL no válida.' };
  if (v.length > 2048) return { error: 'La URL supera los 2048 caracteres.' };
  return { value: v };
}

function slugFile(code) {
  const base = (code.label || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `qr-${code.slug}${base ? '-' + base : ''}`;
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = h('textarea', { readonly: true, style: 'position:fixed;left:-9999px;top:0' });
  ta.value = text;
  document.body.append(ta);
  ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  if (!ok) throw new Error('No se pudo copiar.');
}

// ---------- pantallas ----------
function showLogin(message) {
  $('app').hidden = true;
  $('login').hidden = false;
  state.codes = [];
  $('list').replaceChildren();
  setMsg($('login-msg'), message || '', message ? 'err' : null);
  const input = $('login-token');
  input.value = '';
  input.focus();
}

function showApp() {
  $('login').hidden = true;
  $('app').hidden = false;
  loadCodes();
}

// ---------- contador / creación ----------
function updateCounter() {
  const n = state.codes.length;
  const c = $('counter');
  c.textContent = `${pad2(n)}/${pad2(state.limit)}`;
  const full = n >= state.limit;
  c.classList.toggle('is-full', full);
  const btn = $('create-btn');
  btn.disabled = full || state.loading;
  btn.title = full ? 'Límite alcanzado' : '';
  if (full) setMsg($('create-msg'), `Límite de ${state.limit} códigos alcanzado. Borra uno para crear otro.`, 'err');
  else if ($('create-msg').dataset.limit === '1') setMsg($('create-msg'), '');
  $('create-msg').dataset.limit = full ? '1' : '0';
}

async function loadCodes() {
  state.loading = true;
  const status = $('list-status');
  status.classList.remove('is-err');
  status.textContent = 'Cargando…';
  updateCounter();
  try {
    const data = await api('GET', '/api/codes');
    state.codes = Array.isArray(data && data.codes) ? data.codes : [];
    state.limit = (data && Number(data.limit)) || DEFAULT_LIMIT;
    status.textContent = '';
    renderList();
  } catch (e) {
    if (e.status === 401) return;
    status.textContent = e.message;
    status.classList.add('is-err');
  } finally {
    state.loading = false;
    updateCounter();
  }
}

function renderList() {
  const list = $('list');
  if (state.codes.length === 0) {
    list.replaceChildren(h('li', { class: 'empty', style: 'grid-column:1/-1' }, 'Aún no hay códigos'));
  } else {
    list.replaceChildren(...state.codes.map(renderCard));
  }
  updateCounter();
}

async function onCreate(ev) {
  ev.preventDefault();
  const msg = $('create-msg');
  const labelEl = $('new-label');
  const targetEl = $('new-target');
  const label = labelEl.value.trim();
  const norm = normalizeTarget(targetEl.value);
  if (norm.error) { setMsg(msg, norm.error, 'err'); targetEl.focus(); return; }
  if (label.length > 60) { setMsg(msg, 'La etiqueta admite máximo 60 caracteres.', 'err'); return; }
  if (state.codes.length >= state.limit) { updateCounter(); return; }

  const btn = $('create-btn');
  btn.disabled = true;
  setMsg(msg, 'Creando…');
  try {
    const body = {};
    if (label) body.label = label;
    if (norm.value) body.target = norm.value;
    const code = await api('POST', '/api/codes', body);
    state.codes.unshift(code);
    labelEl.value = '';
    targetEl.value = '';
    renderList();
    setMsg(msg, `Creado: ${code.shortUrl}`, 'ok');
    const first = $('list').querySelector('.target-input');
    if (first && !norm.value) first.focus();
  } catch (e) {
    if (e.status === 401) return;
    setMsg(msg, e.message, 'err');
    if (e.status === 409) loadCodes();
  } finally {
    updateCounter();
  }
}

// ---------- tarjeta ----------
function replaceCode(updated) {
  const i = state.codes.findIndex((c) => c.slug === updated.slug);
  if (i >= 0) state.codes[i] = updated;
}

function renderCard(code) {
  // estado local de la tarjeta
  let current = code;

  const qrBox = h('div', { class: 'qr', role: 'img', 'aria-label': `Código QR de ${code.shortUrl}` });
  const qrState = h('span', { class: 'qr-state', text: 'Sin destino' });
  try {
    qrBox.append(svgNode(qrSvg(code.shortUrl)));
  } catch (e) {
    qrBox.append(h('span', { class: 'qr-state', text: 'Error QR' }));
  }
  qrBox.append(qrState);

  // etiqueta
  const labelId = `label-${code.slug}`;
  const labelInput = h('input', {
    id: labelId, class: 'label-input', type: 'text', maxlength: '60',
    placeholder: 'Sin etiqueta', autocomplete: 'off', 'aria-label': 'Etiqueta',
  });
  labelInput.value = code.label || '';

  const shortLink = h('a', { href: code.shortUrl, target: '_blank', rel: 'noopener noreferrer', text: code.shortUrl });
  const copyBtn = h('button', { type: 'button', class: 'btn btn-sm', text: 'Copiar' });

  const sTotal = h('b');
  const s7 = h('b');
  const sLast = h('b');
  const statsLine = h('p', { class: 'stats-line' },
    h('span', null, 'Total ', sTotal),
    h('span', null, '7 días ', s7),
    h('span', null, 'Último ', sLast));

  // destino
  const targetId = `target-${code.slug}`;
  const targetInput = h('input', {
    id: targetId, class: 'target-input', type: 'url', maxlength: '2048', inputmode: 'url',
    spellcheck: 'false', autocomplete: 'off', placeholder: 'https://… (vacío = sin destino)',
  });
  targetInput.value = code.target || '';
  const saveState = h('span', { class: 'save-state', 'aria-live': 'polite' });
  const saveBtn = h('button', { type: 'submit', class: 'btn', text: 'Guardar' });
  const targetForm = h('form', { class: 'target-form', novalidate: true },
    h('label', { class: 'lbl', for: targetId }, h('span', null, 'URL destino'), saveState),
    targetInput, saveBtn);

  // acciones
  const svgBtn = h('button', { type: 'button', class: 'btn btn-sm', text: 'SVG', title: 'Descargar QR en SVG' });
  const pngBtn = h('button', { type: 'button', class: 'btn btn-sm', text: 'PNG', title: 'Descargar QR en PNG (1024 px)' });
  const statsBtn = h('button', { type: 'button', class: 'btn btn-sm', text: 'Estadísticas', 'aria-expanded': 'false' });
  const delBtn = h('button', { type: 'button', class: 'btn btn-sm', text: 'Borrar' });
  const confirmBox = h('span', { class: 'confirm', hidden: true });
  const actions = h('div', { class: 'actions' }, svgBtn, pngBtn, statsBtn, h('span', { class: 'spacer' }), delBtn, confirmBox);

  const cardMsg = h('p', { class: 'msg card-msg', role: 'status', 'aria-live': 'polite' });
  const detail = h('div', { class: 'detail', hidden: true, id: `detail-${code.slug}` });
  statsBtn.setAttribute('aria-controls', detail.id);

  const card = h('li', { class: 'card', 'data-slug': code.slug },
    h('div', { class: 'card-top' },
      qrBox,
      h('div', { class: 'meta' },
        labelInput,
        h('div', { class: 'short' }, shortLink, copyBtn),
        statsLine)),
    targetForm,
    actions,
    cardMsg,
    detail);

  function paint() {
    const hasTarget = !!current.target;
    qrState.hidden = hasTarget;
    const sc = current.scans || { total: 0, last7d: 0, lastAt: null };
    sTotal.textContent = String(sc.total ?? 0);
    s7.textContent = String(sc.last7d ?? 0);
    sLast.textContent = relTime(sc.lastAt);
    sLast.title = sc.lastAt ? absDate(sc.lastAt) : '';
  }

  function setSave(text, kind) {
    saveState.textContent = text || '';
    saveState.className = 'save-state' + (kind ? ` is-${kind}` : '');
  }

  function markDirty() {
    const dirty = targetInput.value.trim() !== (current.target || '');
    setSave(dirty ? 'Sin guardar' : '', dirty ? 'dirty' : null);
  }

  async function patch(body) {
    const updated = await api('PATCH', `/api/codes/${encodeURIComponent(current.slug)}`, body);
    current = { ...current, ...updated };
    replaceCode(current);
    paint();
    return current;
  }

  // --- guardar destino ---
  targetInput.addEventListener('input', markDirty);
  targetInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      targetInput.value = current.target || '';
      markDirty();
    }
  });
  targetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const norm = normalizeTarget(targetInput.value);
    if (norm.error) { setSave(norm.error, 'err'); targetInput.focus(); return; }
    if (norm.value === (current.target || '')) {
      targetInput.value = norm.value;
      setSave('Sin cambios', null);
      return;
    }
    saveBtn.disabled = true;
    setSave('Guardando…', null);
    try {
      await patch({ target: norm.value });
      targetInput.value = current.target || '';
      setSave(current.target ? 'Guardado ✓' : 'Guardado · sin destino', 'ok');
    } catch (err) {
      if (err.status === 401) return;
      setSave(err.message, 'err');
    } finally {
      saveBtn.disabled = false;
    }
  });

  // --- etiqueta (guarda con Enter o al salir del campo) ---
  labelInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); labelInput.blur(); }
    if (e.key === 'Escape') { labelInput.value = current.label || ''; labelInput.blur(); }
  });
  labelInput.addEventListener('change', async () => {
    const v = labelInput.value.trim();
    if (v === (current.label || '')) { labelInput.value = v; return; }
    setMsg(cardMsg, 'Guardando etiqueta…');
    try {
      await patch({ label: v });
      labelInput.value = current.label || '';
      setMsg(cardMsg, 'Etiqueta guardada.', 'ok');
      setTimeout(() => { if (cardMsg.textContent === 'Etiqueta guardada.') setMsg(cardMsg, ''); }, 2500);
    } catch (err) {
      if (err.status === 401) return;
      setMsg(cardMsg, err.message, 'err');
    }
  });

  // --- copiar ---
  copyBtn.addEventListener('click', async () => {
    try {
      await copyText(current.shortUrl);
      copyBtn.textContent = 'Copiado';
      setTimeout(() => { copyBtn.textContent = 'Copiar'; }, 1500);
    } catch (err) {
      setMsg(cardMsg, err.message || 'No se pudo copiar.', 'err');
    }
  });

  // --- descargas ---
  svgBtn.addEventListener('click', () => {
    try {
      const blob = new Blob([qrSvg(current.shortUrl, 1024)], { type: 'image/svg+xml' });
      download(blob, `${slugFile(current)}.svg`);
    } catch (err) {
      setMsg(cardMsg, err.message, 'err');
    }
  });
  pngBtn.addEventListener('click', async () => {
    pngBtn.disabled = true;
    try {
      const blob = await qrPngBlob(current.shortUrl, 1024);
      download(blob, `${slugFile(current)}.png`);
    } catch (err) {
      setMsg(cardMsg, err.message || 'No se pudo generar el PNG.', 'err');
    } finally {
      pngBtn.disabled = false;
    }
  });

  // --- estadísticas ---
  statsBtn.addEventListener('click', async () => {
    const open = detail.hidden;
    detail.hidden = !open;
    statsBtn.setAttribute('aria-expanded', String(open));
    statsBtn.textContent = open ? 'Ocultar' : 'Estadísticas';
    if (!open) return;
    detail.replaceChildren(h('p', { class: 'msg', text: 'Cargando estadísticas…' }));
    try {
      const stats = await api('GET', `/api/codes/${encodeURIComponent(current.slug)}/stats`);
      if (detail.hidden) return;
      detail.replaceChildren(...renderStats(stats));
      // refresca la línea de resumen con los datos recibidos
      if (stats && typeof stats.total === 'number') {
        current = { ...current, scans: { ...(current.scans || {}), total: stats.total, lastAt: stats.lastAt ?? null } };
        replaceCode(current);
        paint();
      }
    } catch (err) {
      if (err.status === 401) return;
      detail.replaceChildren(h('p', { class: 'msg is-err', text: err.message }));
    }
  });

  // --- borrar (confirmación en dos pasos, sin diálogos) ---
  let confirmTimer = 0;
  function closeConfirm() {
    clearTimeout(confirmTimer);
    confirmBox.hidden = true;
    confirmBox.replaceChildren();
    delBtn.hidden = false;
  }
  delBtn.addEventListener('click', () => {
    const yes = h('button', { type: 'button', class: 'btn btn-sm btn-danger', text: 'Sí, borrar' });
    const no = h('button', { type: 'button', class: 'btn btn-sm', text: 'Cancelar' });
    confirmBox.replaceChildren(h('span', null, '¿Borrar?'), yes, no);
    confirmBox.hidden = false;
    delBtn.hidden = true;
    no.focus();
    confirmTimer = setTimeout(closeConfirm, 8000);
    no.addEventListener('click', () => { closeConfirm(); delBtn.focus(); });
    yes.addEventListener('click', async () => {
      clearTimeout(confirmTimer);
      yes.disabled = true;
      no.disabled = true;
      card.classList.add('is-busy');
      setMsg(cardMsg, 'Borrando…');
      try {
        await api('DELETE', `/api/codes/${encodeURIComponent(current.slug)}`);
        state.codes = state.codes.filter((c) => c.slug !== current.slug);
        renderList();
        setMsg($('create-msg'), `Borrado: ${current.shortUrl}`, 'ok');
      } catch (err) {
        if (err.status === 401) return;
        card.classList.remove('is-busy');
        closeConfirm();
        setMsg(cardMsg, err.message, 'err');
        if (err.status === 404) loadCodes();
      }
    });
  });

  paint();
  return card;
}

function renderStats(stats) {
  const daily = Array.isArray(stats && stats.daily) ? stats.daily : [];
  const countries = Array.isArray(stats && stats.countries) ? stats.countries : [];
  const max = daily.reduce((m, d) => Math.max(m, Number(d.count) || 0), 0);
  const sum30 = daily.reduce((s, d) => s + (Number(d.count) || 0), 0);

  const chart = h('div', {
    class: 'chart', role: 'img',
    'aria-label': `Escaneos por día, últimos ${daily.length} días: ${sum30} en total, máximo ${max} en un día.`,
  });
  chart.style.gridTemplateColumns = `repeat(${Math.max(daily.length, 1)}, minmax(0, 1fr))`;
  for (const d of daily) {
    const n = Number(d.count) || 0;
    const bar = h('div', { class: 'bar-c' + (n === 0 ? ' is-zero' : ''), title: `${d.day}: ${n}` });
    bar.style.height = n === 0 ? '1px' : `${Math.max(4, Math.round((n / (max || 1)) * 100))}%`;
    chart.append(bar);
  }

  const axis = h('div', { class: 'chart-axis' },
    h('span', null, daily.length ? daily[0].day : ''),
    h('span', null, `máx ${max}`),
    h('span', null, daily.length ? daily[daily.length - 1].day : ''));

  const cmax = countries.reduce((m, c) => Math.max(m, Number(c.count) || 0), 0);
  const clist = countries.length
    ? h('ul', { class: 'countries' }, countries.map((c) => {
      const n = Number(c.count) || 0;
      const fill = h('div', { class: 'cfill' });
      fill.style.width = `${cmax ? Math.round((n / cmax) * 100) : 0}%`;
      return h('li', null,
        h('span', { class: 'cname', title: c.country, text: `${c.country} ${countryName(c.country)}` }),
        h('div', { class: 'ctrack', 'aria-hidden': 'true' }, fill),
        h('span', { class: 'cnum', text: String(n) }));
    }))
    : h('p', { class: 'msg', text: 'Sin escaneos todavía.' });

  return [
    h('section', null, h('h2', null, `Últimos 30 días · ${sum30} escaneos`), chart, axis),
    h('section', null, h('h2', null, 'Países'), clist),
  ];
}

// ---------- arranque ----------
function init() {
  $('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const t = $('login-token').value.trim();
    if (!t) { setMsg($('login-msg'), 'Escribe el token.', 'err'); return; }
    setToken(t);
    setMsg($('login-msg'), '');
    showApp();
  });
  $('logout-btn').addEventListener('click', () => { clearToken(); showLogin(); });
  $('reload-btn').addEventListener('click', () => loadCodes());
  $('create-form').addEventListener('submit', onCreate);

  if (getToken()) showApp();
  else showLogin();
}

init();
