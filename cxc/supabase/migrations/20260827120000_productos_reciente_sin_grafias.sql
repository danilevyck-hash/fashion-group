-- ============================================================================
--  Ventas > Productos: la RPC de nivel 1 deja de calcular `grafias`
--  25-ago-2026
--
--  ---------------------------------------------------------------------------
--  POR QUE
--  ---------------------------------------------------------------------------
--  `switch_top_descripciones_reciente` (migracion 20260825160000) devolvia, al
--  lado de cada renglon, `grafias`: las OTRAS formas en que ese mismo grupo
--  aparecia escrito. Ese dato tenia UN solo consumidor -- el aviso ambar de la
--  fila, «Revisar: FW0FW05034-DW5 tambien esta en Women-Sandals», que la capa
--  de lectura armaba cruzandolo contra `depurador_descripciones`.
--
--  🔴 ESE AVISO SE RETIRO por orden de Daniel. Nacio para que el revisara los 5
--  codigos mal clasificados en Switch. YA LOS REVISO y decidio, textual: *"si
--  lo mas reciente es 17-ago alguien lo paso a Flip Flop, entonces es Flip
--  Flop"* -- o sea que la clasificacion que Switch tiene HOY es la correcta y
--  no hay nada que corregir. El aviso quedo pidiendo una accion ya tomada.
--
--  Sin consumidor, `grafias` es trabajo que la base hace para nadie: un JOIN
--  contra TODA la historia del codigo (`historia`, sin filtro de fecha: 67.923
--  filas solo en fashion_wear) mas un `jsonb_agg` por descripcion, en cada
--  carga de pantalla y en compute Micro. Se poda.
--
--  ---------------------------------------------------------------------------
--  ⚠️ LO QUE NO SE TOCA -- Y ES LO QUE IMPORTA
--  ---------------------------------------------------------------------------
--  La AGRUPACION POR EL NOMBRE MAS RECIENTE se queda IDENTICA. Es lo que hace
--  que el `Agua Dana 600 ml 20 Und ` de vistana salga en UN renglon de
--  35.305,20 dolares en vez de dos. El CTE `historia` NO se va: `reciente` sale de el.
--  Lo unico que desaparece son los CTE `grafias` / `grafias_json`, el LEFT JOIN
--  y la columna `grafias` del SELECT final.
--
--  🔴 NINGUN NUMERO SE MUEVE: `agg` (descripcion, num_codigos, cantidad, venta,
--  costo, margen) queda letra por letra igual. Se le saca una columna JSON a la
--  salida, no una fila ni un centavo.
--
--  ---------------------------------------------------------------------------
--  MIGRACION ADITIVA
--  ---------------------------------------------------------------------------
--  Es un CREATE OR REPLACE de la misma funcion, con la misma firma y el mismo
--  RETURNS jsonb. No borra nada, no toca `switch_top_descripciones` (la vieja,
--  que sigue siendo el respaldo de `rpcConFallbackDeVersion`) ni
--  `switch_articulos_por_descripcion_reciente`.
--
--  ⚠️ SI 20260825160000 TODAVIA NO CORRIO, correr esta sola ALCANZA para el
--  nivel 1: define la funcion entera. El nivel 2
--  (`switch_articulos_por_descripcion_reciente`) sigue viviendo alla, asi que
--  lo ordenado es correr las dos, en orden.
--
--  ⛔ SI NO SE CORRE NINGUNA DE LAS DOS no se rompe nada: la ruta cae sola a
--  `switch_top_descripciones` y la pantalla se ve como se veia antes del #597.
--  Y si esta corrida la vieja version CON `grafias`, tampoco: la capa de
--  lectura ya no mira ese campo, simplemente lo ignora.
--
--  Aplicar manual en Supabase Dashboard -> SQL Editor.
-- ============================================================================

CREATE OR REPLACE FUNCTION switch_top_descripciones_reciente(
  p_empresa_key text,
  p_desde       date,
  p_hasta       date
)
RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  WITH historia AS (
    -- Una fila por (codigo, grafia), con la fila mas nueva de esa grafia.
    -- Sin filtro de fecha A PROPOSITO: "el nombre que el codigo tiene HOY" no
    -- puede depender del periodo que este elegido arriba, o el mismo producto
    -- se llamaria distinto en «Año pasado» que en «Año en curso».
    SELECT DISTINCT ON (codigo, descripcion)
      codigo,
      descripcion,
      fecha,
      id::text AS orden
    FROM switch_articulo_diario
    WHERE empresa_key = p_empresa_key
      AND codigo IS NOT NULL
      AND descripcion IS NOT NULL
    ORDER BY codigo, descripcion, fecha DESC, id::text ASC
  ),
  reciente AS (
    -- El nombre que ese codigo tiene HOY = el de su fila con la fecha mas nueva.
    --
    -- 🔑 Sacarlo de `historia` en vez de la tabla da EXACTAMENTE lo mismo, y no
    -- es casualidad: la fila mas nueva del codigo pertenece a alguna grafia, y
    -- `historia` ya se quedo con la mas nueva de CADA grafia (desempatando por
    -- el mismo MIN(id::text)). Si dos grafias empatan en la fecha mas nueva, se
    -- comparan sus dos minimos, que es el minimo global.
    SELECT DISTINCT ON (codigo)
      codigo,
      descripcion
    FROM historia
    ORDER BY codigo, fecha DESC, orden ASC
  ),
  base AS (
    SELECT
      -- Sin codigo no hay identidad que seguir: esa fila se queda con su
      -- propio texto, igual que en switch_top_descripciones.
      COALESCE(
        CASE WHEN d.codigo IS NOT NULL THEN r.descripcion END,
        d.descripcion,
        '(sin descripcion)'
      ) AS descripcion,
      d.codigo,
      d.tipo,
      d.cantidad_total,
      d.venta_total,
      d.costo_total
    FROM switch_articulo_diario d
    LEFT JOIN reciente r ON r.codigo = d.codigo
    WHERE d.empresa_key = p_empresa_key
      AND d.fecha BETWEEN p_desde AND p_hasta
  ),
  agg AS (
    -- 🩸 IDENTICO a switch_top_descripciones salvo por QUE se agrupa. Los
    -- signos, el filtro y la formula del margen se copian LITERAL: si esto se
    -- reescribiera "mejor", la venta total dejaria de cuadrar y el motivo
    -- estaria escondido en un CASE.
    SELECT
      descripcion,
      COUNT(DISTINCT codigo) FILTER (WHERE codigo IS NOT NULL) AS num_codigos,
      SUM(CASE WHEN tipo = 'NC' THEN -cantidad_total ELSE cantidad_total END) AS cantidad,
      SUM(CASE WHEN tipo = 'NC' THEN -venta_total    ELSE venta_total    END) AS venta,
      SUM(CASE WHEN tipo = 'NC' THEN -costo_total    ELSE costo_total    END) AS costo
    FROM base
    GROUP BY descripcion
  )
  -- ⛔ ACA IBAN LOS CTE `grafias` / `grafias_json` y su LEFT JOIN. Alimentaban
  -- el aviso ambar de la fila, que se retiro (ver el encabezado). El resto de
  -- este SELECT es el mismo, columna por columna.
  SELECT COALESCE(jsonb_agg(t ORDER BY t.venta DESC, t.descripcion ASC), '[]'::jsonb)
  FROM (
    SELECT
      a.descripcion,
      a.num_codigos,
      a.cantidad,
      a.venta,
      a.costo,
      CASE WHEN a.venta > 0 THEN (a.venta - a.costo) / a.venta ELSE NULL END AS margen
    FROM agg a
    WHERE a.venta <> 0
  ) t;
$fn$;

GRANT EXECUTE ON FUNCTION switch_top_descripciones_reciente(text, date, date) TO service_role;

NOTIFY pgrst, 'reload schema';
