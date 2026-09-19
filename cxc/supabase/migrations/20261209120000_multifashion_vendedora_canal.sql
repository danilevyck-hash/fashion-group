-- ─────────────────────────────────────────────────────────────────────────────
-- MULTIFASHION · EL CANAL DE UN CÓDIGO: «REDES Sheynee» ES SHEYNEE (18-sep-2026)
--
-- Daniel quiere medir cuánto vende Multifashion por redes sociales (WhatsApp e
-- Instagram). Creó en Switch un vendedor aparte, «REDES Sheynee» (código visible
-- 15), y Sheynee Batista es la única que vende por ahí. Su regla, textual:
--
--   «tendría que sumarse ambos vendedores para lo de la comisión ya que sigue
--    siendo la misma persona» · «quiero el sistema limpio y minimalista»
--
-- ── QUÉ HACE ESTA MIGRACIÓN ──────────────────────────────────────────────────
-- 1. `multifashion_vendedora_alias` gana UNA columna, `canal`. El amarre de un
--    código a una persona ya existía (12→3, 13→8, 14→10); el canal es un dato
--    más del MISMO amarre: «el código X es el canal redes de la persona Y».
--    Con `canal` en NULL la fila se comporta exactamente como las tres de hoy.
-- 2. `multifashion_vendedora_canal(codigo)` — la ÚNICA forma de saber el canal
--    de un código. Lo lee de la tabla. 🔴 NUNCA del nombre: buscar «REDES» en el
--    texto sería adivinar por parecido, y esta casa no adivina.
-- 3. La vista `_multifashion_sf_vw` expone `vendedor_canal` (al final).
-- 4. El ranking (`multifashion_vendedoras_v5` y `..._range_v3`) sigue agrupando
--    por `vendedor_canonico` —UNA fila por persona, comisión y tickets JUNTOS—
--    y en esa fila viaja `por_canal`: `{"redes": 1717.73}` solo si un código con
--    canal vendió en el período; NULL para todas las demás. La pantalla lo lee
--    como «tienda $7.400 · redes $1.717».
-- 5. `multifashion_meta_ventas_v2` devuelve el `vendedor_canonico` en vez del
--    texto crudo. 🩸 La v1 devolvía el nombre CRUDO y quien juntaba era
--    `claveVendedora` por NOMBRE normalizado: junta «ANA TREJOS» con «Ana
--    Trejos» de casualidad, pero JAMÁS «REDES Sheynee» con «Sheynee Batista».
--    En la meta grupal viva («Viaje playa», sep–dic 2026) lo de redes habría
--    caído en «ventas de alguien que no está en esta lista».
--
-- ── QUÉ NO CAMBIA ────────────────────────────────────────────────────────────
-- · El bono (`multifashion_bonos_v4`) ya agrupa por `vendedor_canonico`: el total
--   JUNTO decide quién gana. No se toca.
-- · La base de la comisión sigue siendo `subtotal_comision` (solo lo de CONTADO,
--   notas de crédito restando) × 0,5 %. Ni un número del cálculo se movió.
-- · Las v4/v2/v1 se conservan: las rutas caen a ellas mientras esto no corra.
--
-- ── 🔑 EL AMARRE: 15 → 11, canal «redes» ─────────────────────────────────────
-- El id interno de «REDES Sheynee» es 15: lo dice la dirección de su pantalla
-- de edición en Switch (`…/vendedores/editar/15`). ⚠️ El id interno NO siempre
-- coincide con la columna «Código» de esa pantalla: Sheynee Batista se ve con
-- Código 10 y está guardada como id 11 en `switch_facturas` (medido el
-- 18-sep-2026; la 10 es Yeisibeth Muñoz). Acá coinciden por casualidad.
--
-- `nombre_canonico` tiene que ser EXACTAMENTE como Switch escribe el nombre del
-- id 11 (`Sheynee Batista`, medido): es lo que hace que las dos filas caigan en
-- la misma persona. Medido el 18-sep-2026: todavía no hay una sola venta con el
-- 15, así que esta migración NO mueve ni un centavo de comisión, bono ni
-- ranking hasta que la haya.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. LA COLUMNA ────────────────────────────────────────────────────────────
ALTER TABLE public.multifashion_vendedora_alias
  ADD COLUMN IF NOT EXISTS canal text;

-- Lista CERRADA. Hoy el único canal aparte de la tienda es «redes»; uno nuevo
-- entra por migración, con su rótulo en `src/lib/multifashion/canales.ts`.
ALTER TABLE public.multifashion_vendedora_alias
  DROP CONSTRAINT IF EXISTS multifashion_vendedora_alias_canal_conocido;
ALTER TABLE public.multifashion_vendedora_alias
  ADD CONSTRAINT multifashion_vendedora_alias_canal_conocido
  CHECK (canal IS NULL OR canal IN ('redes'));

COMMENT ON COLUMN public.multifashion_vendedora_alias.canal IS
  'NULL = el mismo mostrador (las grafías repetidas). ''redes'' = este código es la venta por redes sociales de la persona canónica. Se escribe a mano; nunca se deduce del nombre.';

-- ── 2. LA FUNCIÓN. Lee la tabla, y SOLO la tabla ─────────────────────────────
CREATE OR REPLACE FUNCTION public.multifashion_vendedora_canal(
  p_codigo integer
) RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT a.canal
    FROM public.multifashion_vendedora_alias a
   WHERE a.activo AND a.codigo_switch = p_codigo AND a.canal IS NOT NULL
   LIMIT 1;
$$;

COMMENT ON FUNCTION public.multifashion_vendedora_canal(integer) IS
  'Multifashion: el canal (''redes'') de un código de Switch, según el amarre escrito a mano. NULL = tienda.';

-- ── EL AMARRE de Sheynee: el 15 es su canal redes ────────────────────────────
-- Se carga por migración, como los otros tres: no hay pantalla para esto.
INSERT INTO public.multifashion_vendedora_alias
  (codigo_switch, codigo_canonico, nombre_switch, nombre_canonico, canal, creado_por)
VALUES
  (15, 11, 'REDES Sheynee', 'Sheynee Batista', 'redes', 'migracion-20261209120000')
ON CONFLICT DO NOTHING;

-- ── 3. LA VISTA gana `vendedor_canal`, AL FINAL ──────────────────────────────
CREATE OR REPLACE VIEW public._multifashion_sf_vw AS
 SELECT 'american_classic'::text AS empresa,
    EXTRACT(year FROM mf_panama_date(fecha))::integer AS anio,
    EXTRACT(month FROM mf_panama_date(fecha))::integer AS mes,
    mf_panama_date(fecha) AS fecha,
    switch_factura_id::text AS n_sistema,
    vendedor_nombre AS vendedor,
    cliente_nombre AS cliente,
        CASE
            WHEN tipo_comprobante = ANY (ARRAY['Factura'::text, 'Tiquete'::text, 'Transacción'::text, 'Nota de Débito'::text]) THEN subtotal_descuento
            WHEN tipo_comprobante = 'Nota de Crédito'::text THEN - subtotal_descuento
            ELSE 0::numeric
        END AS subtotal,
    total::numeric AS total,
    is_wholesale,
    tipo_comprobante,
    1 AS _row,
    fecha AS fecha_ts,
        CASE
            WHEN (tipo_comprobante = ANY (ARRAY['Factura'::text, 'Tiquete'::text, 'Transacción'::text, 'Nota de Débito'::text])) AND condicion_venta = 'Contado'::text THEN subtotal_descuento
            WHEN tipo_comprobante = 'Nota de Crédito'::text THEN - subtotal_descuento
            ELSE 0::numeric
        END AS subtotal_comision,
    vendedor_switch_id AS vendedor_codigo,
    public.multifashion_vendedora_canonica(vendedor_switch_id, vendedor_nombre) AS vendedor_canonico,
    public.multifashion_vendedora_canal(vendedor_switch_id) AS vendedor_canal
   FROM switch_facturas
  WHERE empresa_key = 'american_classic'::text;

-- ── 4. EL RANKING: v5 = v4 + `por_canal`, y NADA MÁS ─────────────────────────
-- Los dos cuerpos son los de la migración 20261009120000 con dos diferencias:
-- el CTE `actual` se arma en dos pasos (por canal y después por persona) y la
-- fila lleva `por_canal`. Sumar sumas parciales da EXACTAMENTE el mismo número
-- (numeric es exacto), así que ventas, tickets y comisión no se mueven.

CREATE OR REPLACE FUNCTION public.multifashion_vendedoras_v5(
  p_year integer, p_periodo text, p_mes integer DEFAULT NULL::integer, p_trimestre integer DEFAULT NULL::integer
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  v_managers jsonb;
  v_actual_inicio date; v_actual_fin_full date;
  v_prev_inicio date;   v_prev_fin_full date;
  v_actual_fin date;    v_prev_fin date;
  v_dia_offset int;
  v_es_parcial boolean;
  v_top_vendedor text;
  v_vendedoras jsonb;
  v_ventas_total numeric; v_tickets_total bigint;
  v_ventas_total_prev numeric; v_tickets_total_prev bigint;
  v_prev_year int; v_prev_month int; v_prev_trim int;
BEGIN
  v_managers := COALESCE(get_app_setting('multifashion_managers'), '[]'::jsonb);

  IF p_periodo = 'mes' THEN
    IF p_mes IS NULL OR p_mes < 1 OR p_mes > 12 THEN RAISE EXCEPTION 'p_mes requerido (1..12)'; END IF;
    v_actual_inicio := make_date(p_year, p_mes, 1);
    v_actual_fin_full := (v_actual_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;
    IF p_mes > 1 THEN v_prev_year := p_year; v_prev_month := p_mes - 1;
    ELSE v_prev_year := p_year - 1; v_prev_month := 12; END IF;
    v_prev_inicio := make_date(v_prev_year, v_prev_month, 1);
    v_prev_fin_full := (v_prev_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;
  ELSIF p_periodo = 'trimestre' THEN
    IF p_trimestre IS NULL OR p_trimestre < 1 OR p_trimestre > 4 THEN RAISE EXCEPTION 'p_trimestre requerido (1..4)'; END IF;
    v_actual_inicio := make_date(p_year, (p_trimestre - 1) * 3 + 1, 1);
    v_actual_fin_full := (v_actual_inicio + INTERVAL '3 months' - INTERVAL '1 day')::date;
    IF p_trimestre > 1 THEN v_prev_year := p_year; v_prev_trim := p_trimestre - 1;
    ELSE v_prev_year := p_year - 1; v_prev_trim := 4; END IF;
    v_prev_inicio := make_date(v_prev_year, (v_prev_trim - 1) * 3 + 1, 1);
    v_prev_fin_full := (v_prev_inicio + INTERVAL '3 months' - INTERVAL '1 day')::date;
  ELSIF p_periodo = 'ytd' THEN
    v_actual_inicio := make_date(p_year, 1, 1);     v_actual_fin_full := make_date(p_year, 12, 31);
    v_prev_inicio   := make_date(p_year - 1, 1, 1); v_prev_fin_full   := make_date(p_year - 1, 12, 31);
  ELSE RAISE EXCEPTION 'p_periodo inválido: % (esperado mes|trimestre|ytd)', p_periodo;
  END IF;

  SELECT MAX(fecha) INTO v_actual_fin FROM _multifashion_sf_vw
  WHERE fecha BETWEEN v_actual_inicio AND v_actual_fin_full;

  v_es_parcial := (CURRENT_DATE BETWEEN v_actual_inicio AND v_actual_fin_full);

  IF v_actual_fin IS NULL THEN
    RETURN jsonb_build_object(
      'vendedoras', '[]'::jsonb, 'total_vendedoras_periodo', 0,
      'ventas_total', 0, 'tickets_total', 0, 'ventas_total_prev', 0, 'tickets_total_prev', 0,
      'fecha_corte', NULL, 'es_periodo_parcial', v_es_parcial,
      'dia_corte_periodo_anterior', NULL, 'dia_corte_anio_anterior', NULL
    );
  END IF;

  IF v_es_parcial THEN v_dia_offset := v_actual_fin - v_actual_inicio;
    v_prev_fin := LEAST(v_prev_inicio + v_dia_offset, v_prev_fin_full);
  ELSE v_actual_fin := v_actual_fin_full; v_prev_fin := v_prev_fin_full; END IF;

  SELECT vendedor_canonico INTO v_top_vendedor
  FROM _multifashion_sf_vw
  WHERE fecha BETWEEN v_actual_inicio AND v_actual_fin
    AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT'
  GROUP BY vendedor_canonico
  ORDER BY SUM(subtotal) DESC LIMIT 1;

  -- Primero por (persona, canal) y después por persona: la persona es UNA fila
  -- y el canal, un desglose adentro de esa fila. `por_canal` solo existe si
  -- algún código con canal vendió en el período; para las demás va NULL.
  WITH por_persona_y_canal AS (
    SELECT vendedor_canonico AS vendedor, vendedor_canal AS canal,
      SUM(subtotal) AS ventas, COUNT(*) AS tickets,
      SUM(subtotal_comision) AS base_comision
    FROM _multifashion_sf_vw
    WHERE fecha BETWEEN v_actual_inicio AND v_actual_fin
      AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT'
    GROUP BY vendedor_canonico, vendedor_canal
  ),
  actual AS (
    SELECT vendedor,
      SUM(ventas) AS ventas, SUM(tickets)::bigint AS tickets,
      SUM(base_comision) AS base_comision,
      jsonb_object_agg(canal, ventas) FILTER (WHERE canal IS NOT NULL) AS por_canal
    FROM por_persona_y_canal
    GROUP BY vendedor
  ),
  prev AS (
    SELECT vendedor_canonico AS vendedor,
      SUM(subtotal) AS ventas, COUNT(*) AS tickets
    FROM _multifashion_sf_vw
    WHERE fecha BETWEEN v_prev_inicio AND v_prev_fin
      AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT'
    GROUP BY vendedor_canonico
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'nombre', a.vendedor, 'tickets', a.tickets, 'ventas', a.ventas,
      'ticket_promedio', CASE WHEN a.tickets > 0 THEN a.ventas / a.tickets ELSE 0 END,
      'comision', a.base_comision * 0.005,
      'por_canal', a.por_canal,
      'manager', v_managers ? a.vendedor,
      'top', (a.vendedor = v_top_vendedor),
      'delta_ventas_pct',  CASE WHEN COALESCE(p.ventas, 0) > 0 THEN (a.ventas - p.ventas) / p.ventas ELSE NULL END,
      'delta_tickets_pct', CASE WHEN COALESCE(p.tickets, 0) > 0 THEN (a.tickets - p.tickets)::numeric / p.tickets ELSE NULL END
    ) ORDER BY a.ventas DESC
  )
  INTO v_vendedoras
  FROM actual a LEFT JOIN prev p ON p.vendedor = a.vendedor;

  SELECT COALESCE(SUM(subtotal), 0), COUNT(*)
  INTO v_ventas_total, v_tickets_total
  FROM _multifashion_sf_vw
  WHERE fecha BETWEEN v_actual_inicio AND v_actual_fin
    AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT';

  SELECT COALESCE(SUM(subtotal), 0), COUNT(*)
  INTO v_ventas_total_prev, v_tickets_total_prev
  FROM _multifashion_sf_vw
  WHERE fecha BETWEEN v_prev_inicio AND v_prev_fin
    AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT';

  RETURN jsonb_build_object(
    'vendedoras', COALESCE(v_vendedoras, '[]'::jsonb),
    'total_vendedoras_periodo', jsonb_array_length(COALESCE(v_vendedoras, '[]'::jsonb)),
    'ventas_total', v_ventas_total, 'tickets_total', v_tickets_total,
    'ventas_total_prev', v_ventas_total_prev, 'tickets_total_prev', v_tickets_total_prev,
    'fecha_corte', to_char(v_actual_fin, 'YYYY-MM-DD'),
    'es_periodo_parcial', v_es_parcial,
    'dia_corte_periodo_anterior', to_char(v_prev_fin, 'YYYY-MM-DD'),
    'dia_corte_anio_anterior',    to_char(v_prev_fin, 'YYYY-MM-DD')
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.multifashion_vendedoras_range_v3(
  p_year integer, p_fin_mes integer, p_n_meses integer
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  v_managers jsonb;
  v_fin_mes_inicio date; v_actual_fin_full date; v_actual_inicio date; v_actual_fin date;
  v_prev_inicio date; v_prev_fin date; v_prev_fin_full date;
  v_es_parcial boolean; v_dia_offset int;
  v_top_vendedor text;
  v_vendedoras jsonb;
  v_ventas_total numeric; v_tickets_total bigint;
  v_ventas_total_prev numeric; v_tickets_total_prev bigint;
BEGIN
  IF p_n_meses NOT IN (3, 6, 12) THEN RAISE EXCEPTION 'p_n_meses debe ser 3, 6 o 12'; END IF;
  IF p_fin_mes < 1 OR p_fin_mes > 12 THEN RAISE EXCEPTION 'p_fin_mes requerido (1..12)'; END IF;

  v_fin_mes_inicio  := make_date(p_year, p_fin_mes, 1);
  v_actual_fin_full := (v_fin_mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;
  v_actual_inicio   := (v_fin_mes_inicio - ((p_n_meses - 1) || ' months')::interval)::date;

  v_es_parcial := (CURRENT_DATE BETWEEN v_fin_mes_inicio AND v_actual_fin_full);
  IF v_es_parcial THEN
    SELECT COALESCE(MAX(fecha), v_fin_mes_inicio) INTO v_actual_fin
    FROM _multifashion_sf_vw
    WHERE fecha BETWEEN v_actual_inicio AND LEAST(v_actual_fin_full, CURRENT_DATE);
  ELSE
    v_actual_fin := v_actual_fin_full;
  END IF;

  v_prev_inicio   := (v_actual_inicio - INTERVAL '1 year')::date;
  v_prev_fin_full := (v_fin_mes_inicio - INTERVAL '1 year' + INTERVAL '1 month' - INTERVAL '1 day')::date;
  IF v_es_parcial THEN
    v_dia_offset := v_actual_fin - v_actual_inicio;
    v_prev_fin := LEAST(v_prev_inicio + v_dia_offset, v_prev_fin_full);
  ELSE
    v_prev_fin := v_prev_fin_full;
  END IF;

  v_managers := COALESCE(get_app_setting('multifashion_managers'), '[]'::jsonb);

  SELECT vendedor_canonico INTO v_top_vendedor
  FROM _multifashion_sf_vw
  WHERE fecha BETWEEN v_actual_inicio AND v_actual_fin
    AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT'
  GROUP BY vendedor_canonico
  ORDER BY SUM(subtotal) DESC LIMIT 1;

  -- Primero por (persona, canal) y después por persona: la persona es UNA fila
  -- y el canal, un desglose adentro de esa fila. `por_canal` solo existe si
  -- algún código con canal vendió en el período; para las demás va NULL.
  WITH por_persona_y_canal AS (
    SELECT vendedor_canonico AS vendedor, vendedor_canal AS canal,
      SUM(subtotal) AS ventas, COUNT(*) AS tickets,
      SUM(subtotal_comision) AS base_comision
    FROM _multifashion_sf_vw
    WHERE fecha BETWEEN v_actual_inicio AND v_actual_fin
      AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT'
    GROUP BY vendedor_canonico, vendedor_canal
  ),
  actual AS (
    SELECT vendedor,
      SUM(ventas) AS ventas, SUM(tickets)::bigint AS tickets,
      SUM(base_comision) AS base_comision,
      jsonb_object_agg(canal, ventas) FILTER (WHERE canal IS NOT NULL) AS por_canal
    FROM por_persona_y_canal
    GROUP BY vendedor
  ),
  prev AS (
    SELECT vendedor_canonico AS vendedor,
      SUM(subtotal) AS ventas, COUNT(*) AS tickets
    FROM _multifashion_sf_vw
    WHERE fecha BETWEEN v_prev_inicio AND v_prev_fin
      AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT'
    GROUP BY vendedor_canonico
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'nombre', a.vendedor, 'tickets', a.tickets, 'ventas', a.ventas,
      'ticket_promedio', CASE WHEN a.tickets > 0 THEN a.ventas / a.tickets ELSE 0 END,
      'comision', a.base_comision * 0.005,
      'por_canal', a.por_canal,
      'manager', v_managers ? a.vendedor,
      'top', (a.vendedor = v_top_vendedor),
      'delta_ventas_pct',  CASE WHEN COALESCE(p.ventas, 0) > 0 THEN (a.ventas - p.ventas) / p.ventas ELSE NULL END,
      'delta_tickets_pct', CASE WHEN COALESCE(p.tickets, 0) > 0 THEN (a.tickets - p.tickets)::numeric / p.tickets ELSE NULL END
    ) ORDER BY a.ventas DESC
  )
  INTO v_vendedoras
  FROM actual a LEFT JOIN prev p ON p.vendedor = a.vendedor;

  SELECT COALESCE(SUM(subtotal), 0), COUNT(*) INTO v_ventas_total, v_tickets_total
  FROM _multifashion_sf_vw
  WHERE fecha BETWEEN v_actual_inicio AND v_actual_fin
    AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT';

  SELECT COALESCE(SUM(subtotal), 0), COUNT(*) INTO v_ventas_total_prev, v_tickets_total_prev
  FROM _multifashion_sf_vw
  WHERE fecha BETWEEN v_prev_inicio AND v_prev_fin
    AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT';

  RETURN jsonb_build_object(
    'vendedoras', COALESCE(v_vendedoras, '[]'::jsonb),
    'total_vendedoras_periodo', jsonb_array_length(COALESCE(v_vendedoras, '[]'::jsonb)),
    'ventas_total', v_ventas_total, 'tickets_total', v_tickets_total,
    'ventas_total_prev', v_ventas_total_prev, 'tickets_total_prev', v_tickets_total_prev,
    'fecha_corte', to_char(v_actual_fin, 'YYYY-MM-DD'),
    'es_periodo_parcial', v_es_parcial,
    'dia_corte_periodo_anterior', to_char(v_prev_fin, 'YYYY-MM-DD'),
    'dia_corte_anio_anterior',    to_char(v_prev_fin, 'YYYY-MM-DD'),
    'ventana_inicio', to_char(v_actual_inicio, 'YYYY-MM-DD'),
    'n_meses', p_n_meses
  );
END;
$function$;

-- ── 5. METAS: el canónico en vez del crudo ───────────────────────────────────
-- Igual a la v1 (20260813170000) salvo la primera columna. `DEFAULT` sigue
-- saliendo como «DEFAULT» (no tiene amarre) y `claveVendedora` lo sigue
-- excluyendo en TypeScript, como siempre.
CREATE OR REPLACE FUNCTION public.multifashion_meta_ventas_v2(
  p_desde date,
  p_hasta date
)
RETURNS TABLE (
  vendedor    text,
  mes         text,
  ventas      numeric,
  documentos  bigint,
  ultima      date
)
LANGUAGE sql
STABLE
AS $fn$
  SELECT
    COALESCE(v.vendedor_canonico, '') AS vendedor,
    to_char(v.fecha, 'YYYY-MM')       AS mes,
    SUM(v.subtotal)::numeric          AS ventas,
    COUNT(*)::bigint                  AS documentos,
    MAX(v.fecha)::date                AS ultima
  FROM _multifashion_sf_vw v
  WHERE v.is_wholesale = false
    AND v.fecha >= p_desde
    AND v.fecha <= p_hasta
  GROUP BY 1, 2
$fn$;

GRANT EXECUTE ON FUNCTION public.multifashion_vendedora_canal(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.multifashion_vendedoras_v5(integer, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.multifashion_vendedoras_range_v3(integer, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.multifashion_meta_ventas_v2(date, date) TO service_role;

COMMIT;
