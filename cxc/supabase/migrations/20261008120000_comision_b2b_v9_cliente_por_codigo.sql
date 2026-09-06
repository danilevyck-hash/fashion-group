-- ═════════════════════════════════════════════════════════════════════════════
-- comision_b2b_v9 — MULTI FASHION HOLDING SALE DEL SQL Y ENTRA A LA LISTA,
-- POR CÓDIGO (D-108), CON UN COMODÍN DE «TODOS LOS VENDEDORES».
-- ═════════════════════════════════════════════════════════════════════════════
-- 🩸 EL PROBLEMA (medido contra producción el 5 y 6-sep-2026). La v8 llevaba
-- adentro, en las dos CTE que reparten la plata:
--
--     AND f.cliente          NOT ILIKE '%multi fashion holding%'
--     AND r.cliente_nombre   NOT ILIKE '%multi fashion holding%'
--
-- Ese cliente es **D-108, «Multi Fashion Holding»**, y en 2026 tiene
-- **203 facturas** (fashion_wear 97 · vistana 52 · fashion_shoes 36 ·
-- joystep 7 · active_wear 6 · active_shoes 5) y **21 recibos**. Es la
-- intercompañía, y no debe comisionar. Pero estaba atada a un TEXTO que Switch
-- puede cambiar con una letra: «MULTIFASHION HOLDING» o «Multi-Fashion Holding»
-- y esas 203 facturas empiezan a pagar comisión **en silencio**. Y era la única
-- exclusión de cliente que no se veía en ninguna pantalla.
--
-- Va de frente contra la regla de la casa: **la identidad del cliente es el
-- CÓDIGO, nunca el nombre.** Daniel, 6-sep-2026: «debe de ser por código, ¿no?»
-- → sí.
--
-- 🔴 POR QUÉ UN COMODÍN Y NO UNA FILA POR VENDEDOR. `comision_exclusion` es por
-- (empresa, cliente, VENDEDOR). Medido, a D-108 le venden o le cobran hoy
-- CINCO nombres (DEFAULT · REYNALDO ESPINOSA · EDWIN · DANIEL LEVY ·
-- COLABORADOR), o sea 30 filas para cubrir las 6 empresas. Pero enumerar no
-- cierra el agujero: **el día que un vendedor nuevo le facture, esa factura
-- vuelve a pagar comisión sin que nadie se entere** — exactamente lo que este
-- cambio vino a impedir. Por eso el vendedor `*` significa «todos los de esa
-- empresa». Se eligió `*` y no una palabra («TODOS») porque un texto podría
-- chocar algún día con el nombre real de una persona en Switch.
--
-- 🔴 EL COMODÍN NO MULTIPLICA FILAS. El JOIN sigue siendo LEFT + `ce.id IS NULL`:
-- un documento que cruce con DOS filas de exclusión (la del vendedor y el
-- comodín) produce dos renglones unidos, y los DOS se descartan por `ce.id IS
-- NULL`. Lo que se cuenta es lo que NO cruza, y eso cruza cero o una vez.
--
-- ✅ MEDIDO ANTES DE ESCRIBIR ESTO, con la RPC real contra producción, la
-- comisión por persona y por mes de ene–sep 2026 en las 6 empresas:
--   · v8 (nombre en el SQL)              → 56 pares (vendedor, mes)
--   · v9 simulada (código D-108 + `*`)   → LOS MISMOS 56, al centavo
--   · CONTROL, sin las filas de D-108    → 10 pares cambian (Oficina/DEFAULT
--     los 9 meses y Daniel Levy en abril): la exclusión SÍ hace el trabajo.
--   Script: scripts/_medir-comision-v9-d108.mjs
--
-- La v9 es la v8 **byte a byte** salvo: (1) se van las dos líneas del ILIKE,
-- (2) los cuatro JOIN de exclusión aceptan el comodín, (3) la respuesta dice
-- `'exclusiones', 'cliente_vendedor_o_todos'`. Candado que compara los cuerpos:
-- comision-b2b-v9-por-codigo.test.ts (mismo patrón que comision-alias-v8).
--
-- La v8, la v7, la v6 y la v5 NO se tocan: son la red mientras esta DDL no
-- corra, y mientras no corra los números son los mismos (el nombre sigue
-- filtrando).
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── 1) Las 6 filas de D-108, una por empresa, para TODOS los vendedores ─────
-- Firmadas por la migración, con las dos casillas (venta y cobro): es lo que el
-- SQL hacía por nombre. `ON CONFLICT DO NOTHING` contra el índice parcial de
-- activas, para que repetir la migración no cree una segunda.
INSERT INTO comision_exclusion
  (empresa_key, cliente_codigo, vendedor, activa, excluye_venta, excluye_cobro, creado_por)
SELECT e.k, 'D-108', '*', true, true, true, 'migracion-d108-por-codigo'
FROM (VALUES
  ('vistana'), ('fashion_wear'), ('fashion_shoes'),
  ('active_wear'), ('active_shoes'), ('joystep')
) AS e(k)
ON CONFLICT (empresa_key, cliente_codigo, vendedor) WHERE activa DO NOTHING;

COMMENT ON COLUMN comision_exclusion.vendedor IS
  'Vendedor CANÓNICO (comision_vendedor_canonico), en mayúsculas. Una persona, una fila por '
  'cliente. El valor «*» es el COMODÍN: ese cliente no comisiona para NINGÚN vendedor de esa '
  'empresa (6-sep-2026, D-108 Multi Fashion Holding, que antes se excluía por su nombre dentro '
  'del SQL). Se muestra en pantalla como «Todos los vendedores», nunca como «*».';

-- ─── 2) comision_b2b_v9 ─────────────────────────────────────────────────────
CREATE FUNCTION comision_b2b_v9(p_empresa_key text, p_year int, p_mes int)
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
    'vendedores', COALESCE(v_rows, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION comision_b2b_v9(text, int, int) TO service_role;

COMMENT ON FUNCTION comision_b2b_v9(text, int, int) IS
  'Comisión B2B por empresa y mes = comision_b2b_v8 sin el filtro por NOMBRE de «multi fashion '
  'holding»: ese cliente (D-108) pasó a comision_exclusion por CÓDIGO, con el comodín de vendedor '
  '«*» (todos). Daniel 6-sep-2026: «debe de ser por código, ¿no?». Todo lo demás es la v8 byte a '
  'byte (alias de vendedor, exclusiones con Venta y Cobro por separado, cobro a quien registró el '
  'recibo, NC restan, pct_utilidad > 20). '
  'Candados: comision-b2b-v9-por-codigo.test.ts · comision-alias-v8.test.ts';

-- ─── 3) El detalle mira lo MISMO (paridad tabla ↔ modal) ────────────────────
-- Misma DDL y mismo nombre de función que siempre (CREATE OR REPLACE): el modal
-- tiene que cerrar al centavo con la fila de la tabla, así que los dos cambios
-- van juntos o no van.
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
  'Detalle doc-por-doc de comision_b2b_v9 para UNA persona (alias de vendedor aplicado). Excluye '
  'los (cliente, vendedor) de comision_exclusion (activa) según sus casillas: excluye_venta en '
  'ventas, excluye_cobro en cobros, y el comodín «*» vale para todos los vendedores. Ya no filtra '
  'ningún cliente por su NOMBRE. COBROS: los recibos que esa persona REGISTRÓ. BASE DE COBRO: sin '
  'retenciones (es_retencion = false) y sin mostrador (TCKCTA). '
  'Candados: comision-b2b-v9-por-codigo.test.ts · comision-cobro-sin-retenciones.test.ts';

NOTIFY pgrst, 'reload schema';
