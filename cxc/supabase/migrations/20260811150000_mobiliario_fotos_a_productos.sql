-- ============================================================================
-- Marketing › Mobiliario — las FOTOS se mudan a la tabla de Productos
-- ============================================================================
--
-- Daniel: *"quiero productos tal cual como esta, solo que con las fotos de
-- notas proveedor"*. Las 6 fotos de los muebles estaban solo en el bloque
-- "Notas del proveedor" (`mk_mobiliario_notas_proveedor.foto_paths`), que
-- desaparece de la pantalla. Este backfill las copia a
-- `mk_inventario_productos.foto_path`, que es de donde la tabla de Productos
-- (y la nota de entrega) las lee.
--
-- 🔴 NO BORRA NADA. `mk_mobiliario_notas_proveedor` queda intacta con sus 6
--    filas y sus `foto_paths`: de ahí salen los precios que muestra el "?" de
--    la pantalla. Esto COPIA una ruta de texto, no mueve ni borra el archivo
--    de Storage.
--
-- 🔴 IDEMPOTENTE. El UPDATE solo toca filas con `foto_path IS NULL`, así que
--    correrlo dos veces no cambia nada, y NUNCA pisa una foto que alguien
--    haya subido a mano desde el modal de "Editar producto".
--
-- 🩸 EL PAREO ES EXPLÍCITO, UNO POR UNO. NO se parea por parecido ni por
--    LIKE. Los nombres no coinciden en 2 de los 6 casos ("Conjunto soporte"
--    contra "Conjunto soporte tabla", "Barra flauta" contra "Flauta") y un
--    pareo automático que se equivoque le pone al mueble la foto de otro
--    mueble sin dejar rastro: en pantalla se ve una foto, no un error. Los 6
--    pares se verificaron a mano contra producción el 11-ago-2026.
--
-- 🩸 `foto_paths` es un ARRAY y `foto_path` es UNO SOLO: se toma el PRIMERO
--    (`[1]`, que en Postgres es el primer elemento). Medido en producción:
--    los 6 renglones tienen exactamente UNA foto, así que hoy "el primero" y
--    "el único" son lo mismo y no hay ninguna que se pierda.
--
-- Cómo se corre: PASO 1 solo, se miran los números; si cuadran, PASO 2.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 1 — VISTA PREVIA. NO ESCRIBE NADA. Correr esto primero.
--
-- Tiene que devolver 6 filas, todas con `accion = 'se escribe'` y una
-- `foto_a_escribir` que empiece con `notas-proveedor/changalo/`.
-- ────────────────────────────────────────────────────────────────────────────
WITH pares(producto_inventario, producto_nota) AS (
  VALUES
    ('Paneles',          'Paneles'),
    ('Tablas',           'Tablas'),
    ('Conjunto soporte', 'Conjunto soporte tabla'),  -- nombres distintos
    ('Norte colgador',   'Norte colgador'),
    ('Barra plana',      'Barra plana'),
    ('Barra flauta',     'Flauta')                   -- nombres distintos
)
SELECT
  p.nombre                        AS producto,
  n.producto                      AS renglon_del_proveedor,
  p.foto_path                     AS foto_actual,
  n.foto_paths[1]                 AS foto_a_escribir,
  CASE
    WHEN p.id IS NULL             THEN 'FALTA el producto en el inventario'
    WHEN n.id IS NULL             THEN 'FALTA el renglón del proveedor'
    WHEN n.foto_paths[1] IS NULL  THEN 'el renglón no tiene foto'
    WHEN p.foto_path IS NOT NULL  THEN 'ya tiene foto — no se toca'
    ELSE 'se escribe'
  END                             AS accion
FROM pares
LEFT JOIN mk_inventario_productos      p ON p.nombre   = pares.producto_inventario
LEFT JOIN mk_mobiliario_notas_proveedor n ON n.producto = pares.producto_nota
ORDER BY p.nombre;


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 2 — ESCRIBE. Correr solo si el PASO 1 mostró las 6 en 'se escribe'.
-- ────────────────────────────────────────────────────────────────────────────
WITH pares(producto_inventario, producto_nota) AS (
  VALUES
    ('Paneles',          'Paneles'),
    ('Tablas',           'Tablas'),
    ('Conjunto soporte', 'Conjunto soporte tabla'),
    ('Norte colgador',   'Norte colgador'),
    ('Barra plana',      'Barra plana'),
    ('Barra flauta',     'Flauta')
)
UPDATE mk_inventario_productos p
SET    foto_path  = n.foto_paths[1],
       updated_at = now()
FROM   pares
JOIN   mk_mobiliario_notas_proveedor n ON n.producto = pares.producto_nota
WHERE  p.nombre        = pares.producto_inventario
  AND  p.foto_path IS NULL            -- idempotente: no pisa nada ya puesto
  AND  n.foto_paths[1] IS NOT NULL;


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 3 — VERIFICACIÓN. Tiene que dar 6 filas, ninguna con foto_path NULL.
-- ────────────────────────────────────────────────────────────────────────────
SELECT nombre, foto_path
FROM   mk_inventario_productos
ORDER  BY nombre;
