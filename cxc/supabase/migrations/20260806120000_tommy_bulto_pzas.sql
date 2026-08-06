-- ============================================================================
-- Tommy — PIEZAS POR BULTO por producto.
--
-- Daniel: "en el catalogo de tommy, hay aveces que los bultos son de 8 y otros
-- de 12, la mayorria son de 12. como podemos hacerlo de manera facil saber cual
-- es de 8 y cual de 12". Ejemplo suyo: FM0FM05637YBS es de 8.
--
-- Hasta hoy `tommy-bulto.ts` devolvia 12 FIJO para los 460 productos activos, y
-- el catalogo no tenia forma de decir otra cosa.
--
-- POR QUE UNA COLUMNA Y NO UNA REGLA DERIVADA. Se midieron las cuatro fuentes
-- posibles contra produccion (6-ago-2026) y ninguna tiene el dato:
--   * `cantidadPorCaja` de /apiarticulos/lista .... 0.0000 en los 650 articulos
--   * `talla` y `color` de /apiarticulos/lista ..... vacios en los 650
--   * /apiarticulos/tallacolor del articulo 2799 ... devuelve []
--   * packing_lists ............................... 0 filas
-- Y Daniel confirmo que es estilo por estilo, sin regla por genero ni categoria.
-- O sea: el dato no existe en ningun lado del sistema. Hay que guardarlo.
--
-- NULL = 12. Es deliberado: hoy TODO vale 12, asi que la columna nace sin tocar
-- un solo producto y el comportamiento no cambia hasta que alguien marque algo.
-- Poner 12 en las 490 filas habria hecho indistinguible "es de 12" de "nadie lo
-- reviso todavia", que es justo lo que la pantalla de administrar necesita
-- separar para poder mostrar cuales faltan.
--
-- El CHECK deja 1..99: un bulto de 0 piezas haria division por cero en el
-- calculo del pedido, y de tres digitos es un tecleo (el mas grande del negocio
-- es 12). Mismo criterio holgado que el rango del divisor del depurador.
-- ============================================================================

ALTER TABLE tommy_products
  ADD COLUMN IF NOT EXISTS bulto_pzas smallint;

DO $bulto$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tommy_products_bulto_pzas_rango'
  ) THEN
    ALTER TABLE tommy_products
      ADD CONSTRAINT tommy_products_bulto_pzas_rango
      CHECK (bulto_pzas IS NULL OR (bulto_pzas >= 1 AND bulto_pzas <= 99));
  END IF;
END
$bulto$;

COMMENT ON COLUMN tommy_products.bulto_pzas IS
  'Piezas por bulto de ESTE estilo. NULL = 12 (el default de toda la marca). Lo llena el sync desde cantidadPorCaja de Switch cuando viene > 0; si no, se marca a mano desde administrar catalogo.';
