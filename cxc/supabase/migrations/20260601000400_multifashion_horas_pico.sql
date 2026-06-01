-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: análisis de hora pico para Multifashion (Detalle mensual)
--
-- El aviso "Hora pico no disponible (la venta solo registra fecha, no hora)" era
-- FALSO: switch_facturas.fecha es timestamptz con hora real (verificado: 1000/1000
-- facturas 2026 de american_classic con hora != 00:00:00; raw_data.fecha trae la
-- hora local "2026-05-30 18:45:19"). Pico observado ~15-18h Panamá.
--
-- ⚠️ ZONA HORARIA (CRÍTICO): fecha se guarda en UTC. La hora local de venta sale
-- con  fecha_ts AT TIME ZONE 'America/Panama'  (Panamá es UTC-5 todo el año, sin
-- DST). Extraer la hora en UTC directo correría el pico +5h (mal: 22h UTC = 17h
-- Panamá). El filtro de MES sigue por fecha (UTC date, igual que el resto del
-- subtab) para cubrir exactamente la misma población de tickets que los totales/
-- chart día-por-día; solo la HORA se convierte a Panamá.
--
-- Cambios:
--   1. _multifashion_sf_vw: se AGREGA la columna fecha_ts (timestamptz crudo) al
--      final. Las columnas existentes no cambian → los otros 5 RPCs que leen la
--      vista no se afectan. No se cambia de fuente (misma vista).
--   2. multifashion_horas_pico_v1(p_year, p_mes): buckets 0-23 (hora Panamá) de
--      ventas netas retail (is_wholesale=false) + la hora pico del mes.
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Extender la vista helper con el timestamp crudo (hora incluida).
--    CREATE OR REPLACE permite agregar columnas SOLO al final; las existentes
--    quedan idénticas (mismo nombre/tipo/orden).
CREATE OR REPLACE VIEW _multifashion_sf_vw AS
SELECT
  'american_classic'::text                AS empresa,
  EXTRACT(YEAR  FROM fecha)::int          AS anio,
  EXTRACT(MONTH FROM fecha)::int          AS mes,
  fecha::date                             AS fecha,
  switch_factura_id::text                 AS n_sistema,
  vendedor_nombre                         AS vendedor,
  cliente_nombre                          AS cliente,
  CASE
    WHEN tipo_comprobante IN ('Factura','Tiquete','Transacción','Nota de Débito') THEN subtotal_descuento
    WHEN tipo_comprobante = 'Nota de Crédito' THEN -subtotal_descuento
    ELSE 0
  END                                     AS subtotal,
  total::numeric                          AS total,
  is_wholesale,
  tipo_comprobante,
  1::int                                  AS _row,
  -- NUEVO: timestamp crudo (UTC) para análisis de hora del día. Convertir a
  -- hora local con AT TIME ZONE 'America/Panama' en el consumidor.
  fecha                                   AS fecha_ts
FROM switch_facturas
WHERE empresa_key = 'american_classic';

GRANT SELECT ON _multifashion_sf_vw TO service_role;


-- 2) RPC: ventas por hora del día (mes seleccionado) + hora pico. Retail only.
CREATE OR REPLACE FUNCTION multifashion_horas_pico_v1(p_year int, p_mes int)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_mes_inicio  date;
  v_mes_fin     date;
  v_horas       jsonb;
  v_hora_pico   int;
  v_pico_ventas numeric;
BEGIN
  IF p_mes < 1 OR p_mes > 12 THEN
    RAISE EXCEPTION 'p_mes inválido: % (esperado 1..12)', p_mes;
  END IF;

  v_mes_inicio := make_date(p_year, p_mes, 1);
  v_mes_fin    := (v_mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;

  -- Serie completa 0..23 (horas sin venta → 0). Hora en zona Panamá.
  WITH agg AS (
    SELECT
      EXTRACT(HOUR FROM (v.fecha_ts AT TIME ZONE 'America/Panama'))::int AS hora,
      SUM(v.subtotal)::numeric AS ventas,
      COUNT(*)::int            AS n_tickets
    FROM _multifashion_sf_vw v
    WHERE v.is_wholesale = false
      AND v.fecha BETWEEN v_mes_inicio AND v_mes_fin
    GROUP BY 1
  )
  SELECT jsonb_agg(
           jsonb_build_object(
             'hora',      h.hora,
             'ventas',    ROUND(COALESCE(a.ventas, 0), 2),
             'n_tickets', COALESCE(a.n_tickets, 0)
           ) ORDER BY h.hora
         )
  INTO v_horas
  FROM generate_series(0, 23) AS h(hora)
  LEFT JOIN agg a ON a.hora = h.hora;

  -- Hora pico = mayor ventas netas (>0). NULL si el mes no tiene ventas.
  SELECT a.hora, ROUND(a.ventas, 2)
  INTO v_hora_pico, v_pico_ventas
  FROM (
    SELECT
      EXTRACT(HOUR FROM (v.fecha_ts AT TIME ZONE 'America/Panama'))::int AS hora,
      SUM(v.subtotal)::numeric AS ventas
    FROM _multifashion_sf_vw v
    WHERE v.is_wholesale = false
      AND v.fecha BETWEEN v_mes_inicio AND v_mes_fin
    GROUP BY 1
    HAVING SUM(v.subtotal) > 0
  ) a
  ORDER BY a.ventas DESC, a.hora
  LIMIT 1;

  RETURN jsonb_build_object(
    'horas',            COALESCE(v_horas, '[]'::jsonb),
    'hora_pico',        v_hora_pico,
    'hora_pico_ventas', v_pico_ventas
  );
END;
$$;

GRANT EXECUTE ON FUNCTION multifashion_horas_pico_v1(int, int) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- Verificación (correr en SQL Editor tras aplicar):
--   SELECT multifashion_horas_pico_v1(2026, 5);
--   -- hora_pico debe caer en horario comercial Panamá (~15-18). Si sale en
--   -- madrugada, la conversión AT TIME ZONE está mal.
-- ─────────────────────────────────────────────────────────────────────────────
