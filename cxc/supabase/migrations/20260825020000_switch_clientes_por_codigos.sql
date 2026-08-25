-- ============================================================================
--  QUIEN COMPRA UNA DESCRIPCION  (25-ago-2026)
-- ============================================================================
--  Daniel, textual, mirando Ventas > Productos: "no veo por clientes, me
--  gustaria saber por ejemplo, quien compra mas una descripcion, me explico?".
--  Al desplegar una fila, ademas de los codigos, la lista de clientes que la
--  compran, del que mas al que menos.
--
--  Esta funcion es un ACELERADOR, no un requisito: la ruta funciona sin ella
--  (cae a leer las lineas paginadas y agrupar en el servidor, ver
--  src/lib/ventas/productos-clientes-server.ts). Por eso la DDL es aditiva y se
--  puede correr cuando se quiera, sin ventana ni coordinacion.
--
--  QUE AHORRA, medido contra produccion el 25-ago-2026 sobre la descripcion mas
--  grande del grupo (vistana / "Men-T-Shirts S/S", ventana de 12 meses):
--  602 codigos y 1.780 lineas. Sin la funcion son 5 lotes de codigos x hasta 2
--  paginas de PostgREST = hasta 7 idas y vueltas contra una base en compute
--  Micro; con ella es UNA. En "Women-Flip Flops" de fashion_shoes son 2.938
--  lineas.
--
--  ---------------------------------------------------------------------------
--  LA LLAVE DEL CRUCE ES EL CODIGO, NO EL TEXTO DE LA DESCRIPCION. Medido.
--  ---------------------------------------------------------------------------
--  Las dos tablas nombran distinto al mismo producto, porque vienen de dos
--  endpoints distintos de Switch:
--
--     switch_articulo_diario   "Men-Shirts / Woven Tops L/S"
--     switch_factura_lineas    "Men-Shirts Woven Tops L/S"
--
--  Cruzando por TEXTO, en vistana (ventana de 12 meses) 39 de 136 descripciones
--  quedaban SIN UN SOLO CLIENTE -- 184.164,23 dolares, el 7,66% de la pantalla.
--  "Women-Small Leather Goods" facturaba 37.389,65 y su lista salia vacia: el
--  que la mira concluye que no la compra nadie, que es peor que no mostrarla.
--  Cruzando por CODIGO quedan 11 de 136 = 11.435,32 (0,48%), y la cobertura
--  sube a 99,47%.
--
--  El codigo NO se resuelve aca adentro: lo manda la ruta, que YA lo tiene
--  porque es el mismo que dibuja el bloque "Codigos" del mismo desplegable
--  (switch_articulos_por_descripcion). Asi los dos bloques del desplegable
--  hablan EXACTAMENTE del mismo conjunto de articulos, y el camino con funcion
--  y el camino sin funcion no pueden separarse: reciben la misma lista.
--
--  ---------------------------------------------------------------------------
--  SIGNOS: la nota de credito RESTA.
--  ---------------------------------------------------------------------------
--  switch_factura_lineas guarda MAGNITUDES en positivo (lo dice su CHECK) y el
--  signo lo pone la lectura mirando tipo_comprobante. Es la misma convencion de
--  switch_facturas y switch_articulo_diario. La firma del error cuando alguien
--  suma sin firmar es inconfundible: la diferencia da EXACTO el doble de las
--  notas de credito.
--
--  No es teorico en esta lista: en Active Shoes las NC son el 13,4% de las
--  unidades, y City Mall David devolvio el 58% de lo que se le facturo a 30
--  dolares. Un ranking bruto lo pondria donde no va.
--
--  OJO CON LA TILDE: el texto en la base es 'Nota de Credito' CON TILDE en la
--  e. Compararlo sin tilde no lanza ningun error -- simplemente el signo no se
--  aplica nunca y el total queda mal en silencio.
--
--  ---------------------------------------------------------------------------
--  FECHAS: el dia de PANAMA, no el UTC pelado.
--  ---------------------------------------------------------------------------
--  fecha es timestamptz y el periodo llega como dos DATE. Panama es UTC-5 fijo
--  (sin horario de verano), asi que el dia de negocio va de las 05:00 UTC a las
--  05:00 UTC del dia siguiente. Se compara con -05:00 explicito, que es la
--  misma convencion de sync-recibos. (Medido: en vistana las dos formas dan hoy
--  el mismo numero al centavo, porque Switch factura en horario de oficina;
--  se escribe correcto igual para que no dependa de esa suerte.)
--
--  Se usa un RANGO con >= y < contra la columna PELADA -- nunca una funcion
--  envolviendola -- para que siga entrando por idx_sfl_empresa_codigo_fecha.
--
--  Aplicar manual en Supabase Dashboard -> SQL Editor.
-- ============================================================================

CREATE OR REPLACE FUNCTION switch_clientes_por_codigos(
  p_empresa_key text,
  p_desde       date,
  p_hasta       date,
  p_codigos     text[],
  -- La grafia de la FILA. No decide el cruce (eso lo hacen los codigos): sirve
  -- para saber cual de las grafias es "esta" y cual es "la otra".
  p_descripcion text
)
RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  WITH agg AS (
    SELECT
      cliente_switch_id,
      -- El nombre del cliente se edita en Switch. La llave es el id (dos
      -- grafias del mismo cliente partirian su fila en dos); el nombre que se
      -- muestra es uno cualquiera de los vistos, que son el mismo cliente.
      MAX(cliente_nombre) AS cliente_nombre,
      SUM(CASE WHEN tipo_comprobante = 'Nota de Crédito'
               THEN -cantidad ELSE cantidad END)                             AS cantidad,
      SUM(CASE WHEN tipo_comprobante = 'Nota de Crédito'
               THEN -subtotal_con_descuento ELSE subtotal_con_descuento END) AS venta
    FROM switch_factura_lineas
    WHERE empresa_key = p_empresa_key
      AND codigo = ANY (p_codigos)
      AND fecha >= ((p_desde::text)     || 'T00:00:00-05:00')::timestamptz
      AND fecha <  (((p_hasta + 1)::text) || 'T00:00:00-05:00')::timestamptz
    GROUP BY cliente_switch_id
  ),
  -- ---------------------------------------------------------------------
  -- LAS GRAFIAS QUE SE SOLAPAN  (el aviso ambar de la pantalla)
  -- ---------------------------------------------------------------------
  -- 🩸 EN SWITCH EL MISMO PRODUCTO ESTA ESCRITO DE DOS FORMAS, y esto esta
  -- medido contra produccion el 25-ago-2026:
  --
  --     'Women-Small Leather Goods'  y  'Women-Small Leather'
  --     'Agua Dana 1.5 Litro'        y  'Agua Dana 1.5 litro '
  --
  -- Un CODIGO puede vivir bajo las dos. La FILA de la pantalla suma solo las
  -- filas de SU grafia; la lista de clientes trae TODAS las lineas de esos
  -- codigos. Resultado: en vistana, 23 de 103 descripciones muestran una lista
  -- que suma MAS que la fila -- 'Men-Shirts Woven S/S' dice 142,00 en la fila
  -- y 2.199,00 en la lista.
  --
  -- No se tapa y no se adivina: se DECLARA. Aca se devuelve con que otra
  -- grafia se solapa y por que codigo, para que la pantalla lo diga con todas
  -- las letras. Repartir la venta entre las dos grafias seria INVENTAR: el
  -- detalle de la linea no sabe nada de la descripcion de switch_articulo_diario.
  --
  -- ⛔ NO SE NORMALIZA nada (ni minusculas ni espacios). Arreglaria 7 de 36
  -- casos medidos y dejaria 29 mintiendo igual, y estrenaria una SEGUNDA idea
  -- de "que es la misma descripcion" conviviendo con la de la fila. La unica
  -- salida buena es corregir los nombres EN SWITCH; cuando eso pase, el aviso
  -- desaparece solo.
  grafias AS (
    SELECT DISTINCT ON (d.descripcion)
      d.descripcion AS otra,
      d.codigo
    FROM switch_articulo_diario d
    WHERE d.empresa_key = p_empresa_key
      AND d.fecha BETWEEN p_desde AND p_hasta
      AND d.codigo = ANY (p_codigos)
      AND COALESCE(d.descripcion, '(sin descripcion)') <> p_descripcion
    ORDER BY d.descripcion, d.codigo
  )
  SELECT jsonb_build_object(
    'clientes', COALESCE((
      SELECT jsonb_agg(t ORDER BY t.venta DESC)
      FROM (
        SELECT cliente_switch_id, cliente_nombre, cantidad, venta
        FROM agg
        -- Cero de las DOS no dice nada (compro 10 y devolvio 10). Cero en una
        -- sola SI dice algo -- una NC sin factura en la ventana -- y se queda.
        WHERE cantidad <> 0 OR venta <> 0
      ) t
    ), '[]'::jsonb),
    'grafias', COALESCE((SELECT jsonb_agg(g ORDER BY g.otra) FROM grafias g), '[]'::jsonb)
  );
$fn$;

GRANT EXECUTE ON FUNCTION switch_clientes_por_codigos(text, date, date, text[], text) TO service_role;

NOTIFY pgrst, 'reload schema';
