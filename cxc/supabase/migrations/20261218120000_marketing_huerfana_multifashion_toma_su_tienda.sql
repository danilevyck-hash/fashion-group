-- ============================================================================
-- Marketing — la factura huérfana de Multifashion toma la tienda de su proyecto
-- ============================================================================
-- 23-sep-2026. Tiendas y Marcas (docs/postmortems/marketing-rediseno.md).
--
-- 🩸 EL DEFECTO, medido contra producción por REST el 23-sep-2026:
--   · UNA factura viva con proyecto y sin `tienda_codigo`:
--       id            fa506291-53b4-40af-a0b1-f197c89f4ca3
--       proveedor     Impresora Comercial S a
--       N° factura    0000064948
--       fecha         2026-07-28
--       total         $2.307,32
--       marca         Calvin Klein (CK)
--       proyecto      «Remodelacion» · tienda «Multifashion Holdings» · sin código
--   · La migración 20261216120000 copió la tienda del proyecto a cada gasto
--     (`WHERE p.tienda_codigo IS NOT NULL`), y este proyecto es el ÚNICO de
--     Multifashion que quedó SIN código en `mk_proyectos` (el otro, D-108, lo
--     tiene). Por eso la factura cayó en el cajón «General» de la portada y
--     NO aparece en la ficha de la tienda D-108, aunque la portada de marcas
--     (que reconoce el proyecto por su TEXTO, `esMultifashion`) sí la contaba.
--   · Resultado en pantalla: Multifashion decía $8.061,63 en la portada y
--     $5.754,31 en su ficha. Con esto, las dos dicen $8.061,63.
--
-- QUÉ HACE: UN solo UPDATE, por ID, de UNA fila. Escribe `tienda_codigo =
-- 'D-108'` —el código con el que Multifashion vive en el directorio
-- (`lib/marketing/multifashion.ts › MULTIFASHION_CODIGOS`)— SOLO si la
-- columna sigue en NULL. Idempotente: correrla dos veces no toca nada.
--
-- QUÉ NO HACE:
--   · NO toca `mk_proyectos` (el proyecto se retiró del modelo, Daniel:
--     «a) Basta la tienda»).
--   · NO toca ningún monto, marca, fecha ni proveedor.
--   · NO borra ni anula nada.
--
-- 🔴 EL CÓDIGO FALLA ABIERTO SIN ESTO: la factura se sigue viendo en
-- «General» y la portada de marcas la sigue apartando por el texto del
-- proyecto. Lo único que cambia al aplicarla es que la ficha de D-108 la
-- muestra y suma $8.061,63, como la portada.
-- ============================================================================

UPDATE mk_facturas
   SET tienda_codigo = 'D-108'
 WHERE id = 'fa506291-53b4-40af-a0b1-f197c89f4ca3'
   AND tienda_codigo IS NULL;

-- Verificación (no escribe): tiene que devolver UNA fila con tienda_codigo D-108.
--   SELECT id, proveedor, numero_factura, total, tienda_codigo
--     FROM mk_facturas
--    WHERE id = 'fa506291-53b4-40af-a0b1-f197c89f4ca3';
