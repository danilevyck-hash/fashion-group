-- ═════════════════════════════════════════════════════════════════════════════
-- guias_etiquetas — LAS ETIQUETAS SE HACEN POR ENVÍO (1-oct-2026)
-- ═════════════════════════════════════════════════════════════════════════════
-- Daniel, 1-oct-2026: las etiquetas son POR ENVÍO = empresa + cliente + destino.
-- En la pantalla se marcan VARIAS facturas, cada una con sus bultos y una NOTA
-- opcional; se imprime AL FINAL y la numeración es CORRIDA en el envío: factura
-- A 1–10, B 11–20, C 21–30, todas «de 30». Lo impreso no se cambia: si hay un
-- error se ANULA el envío entero y se hace de nuevo.
--
-- 🔴 COMPATIBLE HACIA ATRÁS. Sigue siendo UNA FILA POR FACTURA y el índice
-- único por factura viva (`guias_etiquetas_factura_viva_unica`) NO se toca.
-- Lo que se agrega son tres columnas:
--   · `envio_id`        — las filas del mismo envío comparten este uuid. Con el
--                         DEFAULT volátil, CADA fila vieja recibe el suyo: cada
--                         etiqueta de antes queda como un envío de UNA factura.
--   · `orden_en_envio`  — en qué orden van las facturas dentro del envío (1, 2,
--                         3…). 🔴 Los RANGOS (1–10, 11–20…) NO se guardan: se
--                         CALCULAN de este orden y de `cajas` (`rangosDelEnvio`).
--                         Guardarlos sería un número que algún día miente.
--   · `nota`            — texto libre corto (≤ 15), opcional; sale en el papel
--                         de ESA factura. NULL = sin nota (nunca cadena vacía).
--
-- 🔴 SIN BORRADO NI REESCRITURA DE DATOS: no hay UPDATE ni DELETE de filas. Las
-- 2 etiquetas vivas de hoy (ids 4 y 10) quedan como dos envíos de una factura.
--
-- ⚠️ El código FALLA ABIERTO sin esta migración: lee `envio_id ?? id`,
-- `orden_en_envio ?? 1` y `nota ?? null`, y un envío de UNA factura sin nota se
-- sigue guardando como siempre. Lo que NO se puede sin ella es un envío de
-- varias facturas o con nota: ahí el servidor contesta 503 y lo dice.
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE guias_etiquetas
  ADD COLUMN IF NOT EXISTS envio_id       uuid     NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS orden_en_envio smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS nota           text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'guias_etiquetas_nota_corta'
  ) THEN
    ALTER TABLE guias_etiquetas
      ADD CONSTRAINT guias_etiquetas_nota_corta
      CHECK (nota IS NULL OR (nota = btrim(nota) AND nota <> '' AND length(nota) <= 15));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'guias_etiquetas_orden_en_envio_positivo'
  ) THEN
    ALTER TABLE guias_etiquetas
      ADD CONSTRAINT guias_etiquetas_orden_en_envio_positivo
      CHECK (orden_en_envio >= 1);
  END IF;
END $$;

-- Para leer y anular un envío de un tirón.
CREATE INDEX IF NOT EXISTS guias_etiquetas_por_envio
  ON guias_etiquetas (envio_id)
  WHERE NOT deleted;

-- 🔴 Dentro de un envío vivo, cada factura tiene SU lugar: dos con el mismo
-- orden harían que la numeración corrida dependa de cómo las devuelve la base.
CREATE UNIQUE INDEX IF NOT EXISTS guias_etiquetas_orden_unico_en_envio
  ON guias_etiquetas (envio_id, orden_en_envio)
  WHERE NOT deleted;

COMMENT ON COLUMN guias_etiquetas.envio_id IS
  'El ENVÍO (empresa + cliente + destino) al que pertenece esta factura. Las '
  'filas del mismo envío se numeran CORRIDO al imprimir (1..N «de N»). Las filas '
  'de antes del 1-oct-2026 quedaron cada una como envío de una factura.';
COMMENT ON COLUMN guias_etiquetas.orden_en_envio IS
  'Orden de la factura dentro del envío. Los rangos (1–10, 11–20…) se CALCULAN '
  'de este orden y de cajas; no se guardan.';
COMMENT ON COLUMN guias_etiquetas.nota IS
  'Nota opcional (≤ 15) que sale en el papel de ESTA factura, entre el destino y '
  'la raya del bulto. NULL = sin nota.';
