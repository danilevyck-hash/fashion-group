-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Ventas redesign — app_settings, multifashion_mensual RPC,
--            clientes_ytd_vw view
--
-- Acompaña al rediseño del módulo /ventas (3 tabs: Resumen, Clientes,
-- Multifashion). El RPC ventas_dashboard_summary existente se reutiliza
-- para el tab Resumen — esta migración solo agrega lo nuevo.
--
-- Idempotente: usa CREATE TABLE IF NOT EXISTS / ON CONFLICT / OR REPLACE.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tabla app_settings — config key/value general del proyecto.
--    Diseñada para metadata editable sin redeploy (metas, growth targets,
--    nombres de tienda/manager, etc.).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all ON app_settings;
CREATE POLICY service_role_all ON app_settings FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Seeds — Multifashion config
--    Editable desde Supabase Dashboard sin redeploy.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO app_settings (key, value, description) VALUES
  ('multifashion_meta_anual_2026',  '800000'::jsonb,                  'Meta de ventas anual de Multifashion para 2026 (USD)'),
  ('multifashion_growth_target_pct','5'::jsonb,                       'Target de crecimiento % vs 2025 para calcular esperado YTD por estacionalidad'),
  ('multifashion_tienda',           '"American Classics"'::jsonb,     'Nombre de la tienda mostrado en el header'),
  ('multifashion_ubicacion',        '"Chiriquí"'::jsonb,              'Ubicación de la tienda'),
  ('multifashion_manager',          '"Jennifer Castillo"'::jsonb,     'Manager principal mostrado en el header'),
  ('multifashion_bono_top',         '50'::jsonb,                      'Bono USD a la TOP vendedora cuando supera mes anterior'),
  ('multifashion_managers',         '["Jennifer Castillo"]'::jsonb,   'Array de nombres de vendedoras que tienen rol manager (badge en tabla)')
ON CONFLICT (key) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Helper: get_app_setting — devuelve el value jsonb de un key
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_app_setting(p_key text)
RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT value FROM app_settings WHERE key = p_key
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RPC multifashion_mensual(p_year, p_mes)
--
--    Retorna jsonb con todo lo que necesita el tab Multifashion:
--      - tienda / ubicacion / manager / metaAnual / bonoTop  (desde app_settings)
--      - ytdVentas / ytdTickets / ticketProm / margen        (acumulado YTD)
--      - meses[12]  (Ene..Dic con ventas/tickets/ticketProm/vs2025)
--      - vendedoras del mes (con tickets/ventas/deltaPrevMes/comisión 0.5% +
--        bono $50 si TOP & superó mes anterior + flag manager)
--      - expectedTodayPct: ESTACIONAL — sum(ventas 2025 ene..p_mes) ×
--        (1 + growth_target/100) / metaAnual.
--
--    empresa filter: 'american_classic' (DB key, mapEmpresaName → "Multifashion").
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION multifashion_mensual(p_year int, p_mes int)
RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_meta_anual numeric;
  v_growth_pct numeric;
  v_tienda text;
  v_ubicacion text;
  v_manager text;
  v_bono_top numeric;
  v_managers jsonb;

  v_ytd_ventas numeric;
  v_ytd_tickets bigint;
  v_ytd_ticket_prom numeric;
  v_ytd_costo numeric;
  v_ytd_utilidad numeric;
  v_ytd_margen numeric;

  v_meses jsonb;
  v_vendedoras jsonb;

  v_abr_ventas numeric;
  v_abr_ticket_prom numeric;
  v_abr_comisiones numeric;

  v_ventas_2025_ytd numeric;
  v_expected_today_pct numeric;

  v_top_vendedor text;
  v_mes_label text;
BEGIN
  -- Config
  v_meta_anual := COALESCE((get_app_setting('multifashion_meta_anual_2026'))::numeric, 800000);
  v_growth_pct := COALESCE((get_app_setting('multifashion_growth_target_pct'))::numeric, 5);
  v_tienda     := COALESCE(get_app_setting('multifashion_tienda')    #>> '{}', 'American Classics');
  v_ubicacion  := COALESCE(get_app_setting('multifashion_ubicacion') #>> '{}', 'Chiriquí');
  v_manager    := COALESCE(get_app_setting('multifashion_manager')   #>> '{}', '');
  v_bono_top   := COALESCE((get_app_setting('multifashion_bono_top'))::numeric, 50);
  v_managers   := COALESCE(get_app_setting('multifashion_managers'), '[]'::jsonb);

  -- YTD acumulado (ene..p_mes del p_year)
  SELECT
    COALESCE(SUM(subtotal), 0),
    COUNT(DISTINCT n_sistema),
    COALESCE(SUM(costo), 0),
    COALESCE(SUM(utilidad), 0)
  INTO v_ytd_ventas, v_ytd_tickets, v_ytd_costo, v_ytd_utilidad
  FROM ventas_raw
  WHERE empresa = 'american_classic'
    AND anio = p_year
    AND mes <= p_mes;

  v_ytd_ticket_prom := CASE WHEN v_ytd_tickets > 0 THEN v_ytd_ventas / v_ytd_tickets ELSE 0 END;
  v_ytd_margen      := CASE WHEN v_ytd_ventas  > 0 THEN v_ytd_utilidad / v_ytd_ventas ELSE 0 END;

  -- Serie 12 meses con vs 2025
  WITH cur AS (
    SELECT mes, SUM(subtotal) AS ventas, COUNT(DISTINCT n_sistema) AS tickets
    FROM ventas_raw
    WHERE empresa = 'american_classic' AND anio = p_year
    GROUP BY mes
  ),
  prev AS (
    SELECT mes, SUM(subtotal) AS ventas
    FROM ventas_raw
    WHERE empresa = 'american_classic' AND anio = p_year - 1
    GROUP BY mes
  ),
  m AS (
    SELECT generate_series(1, 12) AS mes
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'mes',        CASE m.mes WHEN 1 THEN 'Ene' WHEN 2 THEN 'Feb' WHEN 3 THEN 'Mar'
                                WHEN 4 THEN 'Abr' WHEN 5 THEN 'May' WHEN 6 THEN 'Jun'
                                WHEN 7 THEN 'Jul' WHEN 8 THEN 'Ago' WHEN 9 THEN 'Sep'
                                WHEN 10 THEN 'Oct' WHEN 11 THEN 'Nov' ELSE 'Dic' END,
      'ventas',     COALESCE(cur.ventas, 0)::numeric,
      'tickets',    COALESCE(cur.tickets, 0)::int,
      'ticketProm', CASE WHEN COALESCE(cur.tickets, 0) > 0 THEN cur.ventas / cur.tickets ELSE 0 END,
      'vs2025',     CASE
                      WHEN cur.ventas IS NULL THEN NULL
                      WHEN COALESCE(prev.ventas, 0) > 0 THEN (cur.ventas - prev.ventas) / prev.ventas
                      ELSE NULL
                    END
    )
    ORDER BY m.mes
  )
  INTO v_meses
  FROM m
  LEFT JOIN cur  ON cur.mes  = m.mes
  LEFT JOIN prev ON prev.mes = m.mes;

  -- TOP vendedor del mes (mayor ventas en p_mes)
  SELECT vendedor INTO v_top_vendedor
  FROM ventas_raw
  WHERE empresa = 'american_classic' AND anio = p_year AND mes = p_mes
    AND vendedor IS NOT NULL AND TRIM(vendedor) <> ''
  GROUP BY vendedor
  ORDER BY SUM(subtotal) DESC
  LIMIT 1;

  -- Vendedoras del mes con delta vs mes anterior
  WITH this_mes AS (
    SELECT
      TRIM(vendedor) AS vendedor,
      SUM(subtotal) AS ventas,
      COUNT(DISTINCT n_sistema) AS tickets
    FROM ventas_raw
    WHERE empresa = 'american_classic' AND anio = p_year AND mes = p_mes
      AND vendedor IS NOT NULL AND TRIM(vendedor) <> ''
    GROUP BY TRIM(vendedor)
  ),
  prev_mes AS (
    SELECT
      TRIM(vendedor) AS vendedor,
      SUM(subtotal) AS ventas
    FROM ventas_raw
    WHERE empresa = 'american_classic'
      AND ((p_mes > 1  AND anio = p_year     AND mes = p_mes - 1)
        OR (p_mes = 1  AND anio = p_year - 1 AND mes = 12))
      AND vendedor IS NOT NULL AND TRIM(vendedor) <> ''
    GROUP BY TRIM(vendedor)
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'nombre',     t.vendedor,
      'tickets',    t.tickets,
      'ventas',     t.ventas,
      'deltaMarzo', CASE
                      WHEN COALESCE(p.ventas, 0) > 0 THEN (t.ventas - p.ventas) / p.ventas
                      ELSE NULL
                    END,
      'ticketProm', CASE WHEN t.tickets > 0 THEN t.ventas / t.tickets ELSE 0 END,
      'comision',   t.ventas * 0.005,
      'manager',    v_managers ? t.vendedor,
      'top',        (t.vendedor = v_top_vendedor)
    )
    ORDER BY t.ventas DESC
  )
  INTO v_vendedoras
  FROM this_mes t
  LEFT JOIN prev_mes p ON p.vendedor = t.vendedor;

  -- KPIs del mes p_mes (abril en el caso típico)
  SELECT
    COALESCE(SUM(subtotal), 0),
    COUNT(DISTINCT n_sistema),
    COALESCE(SUM(subtotal) * 0.005, 0)
  INTO v_abr_ventas, v_ytd_tickets, v_abr_comisiones
  FROM ventas_raw
  WHERE empresa = 'american_classic' AND anio = p_year AND mes = p_mes;

  v_abr_ticket_prom := CASE WHEN v_ytd_tickets > 0 THEN v_abr_ventas / v_ytd_tickets ELSE 0 END;

  -- expectedTodayPct ESTACIONAL: sum(ventas 2025 ene..p_mes) × (1 + growth/100) / metaAnual
  SELECT COALESCE(SUM(subtotal), 0) INTO v_ventas_2025_ytd
  FROM ventas_raw
  WHERE empresa = 'american_classic' AND anio = p_year - 1 AND mes <= p_mes;

  v_expected_today_pct := CASE
    WHEN v_meta_anual > 0
      THEN LEAST(1, (v_ventas_2025_ytd * (1 + v_growth_pct / 100.0)) / v_meta_anual)
    ELSE 0
  END;

  -- Recomputar YTD tickets (perdido por reuso de variable arriba)
  SELECT COUNT(DISTINCT n_sistema) INTO v_ytd_tickets
  FROM ventas_raw
  WHERE empresa = 'american_classic' AND anio = p_year AND mes <= p_mes;

  v_ytd_ticket_prom := CASE WHEN v_ytd_tickets > 0 THEN v_ytd_ventas / v_ytd_tickets ELSE 0 END;

  -- Resultado final
  RETURN jsonb_build_object(
    'tienda',           v_tienda,
    'ubicacion',        v_ubicacion,
    'manager',          v_manager,
    'metaAnual',        v_meta_anual,
    'ytdVentas',        v_ytd_ventas,
    'ytdTickets',       v_ytd_tickets,
    'ticketProm',       v_ytd_ticket_prom,
    'margen',           v_ytd_margen,
    'expectedTodayPct', v_expected_today_pct,
    'meses',            COALESCE(v_meses, '[]'::jsonb),
    'vendedoras',       COALESCE(v_vendedoras, '[]'::jsonb),
    'abrVentas',        v_abr_ventas,
    'abrTicketProm',    v_abr_ticket_prom,
    'abrComisiones',    v_abr_comisiones,
    'bonoTop',          v_bono_top
  );
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. View clientes_ytd_vw — clientes activos con YTD del año en curso vs prior
--
--    JOIN ventas_raw + clientes_master por nombre_normalized.
--    Filtros (replicando RPC ventas_clientes_detalle_summary):
--      - empresa NOT IN ('boston', 'american_classic')
--      - cliente NOT IN CLIENTES_INTERNOS / GENERICOS
--    YTD: SUM(subtotal) acumulado por cliente para el año actual del calendario.
--    YTD prior: mismo mes-rango del año anterior.
--    empresa display: la empresa con mayor subtotal del cliente (display name).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW clientes_ytd_vw AS
WITH
  -- normalizar nombre (replica JS normalizeName)
  normalized AS (
    SELECT
      r.id,
      r.empresa,
      r.subtotal,
      r.fecha,
      r.anio,
      r.mes,
      COALESCE(
        NULLIF(
          TRIM(REGEXP_REPLACE(REGEXP_REPLACE(UPPER(r.cliente), '[.,]', '', 'g'), '\s+', ' ', 'g')),
          ''
        ),
        '(Sin nombre)'
      ) AS cliente_norm
    FROM ventas_raw r
    WHERE r.empresa NOT IN ('boston', 'american_classic')
      AND r.cliente IS NOT NULL
  ),
  filtered AS (
    SELECT *
    FROM normalized
    WHERE cliente_norm NOT IN (
      'CONFECCIONES BOSTON', 'MULTI FASHION HOLDING', 'MULTIFASHION', 'BOSTON',
      'CONTADO', 'VENTAS', '(Sin nombre)'
    )
  ),
  current_year AS (
    SELECT EXTRACT(YEAR FROM CURRENT_DATE)::int AS y
  ),
  ytd_actual AS (
    SELECT
      f.cliente_norm,
      SUM(f.subtotal) AS ytd2026,
      MAX(f.fecha)    AS ultima_compra
    FROM filtered f, current_year cy
    WHERE f.anio = cy.y
    GROUP BY f.cliente_norm
  ),
  ytd_prev AS (
    -- Mismo mes-rango del año anterior — para compararlo equivalentemente
    -- usamos el mes_max de cada cliente en el año actual; si el cliente no
    -- compró aún este año pero sí el anterior, sumamos todo el year-1.
    SELECT
      f.cliente_norm,
      SUM(f.subtotal) AS ytd2025
    FROM filtered f, current_year cy
    WHERE f.anio = cy.y - 1
      AND f.mes <= COALESCE(
        (SELECT MAX(mes) FROM filtered fa WHERE fa.cliente_norm = f.cliente_norm AND fa.anio = cy.y),
        12
      )
    GROUP BY f.cliente_norm
  ),
  empresa_top AS (
    -- empresa con mayor subtotal del año actual (para columna display "Empresa")
    SELECT DISTINCT ON (cliente_norm)
      f.cliente_norm,
      f.empresa AS empresa_key
    FROM filtered f, current_year cy
    WHERE f.anio = cy.y
    GROUP BY f.cliente_norm, f.empresa
    ORDER BY f.cliente_norm, SUM(f.subtotal) DESC
  )
SELECT
  ROW_NUMBER() OVER (ORDER BY COALESCE(a.ytd2026, 0) DESC)::int                  AS rank,
  COALESCE(m.codigo, '—')                                                         AS id,
  COALESCE(m.nombre, a.cliente_norm)                                              AS nombre,
  CASE et.empresa_key
    WHEN 'vistana'             THEN 'Vistana International'
    WHEN 'fashion_wear'        THEN 'Fashion Wear'
    WHEN 'fashion_shoes'       THEN 'Fashion Shoes'
    WHEN 'active_shoes'        THEN 'Active Shoes'
    WHEN 'active_wear'         THEN 'Active Wear'
    WHEN 'joystep'             THEN 'Joystep'
    WHEN 'confecciones_boston' THEN 'Confecciones Boston'
    WHEN 'american_classic'    THEN 'Multifashion'
    ELSE COALESCE(et.empresa_key, '—')
  END                                                                             AS empresa,
  COALESCE(a.ytd2026, 0)::numeric                                                 AS ytd2026,
  COALESCE(p.ytd2025, 0)::numeric                                                 AS ytd2025,
  CASE
    WHEN COALESCE(p.ytd2025, 0) > 0 THEN ((COALESCE(a.ytd2026, 0) - p.ytd2025) / p.ytd2025)::numeric
    ELSE NULL
  END                                                                             AS delta_pct,
  a.ultima_compra                                                                 AS ultima_compra,
  COALESCE(NULLIF(m.whatsapp, ''), NULLIF(m.celular, ''), NULLIF(m.telefono, '')) AS wa
FROM ytd_actual a
LEFT JOIN ytd_prev   p  ON p.cliente_norm  = a.cliente_norm
LEFT JOIN empresa_top et ON et.cliente_norm = a.cliente_norm
LEFT JOIN clientes_master m ON m.nombre_normalized = a.cliente_norm AND m.deleted = false
WHERE COALESCE(a.ytd2026, 0) > 0
ORDER BY a.ytd2026 DESC NULLS LAST;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Permisos
-- ─────────────────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION get_app_setting(text)            TO service_role;
GRANT EXECUTE ON FUNCTION multifashion_mensual(int, int)   TO service_role;
GRANT SELECT  ON clientes_ytd_vw                           TO service_role;
