-- ============================================================================
--  VENTAS > PRODUCTOS: EL MISMO PRODUCTO, UN SOLO RENGLON  (25-ago-2026)
-- ============================================================================
--
--  EL SINTOMA, medido en produccion: `Agua Dana 600 ml 20 Und ` ($41.429, de
--  abr-2024 al 11-may-2026) y `Agua Dana 600 Ml 20 Und` ($11.264, del
--  30-jun-2026 a hoy) son DOS renglones de vistana. Es la misma agua.
--
--  LA CAUSA (probada sobre 7 codigos de 7 casos distintos, 7/7): en SWITCH hay
--  UNA SOLA DESCRIPCION. El reporte /apireporte/ventasucursal le pega a toda la
--  historia el nombre que el producto tiene HOY; nosotros guardamos el nombre
--  del DIA EN QUE BAJAMOS LA FILA, y el cron `switch-articulos` solo re-mira 3
--  dias (panamaDate(-3)), asi que todo lo anterior queda congelado con el
--  nombre viejo. Entre el 25-jun y el 10-jul-2026 limpiaron el catalogo en
--  Switch (espacios, mayusculas, `Goods`) y ahi se produjo el corte.
--
--  LA DECISION DE DANIEL, textual: "manda lo mas reciente". Vale para los 33
--  pares, sin excepcion -- incluidos los 5 que son categorias genuinamente
--  distintas. Sobre el mas caro (FW0FW05034-DW5, que vendio 3 anios como
--  Women-Sandals y el 17-ago paso a Women-Flip Flops): "si lo mas reciente es
--  17-ago alguien lo paso a Flip Flop, entonces es Flip Flop".
--
--  ---------------------------------------------------------------------------
--  LAS CUATRO REGLAS QUE ESTAS FUNCIONES NO PUEDEN ROMPER
--  ---------------------------------------------------------------------------
--
--  1. LA VENTA TOTAL NO SE MUEVE NI UN CENTAVO. Agrupar es juntar renglones:
--     ningun CASE, ningun filtro y ningun signo cambia respecto de
--     switch_top_descripciones. El unico filtro sigue siendo `venta <> 0`, y
--     como la venta de un grupo es la suma de sus partes, sacar un grupo que
--     dio 0 no le quita nada al total. (Medido: 24 combinaciones de empresa x
--     periodo, diferencia 0,000000.)
--
--  2. LA IDENTIDAD ES EL CODIGO, NUNCA EL PARECIDO DE DOS TEXTOS. Dos
--     descripciones se juntan si y solo si COMPARTEN UN CODIGO. Nada de
--     normalizar, ni de distancia de edicion: `Outlet Duty Free N2` y
--     `Outlet Duty Free N3` se parecen muchisimo y son dos cosas distintas.
--
--  3. "MAS RECIENTE" ES GLOBAL, NO DEL PERIODO QUE SE ESTA MIRANDO. En Switch
--     hay UNA sola descripcion -- la de hoy -- asi que el nombre de un producto
--     no puede depender de que ventana eligio el que mira. Y hay una razon
--     dura, no estetica: la columna "vs anio ant." cruza las dos ventanas POR
--     EL TEXTO DE LA DESCRIPCION. Si el nombre saliera del periodo, «Anio en
--     curso» diria `Agua Dana 600 Ml 20 Und` y su comparativo (2025) diria
--     `Agua Dana 600 ml 20 Und `, no se encontrarian, y los 137 renglones
--     unificados saldrian todos como "Nuevo".
--
--  4. EL DESEMPATE ES DETERMINISTA. Si el mismo codigo tiene dos descripciones
--     en su fecha MAS NUEVA, gana `MIN(id::text)`. Es el mismo criterio, y por
--     el mismo motivo, que multifashion_articulo_diario_agrupado_v1: se ordena
--     por `id::text` y no por `id` para no depender de min(uuid), que solo
--     existe desde PG14; el uuid se imprime en hex minuscula de sus 16 bytes en
--     orden, asi que el orden de texto es EL MISMO que el de uuid. Sin
--     desempate, dos corridas de la MISMA consulta pueden devolver nombres
--     distintos y nadie se entera.
--
--  ---------------------------------------------------------------------------
--  MIGRACION ADITIVA: NO REEMPLAZA A switch_top_descripciones
--  ---------------------------------------------------------------------------
--  Las funciones viejas siguen vivas, intactas y llamables. La ruta pide
--  primero las nuevas y, si PostgREST contesta "no existe esa funcion"
--  (PGRST202 / 42883), cae sola a las de siempre: SIN esta DDL la pantalla se
--  ve exactamente como se veia ayer -- el producto sigue partido y no aparece
--  ningun aviso -- y no se rompe nada. Correrla es lo que lo une.
--
--  ---------------------------------------------------------------------------
--  EL AVISO QUE REEMPLAZA AL QUE SE PIERDE
--  ---------------------------------------------------------------------------
--  Al unir por el nombre de hoy, un codigo MAL CLASIFICADO en Switch queda
--  tapado: antes se veia como dos renglones, ahora se ve como uno. Por eso
--  cada renglon devuelve tambien `grafias`: las OTRAS formas en que ese mismo
--  grupo aparece escrito en la ventana, con un codigo de ejemplo.
--
--  Esta funcion NO decide cual de esas grafias merece aviso -- eso lo decide
--  la capa de lectura contra `depurador_descripciones`, el catalogo aprobado,
--  que es el MISMO arbitro que uso el diagnostico. Una segunda definicion de
--  "que es una categoria de verdad" viviendo en SQL es exactamente el bug que
--  este repo ya pago varias veces.
--
--  Aplicar manual en Supabase Dashboard -> SQL Editor.
-- ============================================================================

-- ─── NIVEL 1: top por descripcion RECIENTE (sin limite; el cliente pagina) ───
CREATE OR REPLACE FUNCTION switch_top_descripciones_reciente(
  p_empresa_key text,
  p_desde       date,
  p_hasta       date
)
RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  WITH historia AS (
    -- UNA sola pasada por la historia del codigo, y de ella salen las DOS cosas
    -- que hacen falta: como se llama hoy, y de cuantas formas estuvo escrito.
    -- Una fila por (codigo, grafia), con la fila mas nueva de esa grafia.
    -- Sin filtro de fecha A PROPOSITO (regla 3 del encabezado).
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
    -- comparan sus dos minimos, que es el minimo global. Ahorra una pasada
    -- entera por la historia de la empresa -- 67.923 filas en fashion_wear.
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
  ),
  grafias AS (
    -- Las OTRAS formas en que este grupo aparece escrito, con UN codigo de
    -- ejemplo. Un renglon por grafia: el aviso tiene que caber en una linea, no
    -- ser un volcado de 600 codigos.
    --
    -- 🩸 SE MIRA TODA LA HISTORIA DEL CODIGO, NO LA VENTANA, y esta medido: el
    -- codigo KCSALYA929 de vistana vivio como `Women-Sandals` y como
    -- `Women-Flip Flops`, pero las dos grafias NO se solapan dentro de ninguno
    -- de los cuatro periodos de la pantalla. Acotando a la ventana, ese caso
    -- -- que es justo uno de los 5 mal clasificados -- no saldria en ningun
    -- lado. Y ademas: un aviso que aparece y desaparece segun el periodo
    -- elegido es un aviso en el que nadie confia.
    SELECT DISTINCT ON (g.descripcion, h.descripcion)
      g.descripcion, h.descripcion AS otra, h.codigo
    FROM (SELECT DISTINCT descripcion, codigo FROM base WHERE codigo IS NOT NULL) g
    JOIN historia h ON h.codigo = g.codigo AND h.descripcion <> g.descripcion
    ORDER BY g.descripcion, h.descripcion, h.codigo
  ),
  grafias_json AS (
    SELECT
      descripcion,
      jsonb_agg(jsonb_build_object('otra', otra, 'codigo', codigo) ORDER BY otra) AS grafias
    FROM grafias
    GROUP BY descripcion
  )
  SELECT COALESCE(jsonb_agg(t ORDER BY t.venta DESC, t.descripcion ASC), '[]'::jsonb)
  FROM (
    SELECT
      a.descripcion,
      a.num_codigos,
      a.cantidad,
      a.venta,
      a.costo,
      CASE WHEN a.venta > 0 THEN (a.venta - a.costo) / a.venta ELSE NULL END AS margen,
      COALESCE(g.grafias, '[]'::jsonb) AS grafias
    FROM agg a
    LEFT JOIN grafias_json g ON g.descripcion = a.descripcion
    WHERE a.venta <> 0
  ) t;
$fn$;

GRANT EXECUTE ON FUNCTION switch_top_descripciones_reciente(text, date, date) TO service_role;

-- ─── NIVEL 2: codigos de UNA descripcion RECIENTE (drill-down) ───────────────
CREATE OR REPLACE FUNCTION switch_articulos_por_descripcion_reciente(
  p_empresa_key text,
  p_desde       date,
  p_hasta       date,
  p_descripcion text
)
RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  WITH reciente AS (
    SELECT DISTINCT ON (codigo)
      codigo,
      descripcion
    FROM switch_articulo_diario
    WHERE empresa_key = p_empresa_key
      AND codigo IS NOT NULL
      AND descripcion IS NOT NULL
    ORDER BY codigo, fecha DESC, id::text ASC
  ),
  agg AS (
    SELECT
      d.codigo,
      SUM(CASE WHEN d.tipo = 'NC' THEN -d.cantidad_total ELSE d.cantidad_total END) AS cantidad,
      SUM(CASE WHEN d.tipo = 'NC' THEN -d.venta_total    ELSE d.venta_total    END) AS venta,
      SUM(CASE WHEN d.tipo = 'NC' THEN -d.costo_total    ELSE d.costo_total    END) AS costo
    FROM switch_articulo_diario d
    JOIN reciente r ON r.codigo = d.codigo
    WHERE d.empresa_key = p_empresa_key
      AND d.fecha BETWEEN p_desde AND p_hasta
      AND d.codigo IS NOT NULL
      AND r.descripcion = p_descripcion
    GROUP BY d.codigo
  )
  SELECT COALESCE(jsonb_agg(t ORDER BY t.venta DESC, t.codigo ASC), '[]'::jsonb)
  FROM (
    SELECT
      codigo,
      -- Todos los codigos del grupo comparten el nombre de hoy: es el de la
      -- fila de arriba. Devolverlo evita que el desplegable muestre la grafia
      -- vieja justo debajo del renglon que la unifico.
      p_descripcion AS descripcion,
      cantidad, venta, costo,
      CASE WHEN venta > 0 THEN (venta - costo) / venta ELSE NULL END AS margen
    FROM agg
    WHERE venta <> 0
  ) t;
$fn$;

GRANT EXECUTE ON FUNCTION switch_articulos_por_descripcion_reciente(text, date, date, text) TO service_role;

NOTIFY pgrst, 'reload schema';
