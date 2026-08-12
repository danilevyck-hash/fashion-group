-- ============================================================================
-- Marketing — PERÍODOS POR PROVEEDOR
--
-- Un período es lo que YA le reportaste a un proveedor. Al cerrarlo se congela
-- (no entran mas documentos), sale el reporte con solo la parte de ESE
-- proveedor, y se abre uno nuevo en cero con el nombre que escriba Daniel.
--
-- LOS PROYECTOS NO SE CIERRAN. Lo que se congela es la parte de ese proveedor
-- dentro de cada proyecto: si un proyecto tiene Tommy (PVH) y Reebok y se
-- cierra PVH, la parte de Reebok sigue viva y se le puede seguir agregando.
-- Por eso el sello es por (documento, proveedor) y no por proyecto.
--
-- ADITIVA. No borra ni una fila, no borra ni una tabla, no toca una sola
-- columna existente. La corre Daniel A MANO y la pantalla FUNCIONA SIN ELLA:
-- sin estas tablas el modulo cae al fallback `grupo_legacy` y muestra
-- exactamente los mismos numeros que hoy.
--
-- ORDEN: PASO 1 es una VISTA PREVIA que no escribe. Si los conteos no dan, se
-- para ahi. PASO 2 crea. PASO 3 siembra. PASO 4 sella lo que ya existe.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PASO 1 — VISTA PREVIA (no escribe nada)
--
-- Tiene que decir, medido el 11-ago-2026 contra produccion:
--   legacy_no_multifashion  -> 59 facturas, 62381.57   (el periodo CERRADO de PVH)
--   legacy_anuladas         -> 14 facturas             (anuladas, no suman)
--   abiertas_con_marca      -> 18 facturas, 22600.00   (el periodo ABIERTO de PVH)
--   entregas_pvh            -> 21 entregas, 70225.00
--   entregas_joybees        ->  1 entrega,   1540.00
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_legacy_n int; v_legacy_t numeric;
  v_legacy_anul int;
BEGIN
  SELECT count(*), COALESCE(sum(f.total), 0) INTO v_legacy_n, v_legacy_t
  FROM mk_facturas f
  JOIN mk_proyectos p ON p.id = f.proyecto_id
  WHERE f.grupo_legacy IS TRUE
    AND f.anulado_en IS NULL
    AND p.anulado_en IS NULL
    AND COALESCE(p.tienda_codigo, '') <> 'D-108'
    AND COALESCE(p.tienda, '') !~* 'multi[[:space:]._-]*fashion';

  SELECT count(*) INTO v_legacy_anul
  FROM mk_facturas f WHERE f.grupo_legacy IS TRUE AND f.anulado_en IS NOT NULL;

  RAISE NOTICE 'VISTA PREVIA — legacy no-multifashion: % facturas, %', v_legacy_n, v_legacy_t;
  RAISE NOTICE 'VISTA PREVIA — legacy anuladas: %', v_legacy_anul;

  IF v_legacy_n <> 59 OR round(v_legacy_t, 2) <> 62381.57 THEN
    RAISE WARNING 'Los numeros NO son los medidos el 11-ago-2026 (59 / 62381.57). Revisar antes de seguir.';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- PASO 2 — las dos tablas
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mk_periodos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'pvh' | 'reebok' | 'joybees'. Vive en src/lib/marketing/proveedores.ts.
  -- Sin CHECK a proposito: sumar un proveedor nuevo no puede exigir una DDL.
  proveedor_key text NOT NULL,
  -- Lo escribe Daniel: "2026", "Temporada 1", lo que sea.
  nombre        text NOT NULL,
  estado        text NOT NULL DEFAULT 'abierto',
  abierto_en    timestamptz NOT NULL DEFAULT now(),
  cerrado_en    timestamptz,
  cerrado_por   text,
  -- El reporte TAL COMO SALIO. Se guarda al cerrar y no se recalcula nunca:
  -- si manana cambia una regla de reparto, el papel que el proveedor ya tiene
  -- en la mano no puede cambiar solo.
  reporte       jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mk_periodos_estado_chk CHECK (estado IN ('abierto', 'cerrado')),
  CONSTRAINT mk_periodos_nombre_chk CHECK (length(btrim(nombre)) > 0)
);

-- UN SOLO periodo abierto por proveedor. Es la invariante del modulo: si
-- hubiera dos, un documento nuevo no sabria en cual entrar.
CREATE UNIQUE INDEX IF NOT EXISTS mk_periodos_uno_abierto_por_proveedor
  ON mk_periodos (proveedor_key) WHERE estado = 'abierto';

CREATE INDEX IF NOT EXISTS mk_periodos_proveedor_idx ON mk_periodos (proveedor_key, estado);

CREATE TABLE IF NOT EXISTS mk_periodo_documentos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_id    uuid NOT NULL REFERENCES mk_periodos(id) ON DELETE CASCADE,
  -- Denormalizado A PROPOSITO: es lo unico que permite el UNIQUE de abajo,
  -- que es la invariante que importa (un documento, un periodo POR PROVEEDOR).
  proveedor_key text NOT NULL,
  tipo          text NOT NULL,
  documento_id  uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mk_periodo_documentos_tipo_chk CHECK (tipo IN ('factura', 'entrega')),
  CONSTRAINT mk_periodo_documentos_unico UNIQUE (tipo, documento_id, proveedor_key)
);

CREATE INDEX IF NOT EXISTS mk_periodo_documentos_periodo_idx
  ON mk_periodo_documentos (periodo_id);

-- `updated_at` con el mismo trigger que ya usa el modulo.
DROP TRIGGER IF EXISTS mk_periodos_touch ON mk_periodos;
CREATE TRIGGER mk_periodos_touch BEFORE UPDATE ON mk_periodos
  FOR EACH ROW EXECUTE FUNCTION mk_touch_updated_at();

ALTER TABLE mk_periodos ENABLE ROW LEVEL SECURITY;
ALTER TABLE mk_periodo_documentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mk_periodos_service ON mk_periodos;
CREATE POLICY mk_periodos_service ON mk_periodos FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS mk_periodo_documentos_service ON mk_periodo_documentos;
CREATE POLICY mk_periodo_documentos_service ON mk_periodo_documentos FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- PASO 3 — los periodos que ya existen de hecho
--
-- "Gastos Tommy y Calvin" deja de ser un caso especial clavado en el codigo y
-- pasa a ser lo que siempre fue: el PRIMER PERIODO CERRADO de PVH.
-- ----------------------------------------------------------------------------
INSERT INTO mk_periodos (proveedor_key, nombre, estado, cerrado_en, cerrado_por)
SELECT 'pvh', 'Gastos Tommy y Calvin', 'cerrado', now(), 'migracion'
WHERE NOT EXISTS (
  SELECT 1 FROM mk_periodos WHERE proveedor_key = 'pvh' AND nombre = 'Gastos Tommy y Calvin'
);

INSERT INTO mk_periodos (proveedor_key, nombre, estado)
SELECT v.k, 'Período 2026', 'abierto'
FROM (VALUES ('pvh'), ('reebok'), ('joybees')) AS v(k)
WHERE NOT EXISTS (
  SELECT 1 FROM mk_periodos p WHERE p.proveedor_key = v.k AND p.estado = 'abierto'
);

-- ----------------------------------------------------------------------------
-- PASO 4 — sellar lo que ya existe
--
-- La regla del sellado hacia atras es EXACTAMENTE la particion que la pantalla
-- ya hace hoy, para que ningun monto se mueva:
--   factura legacy y NO multifashion  -> periodo CERRADO de PVH
--   todo lo demas                     -> el periodo ABIERTO de su proveedor
--
-- Las ANULADAS tambien se sellan: no suman en ningun total (los agregados las
-- filtran antes), pero dejarlas sin sello haria que al restaurarse cayeran en
-- el periodo abierto y aparecieran como gasto nuevo de algo ya reportado.
-- ----------------------------------------------------------------------------

-- 4a — facturas legacy no-multifashion -> periodo cerrado de PVH
INSERT INTO mk_periodo_documentos (periodo_id, proveedor_key, tipo, documento_id)
SELECT per.id, 'pvh', 'factura', f.id
FROM mk_facturas f
JOIN mk_proyectos p ON p.id = f.proyecto_id
JOIN mk_factura_marcas fm ON fm.factura_id = f.id
JOIN mk_marcas m ON m.id = fm.marca_id
CROSS JOIN LATERAL (
  SELECT id FROM mk_periodos
  WHERE proveedor_key = 'pvh' AND nombre = 'Gastos Tommy y Calvin' AND estado = 'cerrado'
  LIMIT 1
) per
WHERE f.grupo_legacy IS TRUE
  AND COALESCE(p.tienda_codigo, '') <> 'D-108'
  AND COALESCE(p.tienda, '') !~* 'multi[[:space:]._-]*fashion'
  AND upper(btrim(m.codigo)) IN ('TH', 'CK', 'KL')
ON CONFLICT (tipo, documento_id, proveedor_key) DO NOTHING;

-- 4b — el resto de las facturas con marca -> el periodo ABIERTO de su proveedor
INSERT INTO mk_periodo_documentos (periodo_id, proveedor_key, tipo, documento_id)
SELECT per.id, per.proveedor_key, 'factura', f.id
FROM mk_facturas f
JOIN mk_factura_marcas fm ON fm.factura_id = f.id
JOIN mk_marcas m ON m.id = fm.marca_id
JOIN LATERAL (
  SELECT pe.id, pe.proveedor_key FROM mk_periodos pe
  WHERE pe.estado = 'abierto'
    AND pe.proveedor_key = CASE upper(btrim(m.codigo))
      WHEN 'TH' THEN 'pvh' WHEN 'CK' THEN 'pvh' WHEN 'KL' THEN 'pvh'
      WHEN 'RBK' THEN 'reebok' WHEN 'J' THEN 'joybees' ELSE NULL END
  LIMIT 1
) per ON TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM mk_periodo_documentos d
  WHERE d.tipo = 'factura' AND d.documento_id = f.id AND d.proveedor_key = per.proveedor_key
)
ON CONFLICT (tipo, documento_id, proveedor_key) DO NOTHING;

-- 4c — entregas de muebles -> el periodo ABIERTO del proveedor de cada marca
-- que aparece en `total_por_marca` con monto POSITIVO. Una clave en 0 significa
-- "esta marca no llevo nada", y sellarla ataria la entrega a un proveedor al
-- que no le corresponde un centavo.
INSERT INTO mk_periodo_documentos (periodo_id, proveedor_key, tipo, documento_id)
SELECT DISTINCT per.id, per.proveedor_key, 'entrega', e.id
FROM mk_entregas_muebles e
JOIN mk_proyectos p ON p.id = e.proyecto_id
CROSS JOIN LATERAL jsonb_each_text(COALESCE(e.total_por_marca, '{}'::jsonb)) AS tpm(marca_id, monto)
JOIN mk_marcas m ON m.id = tpm.marca_id::uuid
JOIN LATERAL (
  SELECT pe.id, pe.proveedor_key FROM mk_periodos pe
  WHERE pe.estado = 'abierto'
    AND pe.proveedor_key = CASE upper(btrim(m.codigo))
      WHEN 'TH' THEN 'pvh' WHEN 'CK' THEN 'pvh' WHEN 'KL' THEN 'pvh'
      WHEN 'RBK' THEN 'reebok' WHEN 'J' THEN 'joybees' ELSE NULL END
  LIMIT 1
) per ON TRUE
WHERE p.anulado_en IS NULL
  AND COALESCE(p.tienda_codigo, '') <> 'D-108'
  AND COALESCE(p.tienda, '') !~* 'multi[[:space:]._-]*fashion'
  AND tpm.monto::numeric > 0
ON CONFLICT (tipo, documento_id, proveedor_key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- PASO 5 — control: los numeros tienen que ser los mismos de siempre
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_cerrado numeric; v_n int;
BEGIN
  SELECT COALESCE(sum(f.total), 0), count(*) INTO v_cerrado, v_n
  FROM mk_periodo_documentos d
  JOIN mk_periodos pe ON pe.id = d.periodo_id AND pe.estado = 'cerrado'
  JOIN mk_facturas f ON f.id = d.documento_id AND d.tipo = 'factura'
  WHERE f.anulado_en IS NULL;

  RAISE NOTICE 'CONTROL — periodo cerrado de PVH: % facturas, % (esperado 59 / 62381.57)', v_n, v_cerrado;
  IF v_n <> 59 OR round(v_cerrado, 2) <> 62381.57 THEN
    RAISE EXCEPTION 'El periodo cerrado NO da 59 / 62381.57 (dio % / %). Se aborta: un monto se movio.', v_n, v_cerrado;
  END IF;
END $$;

COMMENT ON TABLE mk_periodos IS
  'Marketing: lo que ya se le reporto a un proveedor. Un solo abierto por proveedor.';
COMMENT ON TABLE mk_periodo_documentos IS
  'Marketing: sello (documento, proveedor) -> periodo. Se escribe al REGISTRAR el documento.';
