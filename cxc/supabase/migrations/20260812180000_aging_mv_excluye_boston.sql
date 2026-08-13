-- ─────────────────────────────────────────────────────────────────────────────
-- switch_estadocuenta_aging_mv = LA MISMA CARTERA QUE LA VISTA DEL GRUPO
--
-- ─── EL BUG ─────────────────────────────────────────────────────────────────
-- La migración del 28-jul (`20260728120000_aging_grupo_y_boston_aparte.sql`) le
-- puso a la VISTA `switch_estadocuenta_aging` el filtro que deja a Boston
-- afuera, y **se olvidó de la MV**. La MV es una COPIA verbatim del cuerpo de la
-- vista (así nació, en `20260622180000`), así que quedó leyendo
-- `switch_estadocuenta` entera, sin filtro de empresa.
--
-- Mientras Boston tuvo 0 filas de estado de cuenta el olvido no se veía. Desde
-- que su cartera se carga (`/api/cron/boston-cartera`, 30-jul) la MV empezó a
-- traer 382 filas de Boston, y **`/api/cxc/aging` lee la MV**, no la vista.
-- Medido en producción el 12-ago-2026:
--
--   VIEW switch_estadocuenta_aging     211 filas ·   0 de Boston  ✅
--   MV   switch_estadocuenta_aging_mv  593 filas · 382 de Boston  ❌
--
-- ─── QUÉ SE VE Y QUÉ NO — MEDIDO, NO SUPUESTO ───────────────────────────────
-- 🔴 **Las tarjetas del panel NO están mostrando un número inflado.** Medido en
-- el navegador contra el build de producción y con datos de producción, con la
-- MV rota tal como está hoy:
--
--   /api/cxc/aging devuelve   593 filas · 382 de Boston   ← la fuga, real
--   El panel muestra          Total $3.718.004,16 · 99 clientes
--                             0-90d $1.816.089,65 · 91-120d $763.886,47
--                             121d+ $1.138.028,04
--
-- O sea: los números en pantalla YA son los correctos, y **después de correr
-- esta migración van a ser EXACTAMENTE LOS MISMOS**. No hay antes-y-después que
-- reportar en las tarjetas, y decir lo contrario sería inventar una regresión.
--
-- 🩸 **Lo que los salva es una proyección en React, y es lo único que hay entre
-- Boston y la pantalla.** `admin/page.tsx` (`roleClients` / `filtered`) recorre
-- lo que devolvió el API y se queda solo con las 6 empresas del grupo, así que
-- las 382 filas de Boston llegan al navegador y ahí se descartan. Eso es
-- exactamente lo que el diseño de la vista quería evitar — la migración del
-- 28-jul lo dice con todas las letras: "unas 20 rutas leen esta vista […]
-- blindar 20 sitios uno por uno deja la garantía a cargo de que nadie se olvide,
-- y la pantalla 21 que alguien escriba mañana nace insegura". Hoy la garantía
-- está a cargo de un `useMemo`.
--
-- 🔴 **Lo que ese `useMemo` está tapando, si se lo saca o si alguien lee el
-- payload crudo:** total $3.905.038,06 (+$187.033,90, la cartera de Boston
-- entera, tramo por tramo) y 476 clientes en vez de 99. Y —lo peor— el CXC
-- consolida por `nombre_normalized`, así que **5 clientes quedarían con las dos
-- deudas SUMADAS en una sola fila**, que es literalmente lo que Daniel prohibió:
--   ALADDIN                $1.247,00 + $11.176,58 =  $12.423,58
--   LA FRONTERA DUTY FREE $380.732,79 + $5.077,69 = $385.810,48
--   WOLF MALL CENTER INT   $19.993,08 + $1.010,67 =  $21.003,75
--   CITY MALL PASO CANOA  $664.927,91 +     $25,66 = $664.953,57
--   VENTAS LOCAL               -$6,50 +     $25,15 =      $18,65
--
-- Con esto arreglado, el CXC vuelve a estar separado POR CONSTRUCCIÓN y no por
-- una proyección que alguien puede tocar sin saber qué sostiene. De paso, el
-- payload baja de 593 filas a 211.
--
-- ─── LA REGLA, dicha por Daniel (12-ago-2026), textual ───────────────────────
--   "debe de ser cxc de fashion group y otro aparte de boston, no deben de ni
--    convivir juntos. cxc de fashion group si debe de convivir con todo el
--    sistema por guias, marketing, clientes, ventas, ect, ect, eso quiero que
--    este muy claro."
-- Son DOS afirmaciones y las dos importan: Boston no se mezcla NUNCA con el
-- grupo, y el CXC del grupo SÍ convive con el resto del sistema (aislarlo de
-- más también sería un error).
--
-- ─── EL ARREGLO: la MV DEJA DE SER UNA COPIA ────────────────────────────────
-- No se le agrega el `NOT IN` a la copia — eso arregla HOY y deja el mismo
-- defecto para mañana: dos cuerpos SQL idénticos que hay que acordarse de tocar
-- juntos. La MV pasa a **materializar la vista**:
--
--     SELECT v.*, now() AS materializado_en FROM switch_estadocuenta_aging v
--
-- Con eso la definición de "cartera del grupo" queda en UN solo lugar (la
-- vista), y la MV no puede volver a apartarse de ella ni aunque alguien cambie
-- los buckets, el signo defensivo o la lista de empresas: hereda todo por
-- construcción. El costo de refrescar es el mismo (es la misma consulta) y las
-- COLUMNAS son las mismas — `SELECT v.*` sobre la vista devuelve exactamente las
-- 26 que el CXC ya lee, más `materializado_en`.
--
-- ⚠️ Hay que DROP + CREATE porque el cuerpo de una MV no se puede reemplazar
-- (`CREATE OR REPLACE MATERIALIZED VIEW` no existe en Postgres). Es seguro: la
-- MV es dato DERIVADO, se repuebla sola con el `CREATE ... AS` (WITH DATA por
-- defecto) y **no hay ventana ciega** — `/api/cxc/aging` ya cae solo a la VIEW
-- en vivo si la MV no responde (route.ts:45), y la VIEW da los números BUENOS.
--
-- ─── LO QUE NO CAMBIA ───────────────────────────────────────────────────────
-- - `refresh_switch_estadocuenta_aging_mv()` (la llama el cron
--   `refresh-clientes-views` a las 07:35 UTC y la reconciliación). Se reescribe
--   igual, solo para que esta migración sea autosuficiente en una base nueva.
--   El REFRESH CONCURRENTLY necesita el UNIQUE INDEX, que se recrea abajo.
-- - `switch_estadocuenta_aging_boston` no se toca: la pestaña de Boston tiene
--   que seguir mostrando lo mismo (382 filas, $187.033,90).
-- - Ninguna de las 6 empresas del grupo mueve un centavo: lo único que sale son
--   las filas de `confecciones_boston`.
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- Guarda: si la vista del grupo no existe, no se sigue. Sin esto el CREATE de
-- abajo fallaría con un mensaje de Postgres que no dice qué hacer, y —peor— si
-- alguien la corriera contra una base donde la vista se llama distinto, se
-- crearía una MV vacía que el CXC leería como "no hay cartera".
DO $guard$
BEGIN
  IF to_regclass('public.switch_estadocuenta_aging') IS NULL THEN
    RAISE EXCEPTION 'Falta la vista switch_estadocuenta_aging — corré primero 20260728120000_aging_grupo_y_boston_aparte.sql';
  END IF;
END
$guard$;

DROP MATERIALIZED VIEW IF EXISTS switch_estadocuenta_aging_mv;

-- La MV es la vista, materializada. `materializado_en` = cuándo se refrescó, y
-- es lo único que la MV agrega: el CXC lo muestra como la frescura real del dato
-- (no la hora del request). Ver `useAdminData.ts`.
CREATE MATERIALIZED VIEW switch_estadocuenta_aging_mv AS
SELECT v.*, now() AS materializado_en
FROM switch_estadocuenta_aging v;

-- Necesario para REFRESH ... CONCURRENTLY (no bloquea lecturas).
-- `id` = md5(empresa_key|cliente_codigo)::uuid, único por fila. Si algún día un
-- (empresa_key, cliente_codigo) se partiera en >1 cliente_switch_id, el REFRESH
-- fallaría RUIDOSAMENTE — que es lo correcto: sería una anomalía del dato.
CREATE UNIQUE INDEX IF NOT EXISTS idx_estadocuenta_aging_mv_id
  ON switch_estadocuenta_aging_mv (id);

GRANT SELECT ON switch_estadocuenta_aging_mv TO service_role;
GRANT SELECT ON switch_estadocuenta_aging_mv TO authenticated;
GRANT SELECT ON switch_estadocuenta_aging_mv TO anon;

-- Misma función de siempre (la resuelve por nombre en tiempo de ejecución, así
-- que el DROP/CREATE de arriba no la rompe). Se reescribe para que esta
-- migración baste por sí sola en una base nueva.
CREATE OR REPLACE FUNCTION refresh_switch_estadocuenta_aging_mv()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY switch_estadocuenta_aging_mv;
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_switch_estadocuenta_aging_mv() TO service_role;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- Verificación post-aplicación (esperado a la derecha, medido el 12-ago-2026):
--
--   -- 1. Boston YA NO está en la MV del grupo.            esperado: 0
--   SELECT COUNT(*) FROM switch_estadocuenta_aging_mv
--   WHERE company_key = 'confecciones_boston';
--
--   -- 2. La MV y la VIEW dicen EXACTAMENTE lo mismo.      esperado: 0 filas
--   SELECT 'solo en la MV' AS donde, id FROM switch_estadocuenta_aging_mv
--     EXCEPT SELECT 'solo en la MV', id FROM switch_estadocuenta_aging
--   UNION ALL
--   SELECT 'solo en la VIEW', id FROM switch_estadocuenta_aging
--     EXCEPT SELECT 'solo en la VIEW', id FROM switch_estadocuenta_aging_mv;
--
--   -- 3. Los totales del panel.        esperado: 211 filas / 3718004.16
--   SELECT COUNT(*) AS filas, ROUND(SUM(total)::numeric, 2) AS total
--   FROM switch_estadocuenta_aging_mv;
--
--   -- 4. La pestaña de Boston NO cambió.  esperado: 382 / 187033.90
--   SELECT COUNT(*) AS clientes, ROUND(SUM(total)::numeric, 2) AS total
--   FROM switch_estadocuenta_aging_boston;
--
--   -- 5. El refresh sigue funcionando (y sigue siendo CONCURRENTLY).
--   SELECT refresh_switch_estadocuenta_aging_mv();
-- ─────────────────────────────────────────────────────────────────────────────
