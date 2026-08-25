-- ============================================================================
--  QUE ME COMPRA UN CLIENTE  (26-ago-2026)  -- el camino INVERSO del #591
-- ============================================================================
--  El #591 dejo "descripcion -> clientes" (abrir una fila y ver quien la
--  compra). Esta funcion es la vuelta: elegir un CLIENTE y que toda la tabla de
--  Ventas > Productos conteste "que me compra mas este", y "que me dejo de
--  comprar" comparando contra el mismo periodo del anio anterior.
--
--  ACELERADOR, NO REQUISITO: la ruta funciona sin ella (cae a leer paginado y
--  agrupar en el servidor, ver src/lib/ventas/productos-por-cliente-server.ts).
--  La DDL es aditiva y se corre cuando se quiera, sin ventana ni coordinacion.
--
--  QUE AHORRA, medido contra produccion el 26-ago-2026:
--    fashion_wear, ventana de 12 meses = 23.246 lineas + 21.128 filas de
--    switch_articulo_diario. Sin la funcion son hasta 46 idas y vueltas de
--    PostgREST (1.000 filas por pagina, el tope de Supabase) contra una base en
--    compute Micro; con ella es UNA, y devuelve 1.199 filas agregadas.
--    vistana, mismo rango: 14.474 lineas -> 930 filas agregadas.
--
--  ---------------------------------------------------------------------------
--  LA LLAVE DEL CRUCE ES EL CODIGO, Y ES EL MISMO CRUCE DEL #591.
--  ---------------------------------------------------------------------------
--  Las dos tablas nombran distinto al mismo producto, porque vienen de dos
--  endpoints distintos de Switch:
--
--     switch_articulo_diario   "Men-Shirts / Woven Tops L/S"
--     switch_factura_lineas    "Men-Shirts Woven Tops L/S"
--
--  Cruzando por TEXTO, en vistana 39 de 136 descripciones quedaban SIN UN SOLO
--  cliente (184.164,23 dolares = 7,66% de la pantalla). Por CODIGO quedan 11
--  (11.435,32 = 0,48%). Aca se lee el MISMO join que en
--  switch_clientes_por_codigos, en la otra direccion: alli entra una lista de
--  codigos y salen clientes; aca entra un cliente (o ninguno) y sale la
--  descripcion con la que la pantalla ya nombra a cada articulo.
--
--  UN CODIGO PUEDE VIVIR BAJO DOS GRAFIAS ('Women-Small Leather Goods' y
--  'Women-Small Leather'). Gana la MAS RECIENTE -- una regla, no un empate
--  resuelto al azar. El solape se sigue DICIENDO donde ya se decia: el aviso
--  ambar del desplegable, que esto no toca.
--
--  ---------------------------------------------------------------------------
--  NO HAY MARGEN POR CLIENTE, Y NO SE PUEDE INVENTAR.
--  ---------------------------------------------------------------------------
--  switch_factura_lineas NO TRAE COSTO. Esta funcion devuelve PIEZAS y VENTA y
--  nada mas. Cualquier "margen del cliente" que aparezca en pantalla sale de
--  otro lado y es mentira.
--
--  ---------------------------------------------------------------------------
--  SIGNOS: la nota de credito RESTA.  (misma convencion que el #591)
--  ---------------------------------------------------------------------------
--  switch_factura_lineas guarda MAGNITUDES en positivo (lo dice su CHECK) y el
--  signo lo pone la lectura mirando tipo_comprobante. La firma del error cuando
--  alguien suma sin firmar es inconfundible: la diferencia da EXACTO el doble
--  de las notas de credito.
--
--  OJO CON LA TILDE: el texto en la base es 'Nota de Credito' CON TILDE en la
--  e. Compararlo sin tilde no lanza ningun error -- el signo no se aplica nunca
--  y el total queda mal en silencio.
--
--  ---------------------------------------------------------------------------
--  FECHAS: el dia de PANAMA, no el UTC pelado.
--  ---------------------------------------------------------------------------
--  fecha es timestamptz y el periodo llega como dos DATE. Panama es UTC-5 fijo.
--  Se usa un RANGO con >= y < contra la columna PELADA -- nunca una funcion
--  envolviendola -- para que siga entrando por los indices
--  idx_sfl_empresa_cliente_fecha (con p_cliente_id) y idx_sfl_empresa_codigo_fecha.
--
--  Aplicar manual en Supabase Dashboard -> SQL Editor.
-- ============================================================================

CREATE OR REPLACE FUNCTION switch_productos_por_cliente(
  p_empresa_key text,
  p_desde       date,
  p_hasta       date,
  -- NULL = todos los clientes (la matriz que llena el desplegable y filtra la
  -- tabla). Un id = solo ese cliente, que es como se pide la ventana ANTERIOR
  -- para armar "que dejo de comprar" sin traerse el periodo entero.
  p_cliente_id  bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  WITH mapa AS (
    SELECT DISTINCT ON (d.codigo)
      d.codigo,
      COALESCE(d.descripcion, '(sin descripción)') AS descripcion
    FROM switch_articulo_diario d
    WHERE d.empresa_key = p_empresa_key
      AND d.fecha BETWEEN p_desde AND p_hasta
      AND d.codigo IS NOT NULL
    ORDER BY d.codigo, d.fecha DESC
  ),
  -- UNA sola pasada por las lineas: de aca salen las filas agregadas Y el conteo
  -- de las que no tienen descripcion. Contarlas con una segunda consulta seria
  -- pagar el escaneo dos veces en una base en compute Micro.
  base AS (
    SELECT
      l.cliente_switch_id,
      l.cliente_nombre,
      m.descripcion,
      CASE WHEN l.tipo_comprobante = 'Nota de Crédito'
           THEN -l.cantidad ELSE l.cantidad END                             AS cantidad,
      CASE WHEN l.tipo_comprobante = 'Nota de Crédito'
           THEN -l.subtotal_con_descuento ELSE l.subtotal_con_descuento END AS venta
    FROM switch_factura_lineas l
    LEFT JOIN mapa m ON m.codigo = l.codigo
    WHERE l.empresa_key = p_empresa_key
      AND (p_cliente_id IS NULL OR l.cliente_switch_id = p_cliente_id)
      AND l.fecha >= ((p_desde::text)       || 'T00:00:00-05:00')::timestamptz
      AND l.fecha <  (((p_hasta + 1)::text) || 'T00:00:00-05:00')::timestamptz
  ),
  agg AS (
    SELECT
      cliente_switch_id,
      -- El nombre del cliente se edita en Switch. La llave es el id (dos
      -- grafias del mismo cliente partirian su fila en dos); el nombre que se
      -- muestra es uno cualquiera de los vistos, que son el mismo cliente.
      MAX(cliente_nombre) AS cliente_nombre,
      descripcion,
      SUM(cantidad) AS cantidad,
      SUM(venta)    AS venta
    FROM base
    WHERE descripcion IS NOT NULL
    GROUP BY cliente_switch_id, descripcion
  )
  SELECT jsonb_build_object(
    'filas', COALESCE((
      SELECT jsonb_agg(t ORDER BY t.venta DESC)
      FROM (
        SELECT cliente_switch_id, cliente_nombre, descripcion, cantidad, venta
        FROM agg
        -- Cero de las DOS no dice nada (compro 10 y devolvio 10). Cero en una
        -- sola SI dice algo -- una NC sin factura en la ventana -- y se queda.
        WHERE cantidad <> 0 OR venta <> 0
      ) t
    ), '[]'::jsonb),
    -- Lineas cuyo codigo no aparece en switch_articulo_diario de la ventana. NO
    -- se les inventa una descripcion con el texto de la linea: seria estrenar
    -- una segunda forma de nombrar el mismo producto. Se cuentan y se dicen.
    'sin_descripcion', (SELECT COUNT(*)::int FROM base WHERE descripcion IS NULL)
  );
$fn$;

GRANT EXECUTE ON FUNCTION switch_productos_por_cliente(text, date, date, bigint) TO service_role;

NOTIFY pgrst, 'reload schema';
