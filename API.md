# QR dinámicos — contrato

Cloudflare Pages (proyecto `qr-ccfjc` → `https://qr-ccfjc.pages.dev`) + Pages Functions + D1 (binding `DB`).
Despliegue por integración Git. Estáticos en `public/` (build output dir), funciones en `functions/`.

## Configuración (dashboard de Pages → Settings)
- Variable cifrada `ADMIN_TOKEN`: token del panel.
- Variable opcional `PUBLIC_BASE_URL` (ej. `https://qr-ccfjc.pages.dev`): base de las URLs cortas. Si falta, se usa el origin de la petición.
- Binding D1 `DB`.

## Modelo (D1)
```sql
codes(slug TEXT PK, label TEXT, target TEXT, created_at INTEGER, updated_at INTEGER)  -- ms epoch
scans(id INTEGER PK AUTOINCREMENT, slug TEXT, ts INTEGER, country TEXT)              -- index (slug, ts)
```
- Máximo **20** códigos.
- `slug`: 6 caracteres de `abcdefghjkmnpqrstuvwxyz23456789`, inmutable (es lo que va impreso en el QR).
- `target` puede ser `""` (QR sin destino). Si no es vacío: URL absoluta `http:`/`https:`, máx. 2048 caracteres.
- `label`: máx. 60 caracteres, puede ser vacío.

## Autenticación
Todas las rutas `/api/*` exigen `Authorization: Bearer <ADMIN_TOKEN>` → si falla, `401 {"error":"unauthorized"}`.
`/r/*` es pública.

## Formato
JSON. Errores: `{"error": "<mensaje en español>"}` con status 400/401/404/409/500.

### Code
```json
{
  "slug": "k7m2qp",
  "label": "Folleto feria",
  "target": "https://ejemplo.com/landing",
  "shortUrl": "https://qr-ccfjc.pages.dev/r/k7m2qp",
  "createdAt": 1760000000000,
  "updatedAt": 1760000000000,
  "scans": { "total": 42, "last7d": 9, "lastAt": 1760000000000 }
}
```
`scans.lastAt` es `null` si nunca se escaneó.

## Endpoints
| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| GET | `/api/codes` | — | `200 {"codes": Code[], "limit": 20}` (orden: `createdAt` desc) |
| POST | `/api/codes` | `{"label"?, "target"?}` | `201 Code` · `409` si ya hay 20 · `400` validación |
| PATCH | `/api/codes/:slug` | `{"label"?, "target"?}` | `200 Code` · `404` · `400` |
| DELETE | `/api/codes/:slug` | — | `204` (borra también sus scans) · `404` |
| GET | `/api/codes/:slug/stats` | — | `200 Stats` · `404` |
| GET | `/r/:slug` | — | ver abajo |

### Stats
```json
{
  "slug": "k7m2qp",
  "total": 42,
  "lastAt": 1760000000000,
  "daily": [{ "day": "2026-10-13", "count": 3 }],
  "countries": [{ "country": "CO", "count": 30 }]
}
```
- `daily`: los últimos **30 días** (UTC), uno por día, incluyendo los días en 0, en orden ascendente.
- `countries`: top 10 por `request.cf.country` (`"XX"` si se desconoce).

### Redirección `/r/:slug`
- Slug existente con `target` → `302 Location: target`, `Cache-Control: no-store`. Registra el scan con `context.waitUntil` (no retrasa la redirección).
- Slug existente sin `target` → `200` página HTML mínima "Este QR aún no tiene destino" (también cuenta el scan).
- Slug inexistente → `404` página HTML mínima.
- Nunca 301 (los navegadores lo cachean y el cambio de destino dejaría de verse).
