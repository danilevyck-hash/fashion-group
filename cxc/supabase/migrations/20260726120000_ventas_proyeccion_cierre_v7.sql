-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: ventas_proyeccion_cierre_v7
--
-- PROBLEMA
-- --------
-- Un backtest de 120 cortes (2024 y 2025) midió que la proyección de cierre es
-- confiable a nivel GRUPO (7.4% de error) pero floja POR EMPRESA (32.8%), con
-- un pico de 68.7% entre marzo y mayo. Cuatro causas, todas medidas:
--
--  1. La rama "estacional" divide por `frac_ytd` (qué porcentaje del año pasado
--     llevaba la empresa a esta misma altura) con un piso de 0.05. Dividir por
--     0.05 es multiplicar el ruido por 20. Caso real: active_shoes proyectó
--     $2.06M el 15-mar-2025 y cerró $788K.
--
--  2. `ritmo_actual` = ventas_ytd / ventas_del_año_pasado_a_esta_altura. Si el
--     año pasado la empresa casi no había vendido a esta altura, ese cociente
--     no mide nada. Joystep, que abrió el 21-jul-2025, comparaba sus $26,575 de
--     2026 contra $133 de 2025 → ritmo 200x → factor pegado al tope 1.25 →
--     proyectaba $207K con $26.5K vendidos en 7 meses.
--
--  3. El crecimiento año-contra-año se calcula contra años que son un pedazo de
--     año. `ventas_raw` arranca en oct-2022, así que "2023 vs 2022" comparaba
--     12 meses contra 2 y daba crecimientos absurdos (+827% en Confecciones
--     Boston, +13568% en Active Wear). Tres empresas quedaron pegadas al tope
--     del clamp del ritmo histórico y su `meta_sugerida` salió inflada. Lo
--     mismo le pasa a American Classic, que abrió en may-2024.
--
--  4. `algoritmo` y `es_fallback_lineal` podían mentir: la etiqueta decía
--     "mixto" mientras el número se calculaba con la rama lineal (cuando el
--     cierre del año previo era 0). La UI explicaba mal el número.
--
-- QUÉ HACE
-- --------
--  A) CLAMP de la proyección a `cierre_año_previo × [0.75, 1.60]`, y SOLO
--     mientras `frac_ytd < 0.5`. Pasada la mitad del año la rama estacional ya
--     es confiable y acotarla empeora (medido: error por empresa jun-dic sube
--     de 13.2% a 16.7% si el clamp queda siempre prendido).
--
--  B) COBERTURA: el año pasado solo sirve de referencia si, a esta altura, ya
--     llevaba una fracción razonable de sí mismo. `cobertura` = cuánto llevaba
--     el año pasado a esta altura, dividido por lo que el calendario dice que
--     debería llevar. ~1 es normal; joystep hoy da 0.001. Por debajo de
--     COBERTURA_MINIMA (0.10) se apagan `ritmo_actual` y la rama estacional.
--     Joystep pasa a la rama lineal honesta: $45,557 en vez de $207,122.
--
--  C) AÑO BASE: un año solo entra al cálculo de crecimiento si la empresa ya
--     vendía dentro de los primeros 31 días de ese año. Saca 2022 (que arranca
--     en octubre), 2024 de American Classic (arranca en mayo) y 2025 de Joystep
--     (arranca en julio). No hay ningún año hardcodeado: la regla mira la
--     primera venta real de cada empresa en cada año.
--     OJO: `cierre_anio_anterior` (el dato que se muestra en pantalla) sigue
--     siendo el cierre REAL del año pasado. Esta regla solo decide qué años
--     sirven para MEDIR CRECIMIENTO, no cambia ningún hecho.
--
--  D) `algoritmo` y `es_fallback_lineal` ahora se derivan de la rama que de
--     verdad calculó el número, no de la intención.
--
--  E) La búsqueda de `fecha_corte` pasa a ser sargable (`fecha >= inicio AND
--     fecha < inicio_del_siguiente` en vez de `EXTRACT(YEAR FROM fecha)`), que
--     sí puede usar el índice de switch_facturas. Es marginal hoy (52K filas,
--     350-525 ms) pero sale gratis.
--
-- RESULTADO MEDIDO (backtest, mismos 120 cortes de 2024 y 2025)
-- -------------------------------------------------------------
--   banda      error grupo          error por empresa
--   ene-feb    16.8%  →  15.1%      38.0%  →  28.9%
--   mar-may     4.5%  →   4.9%      68.7%  →  41.1%
--   jun-dic     6.0%  →   4.9%      16.0%  →  13.2%
--   TOTAL       7.4%  →   6.6%      32.8%  →  22.8%
--
--   Solo el clamp (A): grupo 5.8%, empresa 23.1%. El resto del costo en el
--   error de grupo lo pone (C): el crecimiento inflado de +50% venía tapando,
--   por casualidad, el sesgo a la baja que la proyección tiene en ene-feb.
--
-- QUÉ CAMBIA EN PANTALLA HOY (corte 25-jul-2026)
-- ----------------------------------------------
--   Joystep:  $207,122  →  $45,557   (única empresa que cambia)
--   Grupo:    $12,501,906 → $12,340,341  (−$161,564, −1.3%)
--   El clamp no toca a ninguna empresa hoy: ninguna proyección se sale de su
--   banda. Las otras 7 empresas quedan idénticas al centavo.
--
-- VERIFICACIÓN
-- ------------
--   SELECT jsonb_pretty(ventas_proyeccion_cierre_v7(2026));
--
--   Esperado (25-jul-2026):
--     joystep       → proyeccion_cierre ≈ 45557, algoritmo 'fallback_lineal',
--                     es_fallback_lineal true, ritmo_actual null, frac_ytd null,
--                     cierre_anio_anterior 165697.23  (el hecho NO cambia)
--     las otras 7   → idénticas a ventas_proyeccion_cierre_v6(2026)
--     totales_grupo → proyeccion_cierre ≈ 12340341
--
--   Diff contra v6, empresa por empresa:
--     SELECT e6->>'empresa', (e6->>'proyeccion_cierre')::numeric AS v6,
--            (e7->>'proyeccion_cierre')::numeric AS v7
--     FROM jsonb_array_elements(ventas_proyeccion_cierre_v6(2026)->'empresas') e6
--     JOIN jsonb_array_elements(ventas_proyeccion_cierre_v7(2026)->'empresas') e7
--       ON e6->>'empresa' = e7->>'empresa';
--
-- El código es tolerante: src/lib/ventas/queries.ts y
-- src/app/api/ventas/proyeccion-cierre/route.ts llaman a v7 y caen a v6 si esta
-- migración todavía no corrió.
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ventas_proyeccion_cierre_v7(p_anio int)
RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  -- Banda del clamp de la proyección, relativa al cierre del año previo.
  c_clamp_min        CONSTANT numeric := 0.75;
  c_clamp_max        CONSTANT numeric := 1.60;
  -- Pasada esta fracción del año previo, la rama estacional ya es confiable
  -- y el clamp se apaga.
  c_frac_sin_clamp   CONSTANT numeric := 0.50;
  -- Piso de cobertura: por debajo, el año pasado no sirve de referencia.
  c_cobertura_min    CONSTANT numeric := 0.10;
  -- Un año sirve de base de crecimiento si la empresa ya vendía en sus
  -- primeros N días.
  c_dias_anio_base   CONSTANT int     := 31;
  -- Piso viejo de frac_ytd para habilitar la rama estacional (sin cambios).
  c_frac_estacional  CONSTANT numeric := 0.05;

  v_fecha_corte      date;
  v_fecha_corte_prev date;
  v_mes_corte        int;
  v_frac_calendario  numeric;
  v_peso_ritmo       numeric;
  v_peso_historico   numeric;
  v_empresas         jsonb;
  v_grupo            jsonb;
BEGIN
  -- Corte = última fecha sincronizada del año en curso (switch_facturas).
  -- Sargable: rango de fechas en vez de EXTRACT(YEAR FROM fecha).
  SELECT MAX(fecha::date) INTO v_fecha_corte
  FROM switch_facturas
  WHERE fecha >= make_date(p_anio, 1, 1)
    AND fecha <  make_date(p_anio + 1, 1, 1);

  IF v_fecha_corte IS NULL THEN
    RETURN jsonb_build_object(
      'anio', p_anio, 'fecha_corte', NULL, 'mes_corte', 0,
      'empresas', '[]'::jsonb,
      'totales_grupo', jsonb_build_object(
        'ventas_ytd', 0, 'proyeccion_cierre', 0, 'proyeccion_restante', 0,
        'meta_total', 0, 'gap_vs_meta', NULL, 'status', 'gris',
        'cierre_anio_anterior_total', 0,
        'delta_vs_anio_anterior_total', NULL, 'delta_vs_anio_anterior_pct', NULL
      )
    );
  END IF;

  v_fecha_corte_prev := (v_fecha_corte - INTERVAL '1 year')::date;
  v_mes_corte        := EXTRACT(MONTH FROM v_fecha_corte)::int;
  -- Qué fracción del año dice el calendario que llevamos al corte.
  v_frac_calendario  := ((v_fecha_corte - make_date(p_anio, 1, 1)) + 1)::numeric / 365;
  v_peso_ritmo       := v_mes_corte::numeric / 12;
  v_peso_historico   := 1 - v_peso_ritmo;

  WITH
  dia_ventas AS (
    SELECT empresa_key, fecha::date AS d,
      CASE
        WHEN tipo_comprobante IN ('Factura','Tiquete','Transacción','Nota de Débito') THEN subtotal_descuento
        WHEN tipo_comprobante = 'Nota de Crédito' THEN -subtotal_descuento
        ELSE 0
      END AS venta
    FROM switch_facturas WHERE fecha >= DATE '2025-05-01'
    UNION ALL
    SELECT
      CASE WHEN empresa IN ('vistana','vistana_international') THEN 'vistana'
           WHEN empresa IN ('boston','confecciones_boston') THEN 'confecciones_boston'
           ELSE empresa END,
      fecha, subtotal
    FROM ventas_raw WHERE fecha < DATE '2025-05-01'
  ),
  dia_neto AS (
    SELECT empresa_key, d, SUM(venta) AS venta
    FROM dia_ventas GROUP BY empresa_key, d
  ),
  -- (C) Primer día con venta REAL de cada empresa en cada año. Es lo que
  -- distingue "la empresa abrió a mitad de año" de "la empresa tuvo un año".
  primer_dia AS (
    SELECT empresa_key, EXTRACT(YEAR FROM d)::int AS anio, MIN(d) AS d0
    FROM dia_neto WHERE venta <> 0
    GROUP BY empresa_key, EXTRACT(YEAR FROM d)::int
  ),
  totales_raw AS (
    SELECT empresa_key AS empresa, EXTRACT(YEAR FROM mes)::int AS anio, SUM(ventas_netas)::numeric AS total
    FROM switch_ventas_unificado_vw
    WHERE EXTRACT(YEAR FROM mes)::int < p_anio
    GROUP BY 1, 2
    HAVING SUM(ventas_netas) > 0
  ),
  -- (C) Solo los años que cubren casi todo el año sirven para medir crecimiento.
  totales AS (
    SELECT t.empresa, t.anio, t.total
    FROM totales_raw t
    JOIN primer_dia pd ON pd.empresa_key = t.empresa AND pd.anio = t.anio
    WHERE (pd.d0 - make_date(t.anio, 1, 1)) <= c_dias_anio_base
  ),
  empresas_set AS (
    SELECT DISTINCT empresa_key AS empresa FROM switch_ventas_unificado_vw WHERE empresa_key IS NOT NULL
  ),
  ytd_cur AS (
    SELECT empresa_key AS empresa, COALESCE(SUM(venta), 0)::numeric AS ventas_ytd
    FROM dia_ventas
    WHERE EXTRACT(YEAR FROM d)::int = p_anio AND d <= v_fecha_corte
    GROUP BY empresa_key
  ),
  ytd_prev_sp AS (
    SELECT empresa_key AS empresa, COALESCE(SUM(venta), 0)::numeric AS ventas_prev_ytd_sp
    FROM dia_ventas
    WHERE EXTRACT(YEAR FROM d)::int = p_anio - 1 AND d <= v_fecha_corte_prev
    GROUP BY empresa_key
  ),
  -- Cierre REAL del año previo. Es un hecho: no lo filtra la regla de año base.
  total_prev AS (
    SELECT empresa_key AS empresa, COALESCE(SUM(ventas_netas), 0)::numeric AS total_prev_year
    FROM switch_ventas_unificado_vw
    WHERE EXTRACT(YEAR FROM mes)::int = p_anio - 1
    GROUP BY empresa_key
  ),
  crec AS (
    SELECT
      e.empresa,
      t0.total AS v_prev,
      CASE WHEN t0.total IS NOT NULL AND t1.total > 0 THEN t0.total / t1.total - 1 ELSE NULL END AS c1,
      CASE WHEN t1.total IS NOT NULL AND t2.total > 0 THEN t1.total / t2.total - 1 ELSE NULL END AS c2,
      CASE WHEN t2.total IS NOT NULL AND t3.total > 0 THEN t2.total / t3.total - 1 ELSE NULL END AS c3
    FROM empresas_set e
    LEFT JOIN totales t0 ON t0.empresa = e.empresa AND t0.anio = p_anio - 1
    LEFT JOIN totales t1 ON t1.empresa = e.empresa AND t1.anio = p_anio - 2
    LEFT JOIN totales t2 ON t2.empresa = e.empresa AND t2.anio = p_anio - 3
    LEFT JOIN totales t3 ON t3.empresa = e.empresa AND t3.anio = p_anio - 4
  ),
  ritmo_hist_raw AS (
    SELECT
      c.empresa, c.v_prev,
      CASE
        WHEN c1 IS NOT NULL AND c2 IS NOT NULL AND c3 IS NOT NULL THEN (c1*3 + c2*2 + c3*1) / 6
        WHEN c1 IS NOT NULL AND c2 IS NOT NULL THEN (c1*3 + c2*2) / 5
        WHEN c1 IS NOT NULL THEN c1
        ELSE NULL
      END AS ritmo_historico_raw,
      CASE
        WHEN c1 IS NOT NULL AND c2 IS NOT NULL AND c3 IS NOT NULL THEN 3
        WHEN c1 IS NOT NULL AND c2 IS NOT NULL THEN 2
        WHEN c1 IS NOT NULL THEN 1
        ELSE 0
      END AS historia_disponible
    FROM crec c
  ),
  ritmo_hist AS (
    SELECT r.empresa, r.v_prev, r.historia_disponible,
      CASE WHEN r.ritmo_historico_raw IS NULL THEN NULL
           ELSE LEAST(0.50, GREATEST(-0.30, r.ritmo_historico_raw)) END AS ritmo_historico
    FROM ritmo_hist_raw r
  ),
  sugerida_calc AS (
    SELECT r.empresa, r.v_prev, r.ritmo_historico, r.historia_disponible,
      CASE WHEN r.ritmo_historico IS NULL THEN NULL
           ELSE LEAST(1.25, GREATEST(0.90, 1 + r.ritmo_historico * 0.7)) END AS factor_sugerida,
      CASE WHEN r.ritmo_historico IS NULL OR COALESCE(r.v_prev, 0) <= 0 THEN NULL
           ELSE r.v_prev * LEAST(1.25, GREATEST(0.90, 1 + r.ritmo_historico * 0.7)) END AS meta_sugerida
    FROM ritmo_hist r
  ),
  base_raw AS (
    SELECT
      e.empresa,
      COALESCE(yc.ventas_ytd, 0)         AS ventas_ytd,
      COALESCE(ys.ventas_prev_ytd_sp, 0) AS ventas_prev_ytd_sp,
      COALESCE(tp.total_prev_year, 0)    AS total_prev_year,
      s.v_prev                            AS base_crecimiento,
      s.ritmo_historico, s.historia_disponible, s.meta_sugerida
    FROM empresas_set e
    LEFT JOIN ytd_cur     yc ON yc.empresa = e.empresa
    LEFT JOIN ytd_prev_sp ys ON ys.empresa = e.empresa
    LEFT JOIN total_prev  tp ON tp.empresa = e.empresa
    LEFT JOIN sugerida_calc s ON s.empresa = e.empresa
  ),
  -- (B) Cobertura: cuánto llevaba el año pasado a esta altura, contra lo que el
  -- calendario dice que debería llevar. Si el año pasado la empresa casi no
  -- había vendido, no hay con qué comparar.
  base AS (
    SELECT b.*,
      CASE WHEN b.total_prev_year > 0 AND b.ventas_prev_ytd_sp > 0
           THEN (b.ventas_prev_ytd_sp / b.total_prev_year) / v_frac_calendario END AS cobertura
    FROM base_raw b
  ),
  base_util AS (
    SELECT b.*,
      (b.cobertura IS NULL OR b.cobertura >= c_cobertura_min) AS prev_util
    FROM base b
  ),
  base_final AS (
    SELECT b.*,
      CASE WHEN b.ventas_prev_ytd_sp > 0 AND b.prev_util
           THEN b.ventas_ytd / b.ventas_prev_ytd_sp END AS ritmo_actual,
      CASE WHEN b.total_prev_year > 0 AND b.prev_util
           THEN b.ventas_prev_ytd_sp / b.total_prev_year END AS frac_ytd
    FROM base_util b
  ),
  metas_manuales AS (
    SELECT empresa AS nombre_display, meta::numeric AS meta_anual_manual
    FROM ventas_metas WHERE anio = p_anio
  ),
  proyectado AS (
    SELECT b.*, mm.meta_anual_manual,
      COALESCE(mm.meta_anual_manual, b.meta_sugerida) AS meta_efectiva,
      (v_mes_corte >= 3 AND b.frac_ytd IS NOT NULL AND b.frac_ytd >= c_frac_estacional) AS usa_estacional,
      CASE
        WHEN v_mes_corte >= 3 AND b.frac_ytd IS NOT NULL AND b.frac_ytd >= c_frac_estacional THEN NULL
        WHEN b.ritmo_historico IS NULL AND b.ritmo_actual IS NULL THEN NULL
        WHEN b.ritmo_historico IS NULL THEN LEAST(1.25, GREATEST(0.90, 1 + (b.ritmo_actual - 1) * 0.7))
        WHEN b.ritmo_actual IS NULL THEN LEAST(1.25, GREATEST(0.90, 1 + b.ritmo_historico * 0.7))
        ELSE LEAST(1.25, GREATEST(0.90, 1 + (
          (b.ritmo_actual * v_peso_ritmo + (1 + b.ritmo_historico) * v_peso_historico) - 1
        ) * 0.7))
      END AS factor_final
    FROM base_final b
    LEFT JOIN metas_manuales mm ON mm.nombre_display = _empresa_nombre(b.empresa)
  ),
  -- (D) La rama que de verdad calcula el número decide la etiqueta.
  rama AS (
    SELECT p.*,
      CASE
        WHEN p.usa_estacional AND p.ventas_ytd > 0 THEN 'estacional'
        WHEN NOT p.usa_estacional AND p.factor_final IS NOT NULL
             AND COALESCE(p.base_crecimiento, 0) > 0 THEN 'mixto'
        ELSE 'fallback_lineal'
      END AS algoritmo
    FROM proyectado p
  ),
  crudo AS (
    SELECT r.*,
      CASE
        WHEN r.algoritmo = 'estacional' THEN r.ventas_ytd / r.frac_ytd
        WHEN r.algoritmo = 'mixto'      THEN r.base_crecimiento * r.factor_final
        WHEN v_mes_corte > 0 AND r.ventas_ytd > 0 THEN r.ventas_ytd * 12.0 / v_mes_corte
        ELSE 0
      END AS proyeccion_cruda
    FROM rama r
  ),
  -- (A) Clamp: mientras el año pasado no llegue a la mitad, la proyección no
  -- puede alejarse del cierre del año pasado más de −25% / +60%.
  finales AS (
    SELECT c.*,
      CASE
        WHEN c.frac_ytd IS NOT NULL
         AND c.frac_ytd < c_frac_sin_clamp
         AND COALESCE(c.base_crecimiento, 0) > 0
         AND c.proyeccion_cruda > 0
        THEN LEAST(c.base_crecimiento * c_clamp_max,
                   GREATEST(c.base_crecimiento * c_clamp_min, c.proyeccion_cruda))
        ELSE c.proyeccion_cruda
      END AS proyeccion_cierre,
      (c.algoritmo = 'fallback_lineal') AS es_fallback_lineal
    FROM crudo c
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'empresa', f.empresa, 'nombre', _empresa_nombre(f.empresa),
      'ventas_ytd', f.ventas_ytd, 'ventas_prev_ytd_sp', f.ventas_prev_ytd_sp,
      'ventas_prev_year', f.total_prev_year,
      'cierre_anio_anterior', f.total_prev_year,
      'delta_vs_anio_anterior', CASE WHEN f.total_prev_year > 0 THEN f.proyeccion_cierre - f.total_prev_year ELSE NULL END,
      'delta_vs_anio_anterior_pct', CASE WHEN f.total_prev_year > 0 THEN (f.proyeccion_cierre - f.total_prev_year) / f.total_prev_year ELSE NULL END,
      'ritmo_actual', f.ritmo_actual, 'ritmo_historico', f.ritmo_historico,
      'historia_disponible', f.historia_disponible, 'frac_ytd_estacional', f.frac_ytd,
      'cobertura_anio_previo', f.cobertura,
      'algoritmo', f.algoritmo, 'factor_final', f.factor_final,
      'proyeccion_cierre', f.proyeccion_cierre,
      'proyeccion_cruda', f.proyeccion_cruda,
      'proyeccion_restante', GREATEST(0, f.proyeccion_cierre - f.ventas_ytd),
      'meta_anual_manual', f.meta_anual_manual, 'meta_sugerida', f.meta_sugerida,
      'meta_efectiva', f.meta_efectiva, 'meta_anual', f.meta_efectiva,
      'gap_vs_meta', CASE WHEN f.meta_efectiva IS NOT NULL THEN f.proyeccion_cierre - f.meta_efectiva ELSE NULL END,
      'es_fallback_lineal', f.es_fallback_lineal,
      'status', CASE
        WHEN f.meta_efectiva IS NULL OR f.meta_efectiva <= 0 OR f.proyeccion_cierre IS NULL OR f.proyeccion_cierre <= 0 OR f.es_fallback_lineal THEN 'gris'
        WHEN f.proyeccion_cierre < f.meta_efectiva * 0.95 OR (f.ritmo_actual IS NOT NULL AND f.ritmo_actual < 0.85) THEN 'rojo'
        WHEN f.proyeccion_cierre >= f.meta_efectiva THEN 'verde'
        ELSE 'amarillo'
      END
    ) ORDER BY f.empresa
  )
  INTO v_empresas
  FROM finales f;

  WITH g AS (
    SELECT
      SUM((e->>'ventas_ytd')::numeric)         AS ventas_ytd,
      SUM((e->>'proyeccion_cierre')::numeric)  AS proyeccion_cierre,
      SUM(COALESCE((e->>'meta_efectiva')::numeric, 0)) AS meta_total,
      SUM((e->>'ventas_prev_ytd_sp')::numeric) AS ventas_prev_ytd_sp_total,
      SUM(COALESCE((e->>'cierre_anio_anterior')::numeric, 0)) AS cierre_total_prev
    FROM jsonb_array_elements(COALESCE(v_empresas, '[]'::jsonb)) e
  ),
  g2 AS (
    SELECT g.*, CASE WHEN g.ventas_prev_ytd_sp_total > 0 THEN g.ventas_ytd / g.ventas_prev_ytd_sp_total ELSE NULL END AS ritmo_actual_grupo
    FROM g
  )
  SELECT jsonb_build_object(
    'ventas_ytd', COALESCE(g2.ventas_ytd, 0),
    'proyeccion_cierre', COALESCE(g2.proyeccion_cierre, 0),
    'proyeccion_restante', GREATEST(0, COALESCE(g2.proyeccion_cierre, 0) - COALESCE(g2.ventas_ytd, 0)),
    'meta_total', COALESCE(g2.meta_total, 0),
    'ritmo_actual_grupo', g2.ritmo_actual_grupo,
    'gap_vs_meta', CASE WHEN g2.meta_total > 0 THEN g2.proyeccion_cierre - g2.meta_total ELSE NULL END,
    'cierre_anio_anterior_total', COALESCE(g2.cierre_total_prev, 0),
    'delta_vs_anio_anterior_total', CASE WHEN COALESCE(g2.cierre_total_prev, 0) > 0 THEN g2.proyeccion_cierre - g2.cierre_total_prev ELSE NULL END,
    'delta_vs_anio_anterior_pct', CASE WHEN COALESCE(g2.cierre_total_prev, 0) > 0 THEN (g2.proyeccion_cierre - g2.cierre_total_prev) / g2.cierre_total_prev ELSE NULL END,
    'status', CASE
      WHEN COALESCE(g2.meta_total, 0) <= 0 THEN 'gris'
      WHEN g2.proyeccion_cierre < g2.meta_total * 0.95 OR (g2.ritmo_actual_grupo IS NOT NULL AND g2.ritmo_actual_grupo < 0.85) THEN 'rojo'
      WHEN g2.proyeccion_cierre >= g2.meta_total THEN 'verde'
      ELSE 'amarillo'
    END
  )
  INTO v_grupo FROM g2;

  RETURN jsonb_build_object(
    'anio', p_anio,
    'fecha_corte', to_char(v_fecha_corte, 'YYYY-MM-DD'),
    'mes_corte', v_mes_corte,
    'peso_ritmo', v_peso_ritmo,
    'peso_historico', v_peso_historico,
    'empresas', COALESCE(v_empresas, '[]'::jsonb),
    'totales_grupo', v_grupo
  );
END;
$$;

GRANT EXECUTE ON FUNCTION ventas_proyeccion_cierre_v7(int) TO service_role;

NOTIFY pgrst, 'reload schema';
