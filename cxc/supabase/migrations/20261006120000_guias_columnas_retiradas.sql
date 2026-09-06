-- ═════════════════════════════════════════════════════════════════════════════
-- guia_transporte — cinco columnas RETIRADAS (sin lectores, sin escritores)
-- ═════════════════════════════════════════════════════════════════════════════
-- Daniel, 5-sep-2026: sobre limpiar los restos que ninguna pantalla muestra,
-- «sí»; sobre el estado «Rechazada», «quitarlo».
--
-- Medido contra producción ese día, sobre las 242 guías de TODA la historia:
--   · firma_transportista   → 242 de 242 vacías   (0%)
--   · nombre_entregador     → 242 de 242 vacías   (0%)
--   · cedula_entregador     → 242 de 242 vacías   (0%)
--   · motivo_rechazo        → 0 filas             (el estado nunca se usó)
--   · monto_total           → 0.00 en las 242
-- Ninguna se muestra en ninguna pantalla, y `monto_total` y `nombre_entregador`
-- viajaban al navegador en CADA carga de la lista. El PATCH todavía aceptaba
-- cuatro de las cinco.
--
-- 🔴 NO SE DROPEAN. Es el patrón de la casa (`mayor_lineas`, `cxc_favorites`):
-- se retiran los lectores y los escritores del código, la columna se queda con
-- su COMMENT, y el candado `guias-restos-muertos.test.ts` pone el build ROJO si
-- una migración las borra o si el código vuelve a tocarlas. Dropear una columna
-- no se deshace; dejar de leerla, sí.
--
-- ⚠️ LAS DOS FIRMAS QUE SÍ SE USAN NO SE TOCAN: `firma_base64` y
-- `firma_entregador_base64` están llenas en el 70% de las guías y son lo que el
-- papel imprime. La que se retira es `firma_transportista`, que nunca se
-- escribió — el parecido de los nombres es justamente la trampa.
--
-- ADITIVA en el sentido estricto: esta migración solo escribe comentarios. Cero
-- filas cambian de valor.
-- ═════════════════════════════════════════════════════════════════════════════

COMMENT ON COLUMN guia_transporte.firma_transportista IS
  'RETIRADA 5-sep-2026. Vacía en las 242 guías de la historia; la firma real vive en firma_base64. Sin lectores ni escritores. NO dropear (patrón mayor_lineas) — candado: guias-restos-muertos.test.ts.';
COMMENT ON COLUMN guia_transporte.nombre_entregador IS
  'RETIRADA 5-sep-2026. Vacía en las 242 guías; quien despacha vive en entregado_por. Sin lectores ni escritores. NO dropear — candado: guias-restos-muertos.test.ts.';
COMMENT ON COLUMN guia_transporte.cedula_entregador IS
  'RETIRADA 5-sep-2026. Vacía en las 242 guías; la cédula que se pide es la del receptor (cedula). Sin lectores ni escritores. NO dropear — candado: guias-restos-muertos.test.ts.';
COMMENT ON COLUMN guia_transporte.motivo_rechazo IS
  'RETIRADA 5-sep-2026 con el estado «Rechazada» (Daniel: «quitarlo»). 0 filas en toda la historia. Sin lectores ni escritores. NO dropear — candado: guias-restos-muertos.test.ts.';
COMMENT ON COLUMN guia_transporte.monto_total IS
  'RETIRADA 5-sep-2026. 0.00 en las 242 guías y sin una sola pantalla que la muestre; viajaba al navegador en cada carga de la lista. Sin lectores ni escritores. NO dropear — candado: guias-restos-muertos.test.ts.';
