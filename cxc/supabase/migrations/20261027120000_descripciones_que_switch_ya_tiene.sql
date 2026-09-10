-- ═════════════════════════════════════════════════════════════════════════════
-- Catálogo del Depurador — las 23 descripciones que Switch ya tiene y el
-- catálogo no conocía (9-sep-2026)
-- ═════════════════════════════════════════════════════════════════════════════
-- 🔑 POR QUÉ FALTABAN, Y ESTO ES LO IMPORTANTE DE ESTE ARCHIVO:
--
--     `depurador_descripciones` SOLO se llena por la Plantilla Switch — la
--     semilla del 22-jul-2026 y lo que la secretaria aprueba al procesar un
--     archivo del proveedor. Estos artículos NO entraron por ahí: se tecleron
--     DIRECTO en Switch, así que el catálogo nunca se enteró de que existían.
--
-- La consecuencia se veía todos los meses: al llegar el archivo, esas
-- descripciones caían fuera del catálogo, el producto salía SIN PRECIO y la
-- alarma sonaba otra vez por lo mismo. No era un defecto del veredicto: era el
-- catálogo con un agujero por donde entra la mercancía tecleada a mano.
--
-- Daniel, textual (9-sep-2026): «apruébalas todas».
--
-- ── LO MEDIDO CONTRA PRODUCCIÓN (`switch_articulo_info`, existencia > 0) ─────
--
-- Fashion Wear (casa TH) — 13 filas:
--     Kids-Hats                 332 piezas ·  8 artículos
--     Boys-Shorts Denim          97        ·  2
--     Girls-Pant Non-Denim       83        ·  3
--     Boys-Short Knit            72        ·  2
--     Toddler Boys-Giftpacks     32        ·  2
--     Girls-Panties              29        ·  2
--     Girls-Short Knit           27        ·  2
--     Boys-Underwear Bottoms     23        ·  1
--     Girls-Pant Knit            20        ·  1
--     Boys-Swimshorts            20        ·  1
--     Toddler Boys-Polos S/S      6        ·  3
--     Men-Short Knit              2        ·  2
--     Women-Socks Dress           1        ·  1
--
-- Vistana (casa CK) — 10 filas:
--     Girls-Bras                428 piezas · 12 artículos
--     Girls-Panties             376        · 12
--     Boys-Brief                191        ·  2
--     Boys-Shorts Denim          96        ·  3
--     Boys-Short Knit            73        ·  6
--     Boys-Shirts Woven S/S      36        ·  2
--     Kids Unisex-T-Shirts S/S   10        ·  1
--     Unisex-Hats                 6        ·  1
--     Men-Short Knit              1        ·  1
--     Boys-1 Piece                1        ·  1
--
-- 🔴 SON 23 FILAS, NO 27. El grano de la tabla es (marca, descripción), y
-- CUATRO descripciones llegan en las DOS compañías — «Boys-Shorts Denim»,
-- «Boys-Short Knit», «Men-Short Knit» y «Girls-Panties» —, así que cada una
-- necesita su fila en la casa TH y otra en la CK. Esas ocho filas YA están
-- enumeradas arriba, una en cada lista: 13 + 10 = 23 filas sobre 19
-- descripciones distintas. Sumarle 4 a 23 contaría los duplicados dos veces.
--
-- ⚠️ LA MARCA ES UNA PROPUESTA RAZONADA, NO UN DATO MEDIDO. Se eligió mirando
-- en qué marca vive la HERMANA de cada descripción en el catálogo de hoy
-- («Girls-Bras» junto a «Women-Bras» en CK Underwear; «Boys-Underwear Bottoms»
-- junto a «Men-Underwear Bottoms» en TH Underwear; «Women-Socks Dress» junto a
-- «Men-Socks Dress» en TH Legwear). La marca de VERDAD la manda el Excel del
-- proveedor. Medido: las 23 filas de `switch_articulo_info` traen `marca` en
-- NULL (Switch solo devuelve la ficha con marca para Active Shoes), así que no
-- había contra qué contrastarla.
--
-- ⚠️ TRES «Short Knit» DE TOMMY NO TIENEN HERMANA EN TOMMY. En todo el catálogo
-- «Short Knit» existe UNA sola vez: «Women-Short Knit», en CK Performance. Por
-- eso «Boys-Short Knit», «Girls-Short Knit» y «Men-Short Knit» entran a la casa
-- TH sin una hermana que respalde la marca. O son prendas nuevas de verdad, o
-- llegaron con la marca equivocada en el archivo — lo decide Daniel, y si la
-- decide distinto se corrige con un UPDATE de la marca, sin borrar nada.
--
-- ── LO QUE SE VERIFICÓ ANTES DE ESCRIBIR (con el código real) ────────────────
--   1. Ninguna de las 23 existe HOY en el catálogo, en ninguna marca (0 filas).
--   2. Las 9 marcas usadas existen en `MARCAS_CATALOGO` (`logic.ts`).
--   3. Ninguna se MUEVE al pasar por `normalizeDescripcion`: lo que se da de
--      alta es exactamente lo que sale al Excel de Switch. (Tres candidatas
--      quedaron fuera de la lista justo por esto — «Men-Ties / Neckwear»,
--      «Men-Shirts Woven Tops L/S» y «Men-Shirts Woven Tops S/S», que el mapa
--      limpia a algo que YA está en el catálogo.)
--   4. Ninguna dispara `esCasiIgual` contra una fila de su marca ni contra
--      ninguna otra del catálogo: no se crea una gemela por una «s».
--
-- `origen = 'aprobada'` y `aprobada_por = 'daniel'`: el CHECK de la tabla solo
-- admite 'seed' o 'aprobada', y 'seed' es la carga inicial del 22-jul-2026 —
-- esto es una aprobación de Daniel, igual que las otras 54.
--
-- 🔴 NADA SE BORRA: es un alta. Ni un DELETE, ni un DROP, ni un TRUNCATE.
-- Migración ADITIVA e IDEMPOTENTE: `ON CONFLICT DO NOTHING` contra el índice
-- único `(lower(marca), lower(descripcion))`, así que corrida dos veces la
-- segunda no escribe nada y nunca pisa una fila que alguien ya haya aprobado.
-- ═════════════════════════════════════════════════════════════════════════════

INSERT INTO depurador_descripciones (marca, descripcion, activa, origen, aprobada_por, aprobada_at)
VALUES
  -- ─── Fashion Wear · casa TH — 13 filas ─────────────────────────────────────
  ('TH Accessories', 'Kids-Hats',                true, 'aprobada', 'daniel', now()),
  ('TH Kids',        'Boys-Shorts Denim',        true, 'aprobada', 'daniel', now()),
  ('TH Kids',        'Girls-Pant Non-Denim',     true, 'aprobada', 'daniel', now()),
  ('TH Kids',        'Boys-Short Knit',          true, 'aprobada', 'daniel', now()),
  ('TH Kids',        'Toddler Boys-Giftpacks',   true, 'aprobada', 'daniel', now()),
  ('TH Underwear',   'Girls-Panties',            true, 'aprobada', 'daniel', now()),
  ('TH Kids',        'Girls-Short Knit',         true, 'aprobada', 'daniel', now()),
  ('TH Underwear',   'Boys-Underwear Bottoms',   true, 'aprobada', 'daniel', now()),
  ('TH Kids',        'Girls-Pant Knit',          true, 'aprobada', 'daniel', now()),
  ('TH Kids',        'Boys-Swimshorts',          true, 'aprobada', 'daniel', now()),
  ('TH Kids',        'Toddler Boys-Polos S/S',   true, 'aprobada', 'daniel', now()),
  ('TH Menswear',    'Men-Short Knit',           true, 'aprobada', 'daniel', now()),
  ('TH Legwear',     'Women-Socks Dress',        true, 'aprobada', 'daniel', now()),

  -- ─── Vistana · casa CK — 10 filas ──────────────────────────────────────────
  ('CK Underwear',   'Girls-Bras',               true, 'aprobada', 'daniel', now()),
  ('CK Underwear',   'Girls-Panties',            true, 'aprobada', 'daniel', now()),
  ('CK Underwear',   'Boys-Brief',               true, 'aprobada', 'daniel', now()),
  ('CK Kids',        'Boys-Shorts Denim',        true, 'aprobada', 'daniel', now()),
  ('CK Kids',        'Boys-Short Knit',          true, 'aprobada', 'daniel', now()),
  ('CK Kids',        'Boys-Shirts Woven S/S',    true, 'aprobada', 'daniel', now()),
  ('CK Kids',        'Kids Unisex-T-Shirts S/S', true, 'aprobada', 'daniel', now()),
  ('CK Accessories', 'Unisex-Hats',              true, 'aprobada', 'daniel', now()),
  ('CK Performance', 'Men-Short Knit',           true, 'aprobada', 'daniel', now()),
  ('CK Kids',        'Boys-1 Piece',             true, 'aprobada', 'daniel', now())
ON CONFLICT DO NOTHING;
