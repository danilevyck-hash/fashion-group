-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: el INVENTARIO VALORIZADO lo suma Postgres, no el navegador.
--
-- QUE RESUELVE (medido contra produccion el 13-ago-2026):
--   `switch_articulo_info` tiene 16.180 filas y `db-max-rows` de PostgREST es
--   1000. Para responder ocho numeros por empresa habria que bajar la tabla
--   entera en 17 paginas SECUENCIALES, contra una base en compute Micro que ya
--   se cayo varias veces esta semana. Agrupado son 6 filas en UNA llamada.
--   Mismo precedente que multifashion_articulo_diario_agrupado_v1 (49 -> 3).
--
-- ── LO QUE ESTA FUNCION NO PUEDE ROMPER ─────────────────────────────────────
--
-- 1. SOLO CUENTA `existencia > 0`. La existencia NEGATIVA es una sobreventa
--    registrada en Switch, no mercancia que exista: valorizarla RESTARIA plata
--    del activo por unidades que no estan en ningun estante. Se devuelve aparte
--    (`neg`) para poder decirlo, jamas dentro del valor.
--
-- 2. "SIN COSTO" ES NULL **O** CERO. En Switch el costo que falta llega como 0,
--    no como nulo -- medido: 7 articulos, 873 unidades, 0 nulos. Mirar solo el
--    nulo dejaria el hueco entero sin avisar. El VALOR no cambia por esto
--    (existencia x 0 = 0); lo que se gana es poder decir cuanto quedo sin
--    valorizar en vez de sumarlo como cero en silencio.
--
-- 3. `m` ES EL SELLO MAS VIEJO de la empresa, no el mas nuevo. Si una parte del
--    catalogo quedo sin refrescar, la frescura del conjunto es la de esa parte.
--    Un MAX diria "al 13 de agosto" con medio catalogo parado en julio.
--
-- 4. NO FILTRA EMPRESAS. Devuelve lo que haya en la tabla; quien decide cuales
--    entran al total es el codigo (`EMPRESAS_CON_INVENTARIO`, derivado de las
--    6 que cubre el cron sync-articulo-info). Poner la lista aca seria una
--    SEGUNDA definicion de "que empresas tienen inventario", y dos listas de
--    empresas escritas en dos lados es el bug que este repo ya pago
--    (joystep fuera de recibos y utilidad: 15.262 dolares invisibles).
--
-- ── LAS SUMAS SON EXACTAS ───────────────────────────────────────────────────
-- Postgres suma `numeric` en decimal exacto; el codigo (camino paginado) suma
-- en coma flotante. Los dos caminos cierran al centavo con la MISMA regla
-- (redondeo por empresa, una sola vez) en src/lib/inventario/valorizado.ts, asi
-- que no pueden dar totales distintos.
--
-- ── SIN ESTA MIGRACION LA PANTALLA FUNCIONA IGUAL ───────────────────────────
-- La lectura llama la RPC y, si PostgREST contesta "no existe esa funcion"
-- (PGRST202 / 42883), cae sola al camino paginado y lo dice en el campo
-- `fuente` de la respuesta. Se puede desplegar el codigo ANTES de correr este
-- SQL; correrlo despues solo lo hace barato.
--
-- Seguro de correr en caliente: es SOLO LECTURA, no toca ninguna tabla.
-- Aplicar manual en Supabase Dashboard -> SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION inventario_valorizado_v1()
RETURNS TABLE (
  e   text,        -- empresa_key
  art bigint,      -- articulos del catalogo (con y sin stock)
  stk bigint,      -- articulos con existencia > 0
  u   numeric,     -- piezas en bodega
  c   numeric,     -- valor AL COSTO (el numero que manda)
  p   numeric,     -- valor a precio de etiqueta (potencial)
  sca bigint,      -- articulos con stock y SIN costo cargado
  scu numeric,     -- piezas que quedan sin valorizar
  neg numeric,     -- existencia negativa (sobreventa), fuera del valor
  m   timestamptz  -- sello MAS VIEJO de la empresa
)
LANGUAGE sql
STABLE
AS $fn$
  SELECT
    i.empresa_key,
    COUNT(*),
    COUNT(*) FILTER (WHERE i.existencia > 0),
    COALESCE(SUM(i.existencia) FILTER (WHERE i.existencia > 0), 0),
    COALESCE(SUM(i.existencia * i.costo_api)
             FILTER (WHERE i.existencia > 0 AND i.costo_api IS NOT NULL AND i.costo_api <> 0), 0),
    COALESCE(SUM(i.existencia * i.precio_etiqueta)
             FILTER (WHERE i.existencia > 0 AND i.precio_etiqueta IS NOT NULL), 0),
    COUNT(*) FILTER (WHERE i.existencia > 0 AND (i.costo_api IS NULL OR i.costo_api = 0)),
    COALESCE(SUM(i.existencia)
             FILTER (WHERE i.existencia > 0 AND (i.costo_api IS NULL OR i.costo_api = 0)), 0),
    COALESCE(SUM(i.existencia) FILTER (WHERE i.existencia < 0), 0),
    MIN(i.synced_at)
  FROM switch_articulo_info i
  GROUP BY i.empresa_key;
$fn$;

GRANT EXECUTE ON FUNCTION inventario_valorizado_v1() TO service_role;

NOTIFY pgrst, 'reload schema';

-- ── Verificacion (correr despues; debe dar 6 filas y cuadrar con la pantalla) ─
--   SELECT * FROM inventario_valorizado_v1() ORDER BY c DESC;
