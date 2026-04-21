-- ============================================================================
-- Marketing — fix total cobranzas + capitalización nombres propios
-- ============================================================================
-- 1. Recalcula monto de cobranzas NO cobradas usando SUM(facturas.total).
--    Las cobranzas cobradas mantienen su monto histórico (la NC ya se aplicó).
-- 2. Corrige capitalización de nombres propios en mk_facturas.concepto
--    (auto-aplastados por oracionCase antes del fix del polish 1).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Recalcular monto de cobranzas no cobradas
-- ----------------------------------------------------------------------------
UPDATE mk_cobranzas c
   SET monto = sub.monto_correcto
  FROM (
    SELECT
      cb.id AS cobranza_id,
      ROUND(COALESCE(SUM(f.total), 0) * pm.porcentaje / 100, 2) AS monto_correcto
    FROM mk_cobranzas cb
    JOIN mk_proyecto_marcas pm
      ON pm.proyecto_id = cb.proyecto_id AND pm.marca_id = cb.marca_id
    LEFT JOIN mk_facturas f
      ON f.proyecto_id = cb.proyecto_id AND f.anulado_en IS NULL
    WHERE cb.estado IN ('borrador', 'enviada', 'disputada')
      AND cb.anulado_en IS NULL
    GROUP BY cb.id, pm.porcentaje
  ) AS sub
 WHERE c.id = sub.cobranza_id
   AND c.monto <> sub.monto_correcto;

-- ----------------------------------------------------------------------------
-- 2. Capitalización de nombres propios en concepto de facturas vigentes
--    Reemplaza palabra-limitada (\m \M) para evitar sustituciones dentro de
--    otras palabras. Solo actualiza filas que tengan la versión en minúsculas.
-- ----------------------------------------------------------------------------

-- Marcas
UPDATE mk_facturas
   SET concepto = regexp_replace(concepto, '\mtommy\M',    'Tommy',    'gi')
 WHERE concepto ~* '\mtommy\M' AND concepto !~ '\mTommy\M' AND anulado_en IS NULL;

UPDATE mk_facturas
   SET concepto = regexp_replace(concepto, '\mhilfiger\M', 'Hilfiger', 'gi')
 WHERE concepto ~* '\mhilfiger\M' AND concepto !~ '\mHilfiger\M' AND anulado_en IS NULL;

UPDATE mk_facturas
   SET concepto = regexp_replace(concepto, '\mcalvin\M',   'Calvin',   'gi')
 WHERE concepto ~* '\mcalvin\M' AND concepto !~ '\mCalvin\M' AND anulado_en IS NULL;

UPDATE mk_facturas
   SET concepto = regexp_replace(concepto, '\mklein\M',    'Klein',    'gi')
 WHERE concepto ~* '\mklein\M' AND concepto !~ '\mKlein\M' AND anulado_en IS NULL;

UPDATE mk_facturas
   SET concepto = regexp_replace(concepto, '\mreebok\M',   'Reebok',   'gi')
 WHERE concepto ~* '\mreebok\M' AND concepto !~ '\mReebok\M' AND anulado_en IS NULL;

-- Tiendas
UPDATE mk_facturas
   SET concepto = regexp_replace(concepto, '\mcity mall\M',  'City Mall',   'gi')
 WHERE concepto ~* '\mcity mall\M' AND concepto !~ '\mCity Mall\M' AND anulado_en IS NULL;

UPDATE mk_facturas
   SET concepto = regexp_replace(concepto, '\mmultiplaza\M', 'Multiplaza', 'gi')
 WHERE concepto ~* '\mmultiplaza\M' AND concepto !~ '\mMultiplaza\M' AND anulado_en IS NULL;

UPDATE mk_facturas
   SET concepto = regexp_replace(concepto, '\malbrook\M',    'Albrook',    'gi')
 WHERE concepto ~* '\malbrook\M' AND concepto !~ '\mAlbrook\M' AND anulado_en IS NULL;

UPDATE mk_facturas
   SET concepto = regexp_replace(concepto, '\mwestland\M',   'Westland',   'gi')
 WHERE concepto ~* '\mwestland\M' AND concepto !~ '\mWestland\M' AND anulado_en IS NULL;

-- Reparar también mk_proyectos.tienda por si quedaron en minúsculas
UPDATE mk_proyectos
   SET tienda = regexp_replace(tienda, '\mcity mall\M',  'City Mall',  'gi')
 WHERE tienda ~* '\mcity mall\M' AND tienda !~ '\mCity Mall\M';

UPDATE mk_proyectos
   SET tienda = regexp_replace(tienda, '\mmultiplaza\M', 'Multiplaza', 'gi')
 WHERE tienda ~* '\mmultiplaza\M' AND tienda !~ '\mMultiplaza\M';

UPDATE mk_proyectos
   SET tienda = regexp_replace(tienda, '\malbrook\M',    'Albrook',    'gi')
 WHERE tienda ~* '\malbrook\M' AND tienda !~ '\mAlbrook\M';

UPDATE mk_proyectos
   SET tienda = regexp_replace(tienda, '\mwestland\M',   'Westland',   'gi')
 WHERE tienda ~* '\mwestland\M' AND tienda !~ '\mWestland\M';
