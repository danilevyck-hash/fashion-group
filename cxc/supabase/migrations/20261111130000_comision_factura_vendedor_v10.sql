-- ═════════════════════════════════════════════════════════════════════════════
-- comision_factura_vendedor + comision_b2b_v10 — CAMBIAR EL VENDEDOR DE UNA
-- FACTURA PARA QUE SU COMISIÓN PASE A OTRO VENDEDOR (11-nov-2026).
-- ═════════════════════════════════════════════════════════════════════════════
-- Decisión de Daniel (11-nov-2026): en Comisiones, desde el detalle de la
-- factura, SOLO el administrador puede pasar la comisión de UNA factura a otro
-- vendedor. Pidió que pasaran venta Y cobro; el cobro NO se puede (ver abajo).
--
-- 🔴 POR QUÉ UNA TABLA APARTE Y NO TOCAR `switch_facturas`. El sync la pisa en
-- cada corrida (upsert por (empresa_key, switch_factura_id)): un cambio escrito
-- ahí dura hasta el próximo cron. La decisión vive en su propia tabla y la RPC
-- la mira con COALESCE(cambio, vendedor de Switch).
--
-- 🔴 LA FACTURA SE IDENTIFICA POR `switch_factura_id`, NO POR EL SECUENCIAL.
-- Medido (migración 20260723120000): Switch REINICIÓ numeraciones y hay 40
-- secuenciales repetidos entre eras dentro de la misma empresa (fashion_wear
-- 13-000000001 existe en 2023 y en 2026). `(empresa_key, switch_factura_id)` es
-- el UNIQUE de switch_facturas; el secuencial se guarda solo para leerlo.
--
-- 🔴 EL COBRO NO SE PUEDE LIGAR A LA FACTURA. `/apireporte/recibos` manda 14
-- campos (medido 22-sep-2026) y NINGUNO dice qué factura pagó: ni número de
-- recibo, ni documento aplicado. `switch_recibos` no tiene llave natural
-- (se reemplaza el mes entero) y el estado de cuenta muestra débito/crédito por
-- documento pero no el cruce. Inventar el enlace (por cliente + monto + fecha)
-- es adivinar plata: NO se hace. El cobro sigue siendo de quien REGISTRÓ el
-- recibo (v6). Si Switch algún día manda el documento aplicado, se agrega.
--
-- SOFT DELETE, NUNCA DELETE (mismo molde que comision_exclusion). Devolver la
-- factura al vendedor de Switch = `activa = false` firmado. Una sola ACTIVA por
-- factura (índice único parcial). RLS: solo service_role; la ruta exige admin.
--
-- comision_b2b_v10 = la v9 BYTE A BYTE salvo el CTE `doc_vendedor`: un LEFT
-- JOIN a comision_factura_vendedor (activa) y el vendedor de la factura es
-- COALESCE(cfv.vendedor, comision_vendedor_canonico(sf.vendedor_nombre)). Las
-- exclusiones se aplican DESPUÉS, sobre el vendedor ya cambiado (es lo que
-- Daniel espera: si el cliente está excluido para el vendedor nuevo, no
-- comisiona). Las notas de crédito tienen su propio switch_factura_id: siguen
-- con su vendedor original salvo que también se cambien. No hay cierre de
-- comisiones: cualquier mes se puede cambiar. La respuesta dice
-- `'vendedor_por_factura', 'aplicado'`. Candado: comision-factura-vendedor-v10.test.ts.
--
-- comision_b2b_detalle (misma DDL, CREATE OR REPLACE) cambia igual y además saca
-- por documento `switch_factura_id` (para que la pantalla sepa qué cambiar) y
-- `vendedor_switch` (el de Switch, SOLO cuando la factura está cambiada; null
-- si no), para el rótulo «Vendedor en Switch: X».
--
-- La v9, v8, v7, v6 y v5 NO se tocan: son la red mientras esta DDL no corra. El
-- interruptor `COMISIONES_CAMBIAR_VENDEDOR_FACTURA` queda en false hasta que
-- la migración esté aplicada.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── 1) La tabla ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comision_factura_vendedor (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_key        text NOT NULL,
  -- Identidad estable de la factura en Switch (switch_facturas.switch_factura_id).
  switch_factura_id  bigint NOT NULL,
  -- Solo para leerlo en el historial: el secuencial se repite entre eras.
  secuencial         text NOT NULL,
  -- Vendedor CANÓNICO (comision_vendedor_canonico), en mayúsculas: a quién pasa.
  vendedor           text NOT NULL,
  -- Soft delete. false = la factura volvió al vendedor de Switch.
  activa             boolean NOT NULL DEFAULT true,
  creado_por         text NOT NULL,
  creado_en          timestamptz NOT NULL DEFAULT now(),
  desactivado_por    text,
  desactivado_en     timestamptz,
  CONSTRAINT comision_factura_vendedor_vendedor_normalizado
    CHECK (vendedor = UPPER(BTRIM(vendedor)) AND vendedor <> ''),
  CONSTRAINT comision_factura_vendedor_secuencial_no_vacio
    CHECK (BTRIM(secuencial) <> ''),
  CONSTRAINT comision_factura_vendedor_desactivacion_firmada
    CHECK (activa OR (desactivado_por IS NOT NULL AND desactivado_en IS NOT NULL))
);

-- Una sola ACTIVA por factura; es también el índice del JOIN de las RPC.
CREATE UNIQUE INDEX IF NOT EXISTS comision_factura_vendedor_activa_unica
  ON comision_factura_vendedor (empresa_key, switch_factura_id)
  WHERE activa;

ALTER TABLE comision_factura_vendedor ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'comision_factura_vendedor' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON comision_factura_vendedor
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Sin DELETE a propósito: devolver = activa = false.
GRANT SELECT, INSERT, UPDATE ON comision_factura_vendedor TO service_role;

-- Lo que entra se canonicaliza solo (mismo trato que comision_exclusion).
CREATE OR REPLACE FUNCTION comision_factura_vendedor_canonicalizar()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.vendedor := UPPER(COALESCE(comision_vendedor_canonico(NEW.vendedor), NEW.vendedor));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comision_factura_vendedor_canonicalizar ON comision_factura_vendedor;
CREATE TRIGGER comision_factura_vendedor_canonicalizar
  BEFORE INSERT OR UPDATE OF vendedor ON comision_factura_vendedor
  FOR EACH ROW EXECUTE FUNCTION comision_factura_vendedor_canonicalizar();

COMMENT ON TABLE comision_factura_vendedor IS
  'La comisión de VENTA de UNA factura pasa a otro vendedor (Daniel, 11-nov-2026; solo admin, '
  'desde el detalle de la factura). La factura se identifica por switch_factura_id (el '
  'secuencial se repite entre eras). Soft delete (activa=false, firmado), nunca DELETE. La '
  'leen comision_b2b_v10 y comision_b2b_detalle con COALESCE(cambio, vendedor de Switch); las '
  'exclusiones se aplican después, sobre el vendedor ya cambiado. El COBRO no se puede ligar '
  'a la factura (Switch no manda qué factura pagó cada recibo) y sigue siendo de quien registró.';
COMMENT ON COLUMN comision_factura_vendedor.vendedor IS
  'Vendedor CANÓNICO (comision_vendedor_canonico), en mayúsculas: a quién pasa la comisión de venta.';
COMMENT ON COLUMN comision_factura_vendedor.switch_factura_id IS
  'switch_facturas.switch_factura_id de esa empresa: la identidad estable de la factura.';

-- ─── 2) comision_b2b_v10 — la v9 con el vendedor de la factura cambiado ──────
CREATE FUNCTION comision_b2b_v10(p_empresa_key text, p_year int, p_mes int)
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
      COALESCE(cfv.vendedor, comision_vendedor_canonico(sf.vendedor_nombre)) AS vendedor_factura
      , UPPER(TRIM(sc.codigo)) AS cliente_codigo
    FROM switch_facturas sf
    LEFT JOIN switch_clientes sc ON sc.empresa_key = sf.empresa_key AND sc.cliente_switch_id = sf.cliente_switch_id
    LEFT JOIN comision_factura_vendedor cfv ON cfv.empresa_key = sf.empresa_key AND cfv.switch_factura_id = sf.switch_factura_id AND cfv.activa = true
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
     AND (ce.vendedor = '*' OR ce.vendedor = UPPER(COALESCE(dv.vendedor_factura, comision_vendedor_canonico(f.vendedor))))
     AND ce.activa = true
     AND ce.excluye_venta = true
    WHERE f.empresa_key = p_empresa_key
      AND ce.id IS NULL
      AND f.fecha BETWEEN v_inicio AND v_fin
      AND COALESCE(dv.vendedor_factura, comision_vendedor_canonico(f.vendedor)) IS NOT NULL
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
     AND (ce.vendedor = '*' OR ce.vendedor = UPPER(comision_vendedor_canonico(r.vendedor_registro)))
     AND ce.activa = true
     AND ce.excluye_cobro = true
    WHERE r.empresa_key = p_empresa_key
      AND ce.id IS NULL
      AND r.fecha BETWEEN v_inicio AND v_fin
      AND r.es_retencion = false
      AND COALESCE(r.cliente_codigo, '') <> 'TCKCTA'
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
    'exclusiones', 'cliente_vendedor_o_todos',
    'alias', 'canonico',
    'vendedor_por_factura', 'aplicado',
    'vendedores', COALESCE(v_rows, '[]'::jsonb)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION comision_b2b_v10(text, int, int) TO service_role;

COMMENT ON FUNCTION comision_b2b_v10(text, int, int) IS
  'Comisión B2B por empresa y mes = comision_b2b_v9 byte a byte, salvo que el vendedor de cada '
  'factura es COALESCE(comision_factura_vendedor.vendedor activa, comision_vendedor_canonico('
  'switch_facturas.vendedor_nombre)). Daniel, 11-nov-2026: cambiar el vendedor de UNA factura. '
  'Las exclusiones se aplican sobre el vendedor ya cambiado. El cobro no cambia (no se puede '
  'ligar el recibo a la factura). Candado: comision-factura-vendedor-v10.test.ts';

-- ─── 3) El detalle mira lo MISMO (paridad tabla ↔ modal) ────────────────────
-- CREATE OR REPLACE con el mismo nombre de siempre: el modal tiene que cerrar al
-- centavo con la fila de la tabla. Saca además `switch_factura_id` y
-- `vendedor_switch` por documento.
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
      COALESCE(cfv.vendedor, comision_vendedor_canonico(sf.vendedor_nombre)) AS vendedor_factura
      , UPPER(TRIM(sc.codigo)) AS cliente_codigo
      , sf.switch_factura_id
      , CASE WHEN cfv.vendedor IS NOT NULL THEN comision_vendedor_canonico(sf.vendedor_nombre) END AS vendedor_switch
    FROM switch_facturas sf
    LEFT JOIN switch_clientes sc ON sc.empresa_key = sf.empresa_key AND sc.cliente_switch_id = sf.cliente_switch_id
    LEFT JOIN comision_factura_vendedor cfv ON cfv.empresa_key = sf.empresa_key AND cfv.switch_factura_id = sf.switch_factura_id AND cfv.activa = true
    WHERE sf.empresa_key = p_empresa_key
      AND sf.fecha >= v_inicio::timestamptz - INTERVAL '2 days'
      AND sf.fecha <  (v_fin + 1)::timestamptz + INTERVAL '2 days'
    ORDER BY sf.secuencial, sf.fecha DESC
  ),
  docs AS (
    SELECT
      f.fecha, f.cliente, f.secuencial, f.tipo_comprobante, f.pct_utilidad,
      dv.switch_factura_id, dv.vendedor_switch,
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
     AND (ce.vendedor = '*' OR ce.vendedor = UPPER(COALESCE(dv.vendedor_factura, comision_vendedor_canonico(f.vendedor))))
     AND ce.activa = true
     AND ce.excluye_venta = true
    WHERE f.empresa_key = p_empresa_key
      AND ce.id IS NULL
      AND f.fecha BETWEEN v_inicio AND v_fin
      AND COALESCE(dv.vendedor_factura, comision_vendedor_canonico(f.vendedor)) = v_vendedor
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
      'pct_utilidad', d.pct_utilidad,
      'switch_factura_id', d.switch_factura_id,
      'vendedor_switch', d.vendedor_switch
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
   AND (ce.vendedor = '*' OR ce.vendedor = UPPER(comision_vendedor_canonico(r.vendedor_registro)))
   AND ce.activa = true
   AND ce.excluye_cobro = true
  WHERE r.empresa_key = p_empresa_key
    AND ce.id IS NULL
    AND r.fecha BETWEEN v_inicio AND v_fin
    AND comision_vendedor_canonico(r.vendedor_registro) = v_vendedor
    AND r.es_retencion = false
    AND COALESCE(r.cliente_codigo, '') <> 'TCKCTA';

  v_ventas_base := COALESCE(v_ventas_base, 0);
  v_cobros_base := COALESCE(v_cobros_base, 0);

  RETURN jsonb_build_object(
    'empresa_key', p_empresa_key, 'year', p_year, 'mes', p_mes, 'vendedor', v_vendedor,
    'regla_cobro', 'quien_registro',
    'exclusiones', 'cliente_vendedor_o_todos',
    'alias', 'canonico',
    'vendedor_por_factura', 'aplicado',
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
  'Detalle doc-por-doc de comision_b2b_v10 para UNA persona (alias de vendedor aplicado y el '
  'vendedor de la factura cambiado por comision_factura_vendedor, si lo hay). Cada venta trae '
  'switch_factura_id y vendedor_switch (el de Switch, solo si la factura está cambiada). Excluye '
  'los (cliente, vendedor) de comision_exclusion (activa) según sus casillas, con el comodín «*». '
  'COBROS: los recibos que esa persona REGISTRÓ, sin retenciones ni mostrador (TCKCTA). '
  'Candados: comision-factura-vendedor-v10.test.ts · comision-b2b-v9-por-codigo.test.ts';

NOTIFY pgrst, 'reload schema';
