-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: las DOS lecturas de "Multifashion > Productos" pasan a Postgres.
--
-- QUE RESUELVE (medido contra produccion el 9-ago-2026, ventana de 12 meses
-- 2025-09-01 -> 2026-08-09):
--   La ruta se bajaba 20.483 filas crudas de `switch_articulo_diario` en 21
--   paginas SECUENCIALES de PostgREST (db-max-rows = 1000), otras 18.417 del
--   periodo de comparacion y 8.454 del diccionario de marcas: 48 idas y vueltas
--   a Supabase, una detras de otra. Respuesta medida: 8,6 - 9,0 s.
--   Postgres puede devolver eso YA SUMADO: las 20.483 filas se agrupan en 4.740
--   (4,32x menos) y viajan en UNA sola llamada.
--
-- ── LA REGLA QUE ESTA FUNCION NO PUEDE ROMPER ───────────────────────────────
--
-- 🩸 EL SIGNO NO ESTA EN LOS DATOS Y ESTA FUNCION NO LO PONE. `venta_total`,
--    `costo_total` y `cantidad_total` se guardan como MAGNITUD positiva, notas
--    de credito incluidas (ver switch-api/client.ts:840 y la migracion
--    20260605020000). El signo contable lo aplica la LECTURA mirando `tipo`.
--
--    Por eso `tipo` ES PARTE DE LA LLAVE DE AGRUPACION y las magnitudes se
--    suman SIN firmar: la funcion pre-suma, no decide. La resta de las NC sigue
--    viviendo donde ya vivia y donde ya tiene candado — `signoDeTipo()` en
--    src/lib/multifashion/productos-ranking.ts. Firmar aca habria creado una
--    SEGUNDA definicion del signo, y dos definiciones del signo es el bug que
--    este repo ya pago dos veces (CLAUDE.md, "Signos contables": la diferencia
--    da EXACTAMENTE el doble de las NC).
--
--    Corolario: agrupar es SEGURO porque la llave es mas FINA que la que usa el
--    codigo. La pantalla agrupa por categoria (`descripcion` con los espacios
--    colapsados) y por codigo; aca se agrupa por (articulo_id, codigo,
--    descripcion, tipo) SIN normalizar nada. Dos textos que el codigo junta
--    llegan separados y el codigo los junta igual que siempre. Al reves seria
--    imposible de deshacer.
--
-- ── LAS OTRAS TRES COSAS QUE HACEN QUE NINGUN NUMERO CAMBIE ─────────────────
--
-- 1. `orden` = MIN(id) DEL GRUPO, y el arreglo sale ORDENADO POR EL.
--    La lectura de hoy pagina con `.order("id")`, y de ese orden depende un
--    dato visible: la segunda linea de la tabla ("por articulo") es la
--    descripcion de la PRIMERA fila que la traiga. Medido el 9-ago: **69 de
--    3.941 codigos tienen MAS DE UNA descripcion en la ventana**
--    ("Women-Polo S/S Core" vs "Women-Polos S/S Core"), asi que el orden NO es
--    un detalle: sin el, esas 69 filas podrian mostrar la otra descripcion.
--    Se ordena por `id::text` y no por `id` para no depender de min(uuid), que
--    solo existe desde PG14; el uuid se imprime en hex minuscula de sus 16
--    bytes en orden, asi que el orden de texto es EL MISMO que el de uuid.
--
-- 2. `n` = COUNT(*) del grupo, y `n` de arriba es la suma. Es la cuenta de
--    filas CRUDAS que la ruta publica como `filasLeidas`: el numero que prueba
--    que no hubo truncado silencioso. Sale de la misma pasada, sin un segundo
--    escaneo, para que ese campo siga significando exactamente lo que significa
--    hoy y no "cuantos grupos hubo".
--
-- 3. LAS SUMAS SON EXACTAS Y NO PUEDEN REDONDEAR DISTINTO. Postgres suma
--    `numeric` en decimal exacto y el codigo suma en coma flotante; si un total
--    cayera justo en el borde .005 podrian redondear a centavos distinto.
--    Medido sobre las 20.483 filas de la ventana: `cantidad_total` no tiene
--    decimales y `venta_total`/`costo_total` tienen **como maximo 2**. Todas
--    las sumas son multiplos exactos de un centavo -> ese borde no existe en
--    este dato. (Verificable: node scripts/_diag-agrupacion-articulo-diario.mjs)
--
-- ── FECHAS: RANGO, NUNCA EXTRACT ────────────────────────────────────────────
-- `fecha` es DATE pelado y se filtra con `>=` / `<=` contra dos DATE: es
-- sargable y usa `idx_sad_empresa_fecha (empresa_key, fecha)`. Envolver la
-- columna en EXTRACT la volveria no-sargable y forzaria un seq scan (CLAUDE.md,
-- seccion "Base de datos": 8x mas lento, causa medida de los picos de /ventas).
--
-- ── LA VENTANA DE gerente_acs NO SE MUEVE DE LUGAR ──────────────────────────
-- `p_desde` / `p_hasta` los sigue decidiendo el SERVIDOR en la ruta, despues de
-- `clampPeriodoProductos` y `clampRangoComparativo`. Esta funcion no sabe de
-- roles y no debe: mover la suma a Postgres no es excusa para saltearse el
-- clamp. El candado multifashion-ventana-gerente.test.ts ahora mira TAMBIEN los
-- argumentos que llegan a esta funcion.
--
-- ── SIN ESTA MIGRACION LA PANTALLA FUNCIONA IGUAL ───────────────────────────
-- La ruta llama la RPC y, si PostgREST contesta "no existe esa funcion"
-- (PGRST202 / 42883), se cae sola al camino paginado de siempre y lo dice en el
-- campo `fuentes` de la respuesta. O sea: se puede desplegar el codigo ANTES de
-- correr este SQL, y correrlo despues solo la hace rapida.
--
-- Aplicar manual en Supabase Dashboard -> SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── El periodo, ya agrupado ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION multifashion_articulo_diario_agrupado_v1(
  p_empresa_key text,
  p_desde       date,
  p_hasta       date
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $fn$
  WITH g AS (
    SELECT
      articulo_id,
      codigo,
      descripcion,
      tipo,
      -- MAGNITUDES sin firmar. El signo lo pone la lectura (ver encabezado).
      SUM(cantidad_total) AS q,
      SUM(venta_total)    AS v,
      SUM(costo_total)    AS k,
      COUNT(*)            AS n,
      MIN(id::text)       AS orden
    FROM switch_articulo_diario
    WHERE empresa_key = p_empresa_key
      AND fecha >= p_desde
      AND fecha <= p_hasta
    GROUP BY articulo_id, codigo, descripcion, tipo
  )
  SELECT jsonb_build_object(
    'n', COALESCE(SUM(g.n), 0),
    'f', COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'a', g.articulo_id,
               'c', g.codigo,
               'd', g.descripcion,
               't', g.tipo,
               'q', g.q,
               'v', g.v,
               'k', g.k
             )
             ORDER BY g.orden
           ),
           '[]'::jsonb
         )
  )
  FROM g;
$fn$;

GRANT EXECUTE ON FUNCTION multifashion_articulo_diario_agrupado_v1(text, date, date) TO service_role;

-- ─── El diccionario articulo_id -> marca, en una sola llamada ────────────────
-- Son 8.454 filas (medido) = 9 paginas de PostgREST, hoy leidas DESPUES de las
-- dos del periodo, o sea 9 idas y vueltas puestas una atras de otra. Es la
-- MISMA consulta de siempre (misma tabla, mismo filtro, mismo orden), servida
-- de un saque. No se recorta a los articulos del periodo a proposito: recortar
-- seria un cambio de comportamiento que habria que demostrar, y lo que se
-- estaba arreglando era el numero de viajes, no el de filas.
CREATE OR REPLACE FUNCTION multifashion_articulo_marca_v1(
  p_empresa_key text
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $fn$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('a', articulo_id, 'm', marca_id, 'n', marca_nombre)
      ORDER BY articulo_id
    ),
    '[]'::jsonb
  )
  FROM switch_articulo_marca
  WHERE empresa_key = p_empresa_key;
$fn$;

GRANT EXECUTE ON FUNCTION multifashion_articulo_marca_v1(text) TO service_role;

NOTIFY pgrst, 'reload schema';
