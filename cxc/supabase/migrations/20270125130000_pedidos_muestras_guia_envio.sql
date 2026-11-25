-- ═════════════════════════════════════════════════════════════════════════════
-- Despachos › Muestras › N.° de guía o comentario del envío (25-nov-2026,
-- Daniel: OBLIGATORIO al enviar, UNO POR CAJA). Al marcar «Enviada» / «Enviar
-- todas» el vendedor escribe el N.° de guía o un comentario; queda en todas las
-- referencias de esa acción. Bodega lee «Enviada · 123456 · 25-nov».
-- NULL = todavía no se envía (la obligación la pone la pantalla y el servidor).
--
-- 🔑 SOLO AGREGA: columna nueva, NULL para todas las filas existentes.
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE pedidos_muestras
  ADD COLUMN IF NOT EXISTS guia_envio text
  CHECK (guia_envio IS NULL OR (char_length(guia_envio) BETWEEN 1 AND 120));

COMMENT ON COLUMN pedidos_muestras.guia_envio IS
  'N.° de guía o comentario con que el vendedor mandó la muestra (obligatorio al enviar; uno por caja, el mismo en todas las referencias de la misma acción «Enviada»).';
