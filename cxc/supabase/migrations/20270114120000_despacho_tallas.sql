-- ─────────────────────────────────────────────────────────────────────────────
-- Plantilla Switch › Tallas por bulto — «Excel de tallas por pedido» (13-nov-2026)
--
-- Las tallas, el código de barra y la curva de cada caja que el PROVEEDOR manda
-- en el Excel de despacho (ASW: «<factura>_TXT.xlsx»). Switch no las tiene: el
-- pedido dice «FM0FM05713DW5 · 8 pares», y cuáles tallas son sale de aquí.
--
-- 🔴 Solo lo necesario. Nada del correo ni del archivo se guarda: ni el cuerpo,
-- ni el adjunto, ni costos ni precios. `correo_id` es solo para no cargar dos
-- veces el mismo despacho.
--
-- Grano: una fila por (correo, factura, referencia, caja, talla).
--   cantidad       = pares de esa talla en TODO el despacho de esa caja
--   cajas          = cuántas cajas de esa curva vinieron (CANTIDAD_PREPACK)
--   pares_por_caja = pares de una caja completa (CANTIDAD_ORD_X_PP)
--   → la curva de una caja, por talla, es cantidad ÷ cajas (se calcula al leer).
--
-- `referencia` va como la escribe el proveedor (mayúsculas, sin espacios). Los
-- de niños, ASW los escribe sin el «000» final que sí lleva Switch
-- (TH101074T ↔ TH101074T000): eso se resuelve AL LEER, no se reescribe aquí.
--
-- Aditiva: tabla nueva, nadie más la lee ni la escribe.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.despacho_tallas (
  id              bigint generated always as identity primary key,
  empresa_key     text        not null,
  referencia      text        not null,
  codigo_caja     text        not null,
  talla           text        not null,
  ean             text,
  cantidad        numeric     not null,
  cajas           numeric,
  pares_por_caja  numeric,
  fecha_despacho  date,
  transporte      text,
  factura         text        not null,
  proveedor       text        not null default 'asw',
  correo_id       text        not null,
  creado_en       timestamptz not null default now(),
  constraint despacho_tallas_unico unique (correo_id, factura, referencia, codigo_caja, talla)
);

-- La pantalla busca por empresa + referencia.
create index if not exists despacho_tallas_empresa_referencia_idx
  on public.despacho_tallas (empresa_key, referencia);

alter table public.despacho_tallas enable row level security;
-- Sin políticas: solo el servidor (service_role) lee y escribe.

comment on table public.despacho_tallas is
  'Tallas, código de barra y curva por caja de los Excel de despacho del proveedor (ASW). '
  'La lee Plantilla Switch › Tallas por bulto para armar el Excel de tallas de un pedido. '
  'La escriben la carga del historial y el cron despachos-correo.';
