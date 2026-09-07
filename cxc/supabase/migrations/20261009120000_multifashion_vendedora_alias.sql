-- ─────────────────────────────────────────────────────────────────────────────
-- MULTIFASHION · LAS VENDEDORAS CON DOS CÓDIGOS SE JUNTAN (6-sep-2026)
--
-- 🩸 EL HECHO, medido contra producción (`switch_facturas`, american_classic):
--
--   persona            código   documentos   subtotal      ventana
--   Ana Trejos            3        3.564    188.480,89     1-jun-2024 → 18-abr-2026
--   ANA TREJOS           12           37      1.786,77    20-jun-2026 → 21-jul-2026
--   Cindy De Gracia       8          279     13.120,79    12-nov-2025 → 11-ago-2026
--   CINDY DE GRACIA      13           37      1.607,98    20-jun-2026 → 21-jul-2026
--   Yeisibeth Muñoz      10          386     18.883,41    12-nov-2025 → 21-feb-2026
--   YEISIBETH MUÑOZ      14           47      2.042,21    20-jun-2026 → 29-jun-2026
--
-- El 20 de junio de 2026 alguien CREÓ TRES VENDEDORAS NUEVAS en Switch en vez de
-- usar las que ya existían. Son **$5.436,96 en 121 documentos** que, en la vista
-- de 12 meses, aparecen al fondo del ranking como si fueran tres personas más.
--
-- 🔑 LA IDENTIDAD ES EL CÓDIGO. Es la misma regla que el resto del sistema:
-- `clientes_master` se une por `codigo` y nunca por nombre, y las comisiones del
-- grupo colapsan las grafías de Switch con `comision_vendedor_alias`. Acá el
-- amarre es **código → código**, no nombre → nombre: dos personas pueden
-- llamarse igual, pero dos códigos distintos son dos filas distintas y el
-- amarre lo escribe una persona, no un parecido.
--
-- ⚠️ ESTO NO CAMBIA NINGÚN TOTAL. Juntar dos filas del ranking reparte la MISMA
-- suma entre menos renglones: la venta del mes, la del año, los tiquetes y la
-- comisión total quedan idénticos al centavo. Lo que cambia es cuántas filas se
-- ven y cuánto le toca a cada una.
--
-- ⚠️ Y NO ARREGLA LA DIFERENCIA ENTRE EL TOTAL DE VENDEDORAS Y EL DEL MES. Esa
-- diferencia es `DEFAULT` (el marcador de Switch para «sin vendedor»), que las
-- RPC excluyen a propósito: medido el 6-sep-2026, septiembre vale $10.867,09 en
-- total y $10.570,66 sumando vendedoras — los $296,43 que faltan son DEFAULT, no
-- estos tres códigos. Ver la nota de la pantalla.
--
-- ── SOFT DELETE, NUNCA DELETE ────────────────────────────────────────────────
-- Un amarre que se retira se APAGA (`activo = false`) con quién y cuándo. Es
-- historial: haber juntado dos códigos durante un año explica los números de ese
-- año. El índice único es solo entre los ACTIVOS.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS public.multifashion_vendedora_alias (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- El código repetido que manda Switch (12, 13, 14).
  codigo_switch     integer NOT NULL,
  -- El código de la MISMA persona que ya existía (3, 8, 10).
  codigo_canonico   integer NOT NULL,
  -- Las grafías, solo para poder leer la tabla sin cruzarla con nada.
  nombre_switch     text    NOT NULL,
  nombre_canonico   text    NOT NULL,
  activo            boolean NOT NULL DEFAULT true,
  creado_por        text    NOT NULL DEFAULT 'migracion-20261009120000',
  creado_en         timestamptz NOT NULL DEFAULT now(),
  desactivado_por   text,
  desactivado_en    timestamptz,
  CONSTRAINT multifashion_vendedora_alias_no_a_si_mismo
    CHECK (codigo_switch <> codigo_canonico)
);

COMMENT ON TABLE public.multifashion_vendedora_alias IS
  'Multifashion: dos códigos de Switch que son la MISMA vendedora. Amarre código → código, escrito a mano. Soft delete (activo=false), nunca DELETE.';

-- Única entre ACTIVAS: un código no puede apuntar a dos personas a la vez, pero
-- los amarres retirados se quedan.
CREATE UNIQUE INDEX IF NOT EXISTS multifashion_vendedora_alias_activa_uq
  ON public.multifashion_vendedora_alias (codigo_switch)
  WHERE activo;

ALTER TABLE public.multifashion_vendedora_alias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS multifashion_vendedora_alias_service ON public.multifashion_vendedora_alias;
CREATE POLICY multifashion_vendedora_alias_service
  ON public.multifashion_vendedora_alias
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Los tres amarres medidos. Se cargan por migración, como los de comisiones:
-- no hay pantalla para esto y no debería haberla hasta que Daniel la pida.
INSERT INTO public.multifashion_vendedora_alias
  (codigo_switch, codigo_canonico, nombre_switch, nombre_canonico)
VALUES
  (12,  3, 'ANA TREJOS',      'Ana Trejos'),
  (13,  8, 'CINDY DE GRACIA', 'Cindy De Gracia'),
  (14, 10, 'YEISIBETH MUÑOZ', 'Yeisibeth Muñoz')
ON CONFLICT DO NOTHING;

-- ── LA FUNCIÓN. UNA sola, y la usan TODAS las superficies ────────────────────
-- Con amarre activo devuelve el nombre de la persona; sin amarre, el nombre tal
-- como viene, solo recortado y con los espacios colapsados — exactamente lo que
-- hacían las RPC antes (`REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g')`), así
-- que para todo el que NO tiene alias no cambia ni un carácter.
--
-- LANGUAGE sql + STABLE para que Postgres la pueda inlinear dentro de la vista.
CREATE OR REPLACE FUNCTION public.multifashion_vendedora_canonica(
  p_codigo integer,
  p_nombre text
) RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (SELECT a.nombre_canonico
       FROM public.multifashion_vendedora_alias a
      WHERE a.activo AND a.codigo_switch = p_codigo
      LIMIT 1),
    REGEXP_REPLACE(TRIM(COALESCE(p_nombre, '')), '\s+', ' ', 'g')
  );
$$;

COMMENT ON FUNCTION public.multifashion_vendedora_canonica(integer, text) IS
  'Multifashion: la persona detrás de un (código, nombre) de Switch. Único lugar donde se resuelve el amarre.';

-- ── LA VISTA gana el código y el nombre canónico ─────────────────────────────
-- Las columnas nuevas van AL FINAL: `CREATE OR REPLACE VIEW` lo exige. El resto
-- del cuerpo es idéntico al de producción, carácter por carácter.
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
    public.multifashion_vendedora_canonica(vendedor_switch_id, vendedor_nombre) AS vendedor_canonico
   FROM switch_facturas
  WHERE empresa_key = 'american_classic'::text;

-- ── LAS RPC. v4 = v3 con el amarre puesto, y NADA MÁS ────────────────────────
-- Cada `REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g')` pasa a ser
-- `vendedor_canonico`, que para quien no tiene amarre vale EXACTAMENTE lo mismo.
-- El resto del cuerpo no se toca: mismos rangos, mismos filtros, mismo DEFAULT
-- excluido, misma comisión de 0,5% sobre `subtotal_comision`.

CREATE OR REPLACE FUNCTION public.multifashion_vendedoras_v4(
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

  WITH actual AS (
    SELECT vendedor_canonico AS vendedor,
      SUM(subtotal) AS ventas, COUNT(*) AS tickets,
      SUM(subtotal_comision) AS base_comision
    FROM _multifashion_sf_vw
    WHERE fecha BETWEEN v_actual_inicio AND v_actual_fin
      AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT'
    GROUP BY vendedor_canonico
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

CREATE OR REPLACE FUNCTION public.multifashion_vendedoras_range_v2(
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

  WITH actual AS (
    SELECT vendedor_canonico AS vendedor,
      SUM(subtotal) AS ventas, COUNT(*) AS tickets, SUM(subtotal_comision) AS base_comision
    FROM _multifashion_sf_vw
    WHERE fecha BETWEEN v_actual_inicio AND v_actual_fin
      AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT'
    GROUP BY vendedor_canonico
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

CREATE OR REPLACE FUNCTION public.multifashion_bonos_v4(
  p_year integer, p_mes integer DEFAULT NULL::integer
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  v_managers  jsonb;
  v_fecha_max date;

  v_ult_mes_fin date;
  v_ult_year    int;
  v_ult_mes     int;

  v_year        int := p_year;
  v_mes         int;
  v_mes_inicio  date;
  v_mes_fin     date;
  v_prev_inicio date;
  v_prev_fin    date;
  v_elegible    boolean;

  v_ventas_tienda      numeric;
  v_ventas_tienda_prev numeric;
  v_tiene_comp_ger     boolean;
  v_delta_ger          numeric;
  v_bono_ger           int;
  v_gerente_nombre     text;

  v_vendedoras jsonb;
BEGIN
  v_managers := COALESCE(get_app_setting('multifashion_managers'), '[]'::jsonb);

  SELECT MAX(fecha) INTO v_fecha_max FROM _multifashion_sf_vw;

  IF v_fecha_max IS NULL THEN
    RETURN jsonb_build_object('sin_data', true);
  END IF;

  v_ult_mes_fin := (date_trunc('month', v_fecha_max) + INTERVAL '1 month' - INTERVAL '1 day')::date;
  IF v_ult_mes_fin > v_fecha_max OR v_ult_mes_fin >= CURRENT_DATE THEN
    v_ult_mes_fin := (date_trunc('month', v_fecha_max) - INTERVAL '1 day')::date;
  END IF;
  v_ult_year := EXTRACT(YEAR  FROM v_ult_mes_fin)::int;
  v_ult_mes  := EXTRACT(MONTH FROM v_ult_mes_fin)::int;

  IF p_mes IS NULL THEN
    IF    v_year = v_ult_year THEN v_mes := v_ult_mes;
    ELSIF v_year < v_ult_year THEN v_mes := 12;
    ELSE  v_mes := 1;
    END IF;
  ELSE
    IF p_mes < 1 OR p_mes > 12 THEN
      RAISE EXCEPTION 'p_mes inválido (1..12): %', p_mes;
    END IF;
    v_mes := p_mes;
  END IF;

  v_mes_inicio  := make_date(v_year,     v_mes, 1);
  v_mes_fin     := (v_mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;
  v_prev_inicio := make_date(v_year - 1, v_mes, 1);
  v_prev_fin    := (v_prev_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;

  v_elegible := (v_mes_fin < CURRENT_DATE) AND (v_mes_fin <= v_fecha_max);

  SELECT COALESCE(SUM(subtotal), 0) INTO v_ventas_tienda
  FROM _multifashion_sf_vw
  WHERE fecha BETWEEN v_mes_inicio AND v_mes_fin;

  v_ventas_tienda_prev :=
      COALESCE((SELECT SUM(subtotal) FROM _multifashion_sf_vw
                WHERE fecha BETWEEN v_prev_inicio AND v_prev_fin), 0);

  v_tiene_comp_ger := (v_ventas_tienda_prev > 0);
  v_delta_ger := CASE WHEN v_tiene_comp_ger
                      THEN (v_ventas_tienda - v_ventas_tienda_prev) / v_ventas_tienda_prev
                      ELSE NULL END;

  v_bono_ger := 0;
  IF v_elegible AND v_tiene_comp_ger THEN
    IF    v_delta_ger >= 0.10 THEN v_bono_ger := 100;
    ELSIF v_delta_ger >= 0.05 THEN v_bono_ger := 50;
    END IF;
  END IF;

  v_gerente_nombre := NULLIF(v_managers->>0, '');

  WITH actual AS (
    SELECT vendedor_canonico AS vendedor,
           SUM(subtotal) AS ventas,
           COUNT(DISTINCT n_sistema) AS tickets
    FROM _multifashion_sf_vw
    WHERE fecha BETWEEN v_mes_inicio AND v_mes_fin
      AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT'
    GROUP BY vendedor_canonico
  ),
  prev AS (
    SELECT vendedor_canonico AS vendedor, SUM(subtotal) AS ventas
    FROM _multifashion_sf_vw
    WHERE fecha BETWEEN v_prev_inicio AND v_prev_fin
      AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT'
    GROUP BY vendedor_canonico
  ),
  joined AS (
    SELECT a.vendedor, a.ventas, a.tickets, p.ventas AS prev_ventas,
           (v_managers ? a.vendedor) AS is_mgr
    FROM actual a
    LEFT JOIN prev p ON p.vendedor = a.vendedor
  ),
  maxnm AS (
    SELECT MAX(ventas) AS m FROM joined WHERE NOT is_mgr
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'nombre',            j.vendedor,
      'tickets',           j.tickets,
      'ventas',            j.ventas,
      'ticket_promedio',   CASE WHEN j.tickets > 0 THEN j.ventas / j.tickets ELSE 0 END,
      'manager',           j.is_mgr,
      'delta_ventas_pct',  CASE
                             WHEN COALESCE(j.prev_ventas, 0) > 0
                               THEN (j.ventas - j.prev_ventas) / j.prev_ventas
                             ELSE NULL
                           END,
      'tiene_comparacion', COALESCE(j.prev_ventas, 0) > 0,
      'bono_vendedora',    v_elegible
                             AND NOT j.is_mgr
                             AND mx.m IS NOT NULL
                             AND j.ventas = mx.m
    )
    ORDER BY j.ventas DESC
  )
  INTO v_vendedoras
  FROM joined j CROSS JOIN maxnm mx;

  RETURN jsonb_build_object(
    'mes_evaluado',        jsonb_build_object('year', v_year, 'mes', v_mes),
    'es_elegible',         v_elegible,
    'fecha_max_data',      to_char(v_fecha_max, 'YYYY-MM-DD'),
    'ultimo_mes_elegible', jsonb_build_object('year', v_ult_year, 'mes', v_ult_mes),
    'gerente', jsonb_build_object(
      'nombre',            v_gerente_nombre,
      'ventas_mes',        v_ventas_tienda,
      'ventas_mes_prev',   v_ventas_tienda_prev,
      'delta_pct',         v_delta_ger,
      'tiene_comparacion', v_tiene_comp_ger,
      'bono',              v_bono_ger
    ),
    'vendedoras', COALESCE(v_vendedoras, '[]'::jsonb)
  );
END;
$function$;

-- Las v3 se conservan: mientras esta migración no corra, las rutas siguen
-- llamándolas y la pantalla se comporta exactamente como antes.
GRANT EXECUTE ON FUNCTION public.multifashion_vendedora_canonica(integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.multifashion_vendedoras_v4(integer, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.multifashion_vendedoras_range_v2(integer, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.multifashion_bonos_v4(integer, integer) TO service_role;

COMMIT;
