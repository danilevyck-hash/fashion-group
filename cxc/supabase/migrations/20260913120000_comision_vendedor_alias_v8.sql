-- ═════════════════════════════════════════════════════════════════════════════
-- comision_vendedor_alias + comision_b2b_v8 — UNA PERSONA, UNA FILA, UNA TASA;
-- y las exclusiones distinguen VENTA de COBRO.
-- ═════════════════════════════════════════════════════════════════════════════
-- 🩸 Decisiones de Daniel (3-sep-2026, noche), textual:
--   · «¿por qué hay 4 Reinaldo?» — Switch manda el nombre distinto según la
--     empresa y con errores de tipeo: REINALDO ESPINOSA · REYNALDO ESPINOSA
--     (Active Wear) · REINDALDO ESPINOSA · «REINDALDO ESPINOSA » (espacio al
--     final). Cuatro filas de tasa para la misma persona, y una de ellas con
--     cobro 0 % (un error).
--   · «llámalo Reynaldo y no Reinaldo» — el nombre canónico es REYNALDO
--     ESPINOSA, con Y.
--   · AGUAS y REY STOUTE AGUAS son la misma persona.
--   · «poder quitar comisiones en ventas o comisiones [cobros] sin que tengan
--     que ser de los dos» — las exclusiones ganan dos casillas, Venta y Cobro.
--     «las 11 que ya cargamos quedan con las dos marcadas».
--
-- 1) comision_vendedor_alias (nombre_switch → vendedor_canonico). Todo lo que
--    agrupa por vendedor pasa por aquí primero: la RPC (v8), el detalle (v5),
--    la tabla de tasas, las exclusiones, los descuentos fijos y las pantallas.
--    Se normaliza con UPPER(TRIM()) como ya hacía la v7; lo que NO tiene alias
--    sale como venía (solo recortado), así que para todos los demás la v8 es
--    byte a byte la v7.
-- 2) comision_vendedor_canonico(text): la función que aplica el alias. Un solo
--    lugar; las RPC la llaman en cada CTE.
-- 3) Las 4 filas de tasa de Reinaldo colapsan a UNA (REYNALDO ESPINOSA, 1 % /
--    1 %) y las dos de Aguas a UNA (REY STOUTE AGUAS). Medido antes de escribir
--    esto: la fila «REINDALDO ESPINOSA» con cobro 0 % no cruza con NADA en 2026
--    (sus 41 recibos son de 2023-2024); en 2024 sí: 18 recibos, 32.778,77 de
--    base, que hoy pagan 0 y con la v8 pagarían 1 % (327,79).
-- 4) comision_exclusion: dos columnas booleanas excluye_venta / excluye_cobro
--    (DEFAULT true, CHECK que al menos una sea true), y las 17 filas de Daniel
--    pasan por el alias: las 5 de Active Shoes se renombran a REYNALDO, y en
--    Active Wear las 6 con grafía REINALDO quedan como duplicado de las 6 de
--    REYNALDO → se apagan con soft delete firmado por esta migración (nunca
--    DELETE). Quedan 11 activas = los 11 pares (empresa, cliente) de Daniel.
-- 5) comision_b2b_v8: función NUEVA (la v7 no se toca, como siempre) = la v7
--    con el alias en `doc_vendedor`, `ventas`, `cobros` y `universo`, y con las
--    dos casillas en los JOIN de exclusión (excluye_venta en ventas,
--    excluye_cobro en cobros). El detalle (v5, misma DDL) hace lo mismo.
--
-- Medido sobre ene–sep 2026 antes de aplicar (v7 vs v8, por empresa y
-- vendedor canónico): scripts/_medir-comision-alias-v8.mjs y el post-mortem
-- en docs/postmortems/ventas-referencia.md («una persona, una fila»).
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── 1) La tabla de alias ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comision_vendedor_alias (
  -- El nombre tal como lo manda Switch, YA normalizado (UPPER(TRIM())).
  nombre_switch      text PRIMARY KEY,
  -- La persona. También normalizado; es lo que devuelven las RPC.
  vendedor_canonico  text NOT NULL,
  creado_en          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comision_vendedor_alias_nombre_normalizado
    CHECK (nombre_switch = UPPER(BTRIM(nombre_switch)) AND nombre_switch <> ''),
  CONSTRAINT comision_vendedor_alias_canonico_normalizado
    CHECK (vendedor_canonico = UPPER(BTRIM(vendedor_canonico)) AND vendedor_canonico <> '')
);

CREATE INDEX IF NOT EXISTS comision_vendedor_alias_canonico_idx
  ON comision_vendedor_alias (vendedor_canonico);

ALTER TABLE comision_vendedor_alias ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'comision_vendedor_alias' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON comision_vendedor_alias
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON comision_vendedor_alias TO service_role;

COMMENT ON TABLE comision_vendedor_alias IS
  'Grafías de Switch → persona. Daniel, 3-sep-2026: «¿por qué hay 4 Reinaldo?», '
  '«llámalo Reynaldo y no Reinaldo». Todo lo que agrupa por vendedor (comision_b2b_v8, '
  'comision_b2b_detalle, tasas, exclusiones, descuentos, pantallas, Excel) pasa por '
  'comision_vendedor_canonico() primero: una persona, una fila, una tasa.';

-- Las variantes conocidas (medidas contra switch_facturas y switch_recibos el
-- 3-sep-2026). «REINDALDO ESPINOSA » con espacio final cae en la misma fila que
-- sin espacio porque la llave ya está recortada. Las filas identidad (el
-- canónico apuntando a sí mismo) están a propósito: la tabla dice de un vistazo
-- qué nombres son una sola persona.
INSERT INTO comision_vendedor_alias (nombre_switch, vendedor_canonico) VALUES
  ('REINALDO ESPINOSA',  'REYNALDO ESPINOSA'),
  ('REYNALDO ESPINOSA',  'REYNALDO ESPINOSA'),
  ('REINDALDO ESPINOSA', 'REYNALDO ESPINOSA'),
  ('AGUAS',              'REY STOUTE AGUAS'),
  ('REY STOUTE AGUAS',   'REY STOUTE AGUAS')
ON CONFLICT (nombre_switch) DO UPDATE SET vendedor_canonico = EXCLUDED.vendedor_canonico;

-- ─── 2) La función que aplica el alias ──────────────────────────────────────
-- Sin alias devuelve el nombre SOLO recortado (no en mayúsculas): así «Rodrigo»
-- sigue siendo «Rodrigo» y cruza con su fila de tasa y con sus descuentos, igual
-- que en la v7. Vacío → NULL (misma semántica que NULLIF(TRIM(x), '')).
CREATE OR REPLACE FUNCTION comision_vendedor_canonico(p_nombre text)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT a.vendedor_canonico
       FROM comision_vendedor_alias a
      WHERE a.nombre_switch = UPPER(BTRIM(p_nombre))),
    NULLIF(BTRIM(p_nombre), '')
  );
$$;

GRANT EXECUTE ON FUNCTION comision_vendedor_canonico(text) TO service_role;

COMMENT ON FUNCTION comision_vendedor_canonico(text) IS
  'Nombre de Switch → persona (comision_vendedor_alias). Sin alias, el nombre recortado tal cual.';

-- ─── 3) Tasas: una fila por persona ─────────────────────────────────────────
-- 🩸 «pon a Reinaldo 1 y 1» (3-sep) + «llámalo Reynaldo». La fila canónica
-- queda escrita con la decisión; las grafías se van. Aguas conserva lo que ya
-- tenía (0,5 % / 0,5 %, el default): no hubo decisión sobre su tasa.
INSERT INTO comision_vendedor_tasa (vendedor_nombre, tasa_venta, tasa_cobro, activo, updated_at)
VALUES ('REYNALDO ESPINOSA', 0.0100, 0.0100, true, now())
ON CONFLICT (vendedor_nombre) DO UPDATE
  SET tasa_venta = 0.0100, tasa_cobro = 0.0100, activo = true, updated_at = now();

INSERT INTO comision_vendedor_tasa (vendedor_nombre, tasa_venta, tasa_cobro, activo, updated_at)
SELECT 'REY STOUTE AGUAS', COALESCE(t.tasa_venta, 0.0050), COALESCE(t.tasa_cobro, 0.0050), true, now()
FROM (SELECT 1) x
LEFT JOIN comision_vendedor_tasa t ON t.vendedor_nombre = 'AGUAS'
ON CONFLICT (vendedor_nombre) DO NOTHING;

-- Las grafías que no son la persona se van de la tabla de tasas (es
-- configuración, no historial de plata: la decisión vigente es la fila
-- canónica). Comparación recortada y en mayúsculas para atrapar el espacio final.
DELETE FROM comision_vendedor_tasa t
USING comision_vendedor_alias a
WHERE UPPER(BTRIM(t.vendedor_nombre)) = a.nombre_switch
  AND t.vendedor_nombre <> a.vendedor_canonico;

-- Y de aquí en adelante la tabla no acepta una grafía: lo que se escribe se
-- canonicaliza al entrar (la pantalla ya manda el canónico; esto es el candado
-- de la base).
CREATE OR REPLACE FUNCTION comision_vendedor_tasa_canonicalizar()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.vendedor_nombre := COALESCE(comision_vendedor_canonico(NEW.vendedor_nombre), NEW.vendedor_nombre);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comision_vendedor_tasa_canonicalizar ON comision_vendedor_tasa;
CREATE TRIGGER comision_vendedor_tasa_canonicalizar
  BEFORE INSERT OR UPDATE OF vendedor_nombre ON comision_vendedor_tasa
  FOR EACH ROW EXECUTE FUNCTION comision_vendedor_tasa_canonicalizar();

-- Los descuentos fijos van por nombre de vendedor (UNIQUE (vendedor_nombre,
-- empresa_key, concepto)); se renombran a la persona. Si dos grafías tuvieran
-- el MISMO concepto en la misma empresa, esto revienta a propósito: hay que
-- decidir cuál queda, no sumar dos.
UPDATE comision_descuentos_fijos d
SET vendedor_nombre = a.vendedor_canonico, updated_at = now()
FROM comision_vendedor_alias a
WHERE UPPER(BTRIM(d.vendedor_nombre)) = a.nombre_switch
  AND d.vendedor_nombre <> a.vendedor_canonico;

-- ─── 4) Exclusiones: Venta y Cobro por separado, y por persona ──────────────
-- 🩸 «poder quitar comisiones en ventas o comisiones sin que tengan que ser de
-- los dos». Default true las dos: «las 11 que ya cargamos quedan con las dos
-- marcadas». Una exclusión con las dos apagadas no existe (CHECK): la pantalla
-- no la guarda y lo dice.
ALTER TABLE comision_exclusion ADD COLUMN IF NOT EXISTS excluye_venta boolean NOT NULL DEFAULT true;
ALTER TABLE comision_exclusion ADD COLUMN IF NOT EXISTS excluye_cobro boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'comision_exclusion_excluye_algo'
      AND conrelid = 'comision_exclusion'::regclass
  ) THEN
    ALTER TABLE comision_exclusion
      ADD CONSTRAINT comision_exclusion_excluye_algo CHECK (excluye_venta OR excluye_cobro);
  END IF;
END $$;

COMMENT ON COLUMN comision_exclusion.excluye_venta IS
  'true = ese vendedor no comisiona la VENTA a ese cliente. Daniel, 3-sep-2026: venta y cobro por separado.';
COMMENT ON COLUMN comision_exclusion.excluye_cobro IS
  'true = ese vendedor no comisiona el COBRO a ese cliente (los recibos que registró).';
COMMENT ON COLUMN comision_exclusion.vendedor IS
  'Vendedor CANÓNICO (comision_vendedor_canonico), en mayúsculas. Una persona, una fila por cliente.';

-- 4a) Las filas activas que al pasar por el alias quedarían repetidas se apagan
--     (soft delete FIRMADO por esta migración; nunca DELETE). Gana la fila que
--     ya está escrita con el canónico; si ninguna lo está, la más vieja.
WITH canon AS (
  SELECT
    ce.id,
    row_number() OVER (
      PARTITION BY ce.empresa_key, ce.cliente_codigo, UPPER(comision_vendedor_canonico(ce.vendedor))
      ORDER BY (ce.vendedor = UPPER(comision_vendedor_canonico(ce.vendedor))) DESC, ce.id
    ) AS rn
  FROM comision_exclusion ce
  WHERE ce.activa
)
UPDATE comision_exclusion ce
SET activa = false,
    desactivado_por = 'migracion-alias-v8',
    desactivado_en = now()
FROM canon
WHERE canon.id = ce.id
  AND canon.rn > 1;

-- 4b) Las que quedan activas se escriben con la persona.
UPDATE comision_exclusion ce
SET vendedor = UPPER(comision_vendedor_canonico(ce.vendedor))
WHERE ce.activa
  AND ce.vendedor <> UPPER(comision_vendedor_canonico(ce.vendedor));

-- 4c) Y de aquí en adelante, lo que entra se canonicaliza solo.
CREATE OR REPLACE FUNCTION comision_exclusion_canonicalizar()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.vendedor := UPPER(COALESCE(comision_vendedor_canonico(NEW.vendedor), NEW.vendedor));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comision_exclusion_canonicalizar ON comision_exclusion;
CREATE TRIGGER comision_exclusion_canonicalizar
  BEFORE INSERT OR UPDATE OF vendedor ON comision_exclusion
  FOR EACH ROW EXECUTE FUNCTION comision_exclusion_canonicalizar();

-- ─── 5) comision_b2b_v8 — la v7 con alias y con las dos casillas ────────────
-- Todo lo que no diga «alias»/«canonico»/«excluye_» es la v7 tal cual (candado
-- comision-alias-v8.test.ts compara los dos cuerpos).
CREATE FUNCTION comision_b2b_v8(p_empresa_key text, p_year int, p_mes int)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_inicio date;
  v_fin    date;
  v_rows   jsonb;
BEGIN
  IF p_mes < 1 OR p_mes > 12 THEN RAISE EXCEPTION 'p_mes inválido: %', p_mes; END IF;
  v_inicio := make_date(p_year, p_mes, 1);
  v_fin    := (v_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;

  WITH doc_vendedor AS (
    -- Vendedor del documento según switch_facturas. DISTINCT ON por si algún
    -- secuencial se repitiera dentro de la empresa (gana el más reciente).
    -- v7: también trae el CÓDIGO del cliente, por el puente
    -- switch_facturas.cliente_switch_id → switch_clientes.codigo.
    -- v8: el vendedor pasa por el alias (una persona, una fila).
    SELECT DISTINCT ON (sf.secuencial)
      sf.secuencial,
      comision_vendedor_canonico(sf.vendedor_nombre) AS vendedor_factura
      , UPPER(TRIM(sc.codigo)) AS cliente_codigo
    FROM switch_facturas sf
    LEFT JOIN switch_clientes sc ON sc.empresa_key = sf.empresa_key AND sc.cliente_switch_id = sf.cliente_switch_id
    WHERE sf.empresa_key = p_empresa_key
      AND sf.fecha >= v_inicio::timestamptz - INTERVAL '2 days'
      AND sf.fecha <  (v_fin + 1)::timestamptz + INTERVAL '2 days'
    ORDER BY sf.secuencial, sf.fecha DESC
  ),
  ventas AS (
    -- IDÉNTICO a v7 salvo el alias y la casilla: un documento cuyo (cliente,
    -- vendedor) está excluido PARA LA VENTA no entra en la base de ESE vendedor.
    -- «correcto, también venta» — Daniel, 3-sep-2026.
    SELECT
      COALESCE(dv.vendedor_factura, comision_vendedor_canonico(f.vendedor)) AS vendedor,
      SUM(
        CASE
          WHEN f.tipo_comprobante = 'Nota de Crédito' THEN -ABS(f.subtotal_con_descuento)
          WHEN f.tipo_comprobante = 'Factura' AND f.pct_utilidad > 20 THEN ABS(f.subtotal_con_descuento)
          ELSE 0
        END
      ) AS base
    FROM switch_factura_utilidad f
    LEFT JOIN doc_vendedor dv ON dv.secuencial = f.secuencial
    LEFT JOIN comision_exclusion ce
      ON ce.empresa_key = p_empresa_key
     AND ce.cliente_codigo = dv.cliente_codigo
     AND ce.vendedor = UPPER(COALESCE(dv.vendedor_factura, comision_vendedor_canonico(f.vendedor)))
     AND ce.activa = true
     AND ce.excluye_venta = true
    WHERE f.empresa_key = p_empresa_key
      AND ce.id IS NULL
      AND f.fecha BETWEEN v_inicio AND v_fin
      AND COALESCE(dv.vendedor_factura, comision_vendedor_canonico(f.vendedor)) IS NOT NULL
      AND f.cliente NOT ILIKE '%multi fashion holding%'
      AND UPPER(TRIM(COALESCE(f.cliente, ''))) NOT IN ('VENTAS', 'CONTADO')
    GROUP BY COALESCE(dv.vendedor_factura, comision_vendedor_canonico(f.vendedor))
  ),
  cobros AS (
    -- v6: QUIEN REGISTRÓ EL RECIBO (vendedor_registro), no el dueño de cartera.
    -- v7: y si ese (cliente, quien registró) está excluido, el recibo no
    -- comisiona a nadie — otro vendedor que cobre al mismo cliente sí.
    -- v8: quien registró pasa por el alias, y la exclusión solo aplica si tiene
    -- la casilla de COBRO marcada.
    SELECT
      comision_vendedor_canonico(r.vendedor_registro) AS vendedor,
      SUM(r.total) AS base,
      COUNT(*) AS num_cobros
    FROM switch_recibos r
    LEFT JOIN comision_exclusion ce
      ON ce.empresa_key = p_empresa_key
     AND ce.cliente_codigo = UPPER(TRIM(r.cliente_codigo))
     AND ce.vendedor = UPPER(comision_vendedor_canonico(r.vendedor_registro))
     AND ce.activa = true
     AND ce.excluye_cobro = true
    WHERE r.empresa_key = p_empresa_key
      AND ce.id IS NULL
      AND r.fecha BETWEEN v_inicio AND v_fin
      AND r.es_retencion = false
      AND COALESCE(r.cliente_codigo, '') <> 'TCKCTA'
      AND COALESCE(r.cliente_nombre, '') NOT ILIKE '%multi fashion holding%'
      AND comision_vendedor_canonico(r.vendedor_registro) IS NOT NULL
    GROUP BY comision_vendedor_canonico(r.vendedor_registro)
  ),
  universo AS (
    SELECT comision_vendedor_canonico(v.nombre) AS vendedor
    FROM vendedores v
    JOIN comision_vendedor_tasa t ON t.vendedor_nombre = comision_vendedor_canonico(v.nombre) AND t.activo = true
    WHERE v.empresa_key = p_empresa_key AND v.activo = true
    UNION SELECT vendedor FROM ventas
    UNION SELECT vendedor FROM cobros
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'vendedor', u.vendedor,
      'base', ROUND(COALESCE(vt.base, 0), 2),
      'tasa', COALESCE(t.tasa_venta, 0.0050),
      'comision', ROUND(COALESCE(vt.base, 0) * COALESCE(t.tasa_venta, 0.0050), 2),
      'base_cobro', ROUND(COALESCE(cb.base, 0), 2),
      'tasa_cobro', COALESCE(t.tasa_cobro, 0.0050),
      'comision_cobro', ROUND(COALESCE(cb.base, 0) * COALESCE(t.tasa_cobro, 0.0050), 2),
      -- Suma de componentes YA redondeados (no ROUND de la suma cruda), como v4/v5.
      'comision_total', ROUND(COALESCE(vt.base, 0) * COALESCE(t.tasa_venta, 0.0050), 2)
                      + ROUND(COALESCE(cb.base, 0) * COALESCE(t.tasa_cobro, 0.0050), 2)
    )
    ORDER BY (COALESCE(vt.base, 0) + COALESCE(cb.base, 0)) DESC, u.vendedor ASC
  )
  INTO v_rows
  FROM universo u
  LEFT JOIN ventas vt ON vt.vendedor = u.vendedor
  LEFT JOIN cobros cb ON cb.vendedor = u.vendedor
  LEFT JOIN comision_vendedor_tasa t ON t.vendedor_nombre = u.vendedor;

  RETURN jsonb_build_object(
    'empresa_key', p_empresa_key,
    'year', p_year,
    'mes', p_mes,
    -- Para que la pantalla y los scripts sepan QUÉ regla produjo estas cifras.
    'regla_cobro', 'quien_registro',
    'exclusiones', 'cliente_vendedor',
    'alias', 'canonico',
    'vendedores', COALESCE(v_rows, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION comision_b2b_v8(text, int, int) TO service_role;

COMMENT ON FUNCTION comision_b2b_v8(text, int, int) IS
  'Comisión B2B por empresa y mes = comision_b2b_v7 + alias de vendedor (comision_vendedor_alias: '
  'una persona, una fila, una tasa) + exclusiones con Venta y Cobro por separado (excluye_venta / '
  'excluye_cobro). Daniel 3-sep-2026: «¿por qué hay 4 Reinaldo?», «llámalo Reynaldo», «poder quitar '
  'comisiones en ventas o cobros sin que tengan que ser de los dos». VENTA: vendedor de la factura, '
  'pct_utilidad > 20, NC restan. COBRO: quien registró el recibo. BASE DE COBRO: excluye retenciones '
  '(es_retencion = false), mostrador (TCKCTA) e intercompañía. '
  'Candados: comision-alias-v8.test.ts · comision-cobro-sin-retenciones.test.ts';

-- ─── 6) comision_b2b_detalle v5 — el modal agrupa y excluye lo MISMO ─────────
-- Regla del detalle (desde v2): el modal lista TODO lo que el resumen suma y su
-- total cierra EXACTO con la fila de la tabla. p_vendedor es el nombre CANÓNICO
-- (el que devuelve la v8); si llega una grafía, se canonicaliza al entrar.
-- Verificación al centavo: RUN_DB_TESTS=1 npx vitest run
--   src/__tests__/integration/comisiones-detalle-rpc.test.ts

CREATE OR REPLACE FUNCTION comision_b2b_detalle(
  p_empresa_key text, p_year int, p_mes int, p_vendedor text
)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_inicio date;
  v_fin    date;
  v_vendedor text;
  v_ventas jsonb;
  v_cobros jsonb;
  v_ventas_base numeric;
  v_cobros_base numeric;
  v_tasa_venta numeric;
  v_tasa_cobro numeric;
BEGIN
  IF p_mes < 1 OR p_mes > 12 THEN RAISE EXCEPTION 'p_mes inválido: %', p_mes; END IF;
  v_inicio := make_date(p_year, p_mes, 1);
  v_fin    := (v_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;
  v_vendedor := comision_vendedor_canonico(p_vendedor);

  SELECT t.tasa_venta, t.tasa_cobro INTO v_tasa_venta, v_tasa_cobro
  FROM comision_vendedor_tasa t WHERE t.vendedor_nombre = v_vendedor;
  v_tasa_venta := COALESCE(v_tasa_venta, 0.0050);
  v_tasa_cobro := COALESCE(v_tasa_cobro, 0.0050);

  -- VENTAS — misma atribución, filtros, alias y exclusión que comision_b2b_v8.ventas
  WITH doc_vendedor AS (
    SELECT DISTINCT ON (sf.secuencial)
      sf.secuencial,
      comision_vendedor_canonico(sf.vendedor_nombre) AS vendedor_factura
      , UPPER(TRIM(sc.codigo)) AS cliente_codigo
    FROM switch_facturas sf
    LEFT JOIN switch_clientes sc ON sc.empresa_key = sf.empresa_key AND sc.cliente_switch_id = sf.cliente_switch_id
    WHERE sf.empresa_key = p_empresa_key
      AND sf.fecha >= v_inicio::timestamptz - INTERVAL '2 days'
      AND sf.fecha <  (v_fin + 1)::timestamptz + INTERVAL '2 days'
    ORDER BY sf.secuencial, sf.fecha DESC
  ),
  docs AS (
    SELECT
      f.fecha, f.cliente, f.secuencial, f.tipo_comprobante, f.pct_utilidad,
      CASE
        WHEN f.tipo_comprobante = 'Nota de Crédito' THEN -ABS(f.subtotal_con_descuento)
        WHEN f.tipo_comprobante = 'Factura' AND f.pct_utilidad > 20 THEN ABS(f.subtotal_con_descuento)
        ELSE 0
      END AS aporte
    FROM switch_factura_utilidad f
    LEFT JOIN doc_vendedor dv ON dv.secuencial = f.secuencial
    LEFT JOIN comision_exclusion ce
      ON ce.empresa_key = p_empresa_key
     AND ce.cliente_codigo = dv.cliente_codigo
     AND ce.vendedor = UPPER(COALESCE(dv.vendedor_factura, comision_vendedor_canonico(f.vendedor)))
     AND ce.activa = true
     AND ce.excluye_venta = true
    WHERE f.empresa_key = p_empresa_key
      AND ce.id IS NULL
      AND f.fecha BETWEEN v_inicio AND v_fin
      AND COALESCE(dv.vendedor_factura, comision_vendedor_canonico(f.vendedor)) = v_vendedor
      AND f.cliente NOT ILIKE '%multi fashion holding%'
      AND UPPER(TRIM(COALESCE(f.cliente, ''))) NOT IN ('VENTAS', 'CONTADO')
      AND f.tipo_comprobante IN ('Factura', 'Nota de Crédito')
  )
  SELECT
    jsonb_agg(jsonb_build_object(
      'fecha', d.fecha,
      'cliente', d.cliente,
      'secuencial', d.secuencial,
      'tipo', d.tipo_comprobante,
      'subtotal', d.aporte,
      'pct_utilidad', d.pct_utilidad
    ) ORDER BY d.fecha, d.secuencial),
    SUM(d.aporte)
  INTO v_ventas, v_ventas_base
  FROM docs d;

  -- COBROS — los recibos que ESTA persona registró, con cualquiera de sus
  -- grafías (paridad con comision_b2b_v8.cobros: mismos filtros, mismo alias,
  -- misma casilla de cobro).
  SELECT
    jsonb_agg(jsonb_build_object(
      'fecha', r.fecha,
      'cliente', r.cliente_nombre,
      'monto', r.total
    ) ORDER BY r.fecha),
    SUM(r.total)
  INTO v_cobros, v_cobros_base
  FROM switch_recibos r
  LEFT JOIN comision_exclusion ce
    ON ce.empresa_key = p_empresa_key
   AND ce.cliente_codigo = UPPER(TRIM(r.cliente_codigo))
   AND ce.vendedor = UPPER(comision_vendedor_canonico(r.vendedor_registro))
   AND ce.activa = true
   AND ce.excluye_cobro = true
  WHERE r.empresa_key = p_empresa_key
    AND ce.id IS NULL
    AND r.fecha BETWEEN v_inicio AND v_fin
    AND comision_vendedor_canonico(r.vendedor_registro) = v_vendedor
    AND r.es_retencion = false
    AND COALESCE(r.cliente_codigo, '') <> 'TCKCTA'
    AND COALESCE(r.cliente_nombre, '') NOT ILIKE '%multi fashion holding%';

  v_ventas_base := COALESCE(v_ventas_base, 0);
  v_cobros_base := COALESCE(v_cobros_base, 0);

  RETURN jsonb_build_object(
    'empresa_key', p_empresa_key, 'year', p_year, 'mes', p_mes, 'vendedor', v_vendedor,
    'regla_cobro', 'quien_registro',
    'exclusiones', 'cliente_vendedor',
    'alias', 'canonico',
    'tasa_venta', v_tasa_venta, 'tasa_cobro', v_tasa_cobro,
    'ventas', COALESCE(v_ventas, '[]'::jsonb),
    'cobros', COALESCE(v_cobros, '[]'::jsonb),
    'ventas_base', ROUND(v_ventas_base, 2),
    'cobros_base', ROUND(v_cobros_base, 2),
    'comision_venta', ROUND(v_ventas_base * v_tasa_venta, 2),
    'comision_cobro', ROUND(v_cobros_base * v_tasa_cobro, 2),
    -- Igual que v8: suma de componentes YA redondeados (paridad al centavo).
    'comision_total', ROUND(v_ventas_base * v_tasa_venta, 2)
                    + ROUND(v_cobros_base * v_tasa_cobro, 2)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION comision_b2b_detalle(text, int, int, text) TO service_role;

COMMENT ON FUNCTION comision_b2b_detalle(text, int, int, text) IS
  'Detalle doc-por-doc de comision_b2b_v8 para UNA persona (alias de vendedor aplicado). Excluye '
  'los (cliente, vendedor) de comision_exclusion (activa) según sus casillas: excluye_venta en ventas, '
  'excluye_cobro en cobros. COBROS: los recibos que esa persona REGISTRÓ (switch_recibos.vendedor_registro). '
  'BASE DE COBRO: excluye retenciones de ITBMS (es_retencion = false), el mostrador (TCKCTA) y la '
  'intercompañía. Candados: comision-alias-v8.test.ts · comision-cobro-sin-retenciones.test.ts';

NOTIFY pgrst, 'reload schema';
