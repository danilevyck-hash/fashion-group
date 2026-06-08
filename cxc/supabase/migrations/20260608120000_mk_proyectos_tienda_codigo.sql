-- ============================================================================
-- Marketing PR-D — Ítem 6: vínculo tienda → directorio (tienda_codigo D-XXX)
-- ============================================================================
-- La tienda del proyecto pasa de texto libre a typeahead contra el directorio
-- (clientes_master), guardando el código D-XXX en mk_proyectos.tienda_codigo.
-- `tienda` se conserva como nombre denormalizado para display y para el
-- agrupado "Por Tienda" (que ahora agrupa por código si existe, fallback nombre).
--
-- Aditivo, no destructivo. Auto-match de los proyectos viejos por nombre
-- normalizado (mismo normalizador que clientes_master.nombre_normalized:
-- UPPER + quitar [.,] + colapsar espacios). Los que no matcheen quedan NULL
-- ("sin vincular"); su `tienda` (texto) se conserva intacto.
--
-- Preview del auto-match (8-jun): 3 vinculados / 11 sin vincular de 14.
--
-- Corre esta migración UNA SOLA VEZ en Supabase SQL Editor.
-- ============================================================================

-- 1. Columna aditiva
ALTER TABLE mk_proyectos
  ADD COLUMN IF NOT EXISTS tienda_codigo text;

-- 2. Backfill auto-match. Solo proyectos con tienda y sin código aún.
--    El índice UNIQUE parcial de clientes_master.nombre_normalized (deleted=false)
--    garantiza a lo sumo 1 match por nombre → sin fan-out.
UPDATE mk_proyectos p
SET tienda_codigo = cm.codigo
FROM clientes_master cm
WHERE cm.deleted = false
  AND cm.codigo IS NOT NULL
  AND p.tienda_codigo IS NULL
  AND p.tienda IS NOT NULL
  AND btrim(p.tienda) <> ''
  AND cm.nombre_normalized =
      regexp_replace(
        regexp_replace(upper(trim(p.tienda)), '[.,]', '', 'g'),
        '\s+', ' ', 'g'
      );

-- 3. Verificación — vinculados vs sin vincular.
SELECT
  COUNT(*) FILTER (WHERE tienda_codigo IS NOT NULL) AS vinculados,
  COUNT(*) FILTER (WHERE tienda_codigo IS NULL) AS sin_vincular
FROM mk_proyectos
WHERE anulado_en IS NULL;
