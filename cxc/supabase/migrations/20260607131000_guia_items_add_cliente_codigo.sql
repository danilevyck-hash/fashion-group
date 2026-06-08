-- ============================================================================
-- Guías V2 — Ítem 2: vínculo cliente en líneas de guía (cliente_codigo D-XXX)
-- ============================================================================
-- El campo CLIENTE de las líneas pasa de texto libre a typeahead contra el
-- directorio, guardando el código del cliente (D-XXX) en guia_items.cliente_codigo.
-- Aditivo + auto-match de las guías viejas por NOMBRE NORMALIZADO contra
-- clientes_master. Las que no matcheen quedan en NULL ("sin vincular"): no se
-- rompe nada, el texto libre `cliente` se conserva siempre.
--
-- Normalizador canónico (idéntico a clientes_master.nombre_normalized):
--   UPPER + quitar [.,] + colapsar espacios.
--
-- Corre esta migración UNA SOLA VEZ en Supabase SQL Editor.
-- ============================================================================

-- 1. Columna aditiva
ALTER TABLE guia_items
  ADD COLUMN IF NOT EXISTS cliente_codigo text;

-- 2. Backfill auto-match. Solo filas con cliente y sin código aún.
--    El índice UNIQUE parcial de clientes_master.nombre_normalized (deleted=false)
--    garantiza a lo sumo 1 match por nombre → no hay fan-out.
UPDATE guia_items gi
SET cliente_codigo = cm.codigo
FROM clientes_master cm
WHERE cm.deleted = false
  AND cm.codigo IS NOT NULL
  AND gi.cliente_codigo IS NULL
  AND gi.cliente IS NOT NULL
  AND btrim(gi.cliente) <> ''
  AND cm.nombre_normalized =
      regexp_replace(
        regexp_replace(upper(trim(gi.cliente)), '[.,]', '', 'g'),
        '\s+', ' ', 'g'
      );

-- 3. Verificación — cuántas líneas quedaron vinculadas vs sin vincular.
SELECT
  COUNT(*) FILTER (WHERE cliente_codigo IS NOT NULL) AS vinculadas,
  COUNT(*) FILTER (
    WHERE cliente_codigo IS NULL AND cliente IS NOT NULL AND btrim(cliente) <> ''
  ) AS sin_vincular
FROM guia_items;
