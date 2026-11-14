-- ─────────────────────────────────────────────────────────────────────────────
-- Plantilla Switch › Tallas por bulto — la letra de la curva de Reebok (14-nov-2026)
--
-- El «Packing List Ordenes» de Reebok trae, en la fila de cada cartón, el SKU
-- «100272017-C»: la «C» es la curva de esa caja. El Excel de tallas la muestra
-- como «Opción 1 · C», igual que los códigos de ASW (W1B). Sin letra = NULL.
--
-- Aditiva: una columna nueva, nula, sin valor por defecto.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.despacho_tallas add column if not exists curva text;

comment on column public.despacho_tallas.curva is
  'Reebok: letra de la curva del cartón (SKU «100272017-C» → «C»). NULL si el archivo no la trae.';
