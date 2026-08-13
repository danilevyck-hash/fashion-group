-- ─────────────────────────────────────────────────────────────────────────────
-- home_dashboard_summary → la frescura del CXC es la del GRUPO, no la de Boston
--
-- ─── QUÉ ─────────────────────────────────────────────────────────────────────
-- Una sola línea: `lastUpload` (el "actualizado hace…" de la tarjeta de CXC en
-- el Inicio) pasa de
--     SELECT MAX(synced_at) FROM switch_estadocuenta
-- a
--     SELECT MAX(synced_at) FROM switch_estadocuenta
--     WHERE empresa_key NOT IN ('confecciones_boston')
--
-- ─── POR QUÉ ─────────────────────────────────────────────────────────────────
-- En `switch_estadocuenta` conviven las 6 empresas del grupo y
-- `confecciones_boston`, que lleva cartera APARTE y se sincroniza por su propio
-- camino (`/api/cron/boston-cartera`). Sin el filtro, la pregunta "¿hace cuánto
-- se actualizó el CXC del grupo?" la contesta la fila más nueva de CUALQUIERA:
-- un sync de Boston taparía un atraso real del grupo y la tarjeta diría "al día"
-- justo cuando hay que mirarla.
--
-- ⚠️ Es el MISMO defecto que la MV del aging (ver 20260812180000), en su versión
-- chica: acá no se suma plata, solo se contesta con la fecha equivocada. Y HOY
-- NO SE NOTA — medido el 12-ago-2026, Boston va 13 h más atrasada que el grupo
-- (08:10 UTC contra 21:22), así que el MAX global da exactamente el del grupo.
-- O sea que es un defecto LATENTE: el peor tipo para un indicador de frescura,
-- porque el día que Boston sincronice más tarde el número se vuelve mentira sin
-- que nada avise.
--
-- ─── LO QUE NO CAMBIA ───────────────────────────────────────────────────────
-- `cxcTotal` y `cxcVencida` YA salían de `switch_estadocuenta_aging`, la vista
-- que excluye a Boston: la PLATA del Inicio siempre estuvo bien y no se toca.
-- Ninguna otra clave del jsonb se toca, y la FIRMA es la misma
-- (date, timestamptz, int, int, int, int) → `CREATE OR REPLACE` in-place, el
-- frontend no se entera.
--
-- ─── CÓMO SE ARMÓ ESTE ARCHIVO ──────────────────────────────────────────────
-- El cuerpo está copiado PROGRAMÁTICAMENTE de la definición vigente
-- (`20260622130100_home_dashboard_summary_reclamos_2estados.sql`), sin tipear
-- una línea a mano, y el único cambio es el WHERE de arriba. Copiar un cuerpo
-- SQL a mano es exactamente el mecanismo que produjo el bug de la MV.
--
-- Se deja en un archivo APARTE del arreglo de la MV a propósito: aquél es el
-- urgente y no puede quedar sin correr porque éste falle.
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION home_dashboard_summary(
  p_dias_45 date,
  p_month_start timestamptz,
  p_current_year int,
  p_current_month int,
  p_prev_year int,
  p_prev_month int
)
RETURNS jsonb
LANGUAGE sql STABLE AS $$
  WITH periodo AS (
    SELECT id, fondo_inicial
    FROM caja_periodos
    WHERE estado = 'abierto'
    ORDER BY created_at DESC
    LIMIT 1
  ),
  caja_gastos_total AS (
    SELECT COALESCE(SUM(total), 0)::numeric AS total
    FROM caja_gastos
    WHERE periodo_id = (SELECT id FROM periodo)
      AND deleted = false
  )
  SELECT jsonb_build_object(
    'reclamosPendientes', (
      SELECT count(*) FROM reclamos
      WHERE deleted = false
        AND estado = 'Creado'
    ),
    'reclamosViejos', (
      SELECT count(*) FROM reclamos
      WHERE deleted = false
        AND estado = 'Creado'
        AND fecha_reclamo < p_dias_45
    ),
    'reclamosResueltosEsteMes', (
      SELECT count(*) FROM reclamos
      WHERE deleted = false
        AND estado = 'Pagado'
        AND updated_at >= p_month_start
    ),
    'guiasEsteMes', (
      SELECT count(*) FROM guia_transporte
      WHERE created_at >= p_month_start
    ),
    'guiasPendientes', (
      SELECT count(*) FROM guia_transporte
      WHERE estado = 'Pendiente Bodega' AND deleted = false
    ),
    'totalClientes', (
      SELECT count(*) FROM directorio_clientes
      WHERE deleted = false
    ),
    'prestamosPendientes', (
      SELECT count(*) FROM prestamos_movimientos
      WHERE estado = 'pendiente_aprobacion'
        AND (deleted IS NULL OR deleted = false)
    ),
    'lastUpload', (
      SELECT MAX(synced_at) FROM switch_estadocuenta
      WHERE empresa_key NOT IN ('confecciones_boston')
    ),
    'cxcTotal', COALESCE(
      (SELECT SUM(total) FROM switch_estadocuenta_aging), 0
    )::numeric,
    'cxcVencida', COALESCE(
      (SELECT SUM(COALESCE(d121_180,0) + COALESCE(d181_270,0) + COALESCE(d271_365,0) + COALESCE(mas_365,0)) FROM switch_estadocuenta_aging),
      0
    )::numeric,
    'ventasMes', COALESCE(
      (SELECT SUM(ventas_netas) FROM switch_ventas_unificado_vw
       WHERE EXTRACT(YEAR FROM mes)::int = p_current_year AND EXTRACT(MONTH FROM mes)::int = p_current_month),
      0
    )::numeric,
    'ventasPrev', COALESCE(
      (SELECT SUM(ventas_netas) FROM switch_ventas_unificado_vw
       WHERE EXTRACT(YEAR FROM mes)::int = p_prev_year AND EXTRACT(MONTH FROM mes)::int = p_prev_month),
      0
    )::numeric,
    'cajaPeriodoId', (SELECT id FROM periodo),
    'cajaFondo', (SELECT fondo_inicial FROM periodo),
    'cajaGastosTotal', (SELECT total FROM caja_gastos_total)
  )
$$;

GRANT EXECUTE ON FUNCTION home_dashboard_summary(date, timestamptz, int, int, int, int) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- Verificación post-aplicación:
--
--   -- La frescura del CXC ya no la puede contestar Boston. Las dos primeras
--   -- columnas tienen que ser IGUALES; la tercera es la de Boston, aparte.
--   SELECT (home_dashboard_summary(current_date, date_trunc('month', now()),
--             2026, 8, 2026, 7) ->> 'lastUpload')          AS home_dice,
--          (SELECT MAX(synced_at) FROM switch_estadocuenta
--            WHERE empresa_key NOT IN ('confecciones_boston')) AS grupo,
--          (SELECT MAX(synced_at) FROM switch_estadocuenta
--            WHERE empresa_key = 'confecciones_boston')        AS boston;
--
--   -- La plata del Inicio no cambió (sale de la vista, que ya excluía Boston).
--   SELECT (home_dashboard_summary(current_date, date_trunc('month', now()),
--             2026, 8, 2026, 7)) -> 'cxcTotal';
-- ─────────────────────────────────────────────────────────────────────────────
