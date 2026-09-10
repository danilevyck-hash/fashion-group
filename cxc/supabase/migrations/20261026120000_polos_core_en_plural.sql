-- ═════════════════════════════════════════════════════════════════════════════
-- Catálogo del Depurador — los polos «Core» se escriben en PLURAL (9-sep-2026)
-- ═════════════════════════════════════════════════════════════════════════════
-- 🩸 EL DATO, medido contra producción el 9-sep-2026 (`switch_articulo_info`,
-- empresa Fashion Wear — es la única empresa donde existe esta descripción):
--
--     Men-Polo  S/S Core   ·  42 artículos ·  4.280 piezas   (28 con existencia)
--     Men-Polos S/S Core   ·  81 artículos ·  2.939 piezas   (37 con existencia)
--     ────────────────────────────────────────────────────────────────────────
--                             7.219 piezas de LA MISMA PRENDA partidas en dos.
--
-- Los estilos MW0MW32346 y MW0MW32347 están escritos de las DOS formas, al
-- mismo precio: 26 códigos bajo el singular y 50 bajo el plural.
--
-- 🔑 POR QUÉ PASÓ: el catálogo se contradecía solo. Para adultos guardaba el
-- SINGULAR («Men-Polo S/S Core», «Women-Polo S/S Core») y para niños el PLURAL
-- («Boys-Polos S/S Core», «Toddler Boys-Polos S/S Core»). La regla de las dos
-- mitades encontraba «Men» en TH Menswear y «Polos S/S Core» en TH Kids, daba
-- por buena la descripción, y la casi-gemela real —la singular, en su propia
-- marca— nunca se llegaba a mirar. El alcance de las mitades ya se acotó a la
-- marca el 8-sep-2026; esto arregla la otra mitad: el catálogo mismo.
--
-- 🔴 DANIEL ELIGIÓ EL PLURAL, con dos razones medidas:
--   1. De las 18 filas de polo del catálogo, 16 YA van en plural. El singular
--      es la excepción, no la regla.
--   2. En plural se tocan menos artículos en Switch que al revés.
--
-- Medido en el catálogo (`depurador_descripciones`) el 9-sep-2026:
--   · 18 filas activas cuya descripción nombra un polo; 16 en plural.
--   · Las 2 en singular son EXACTAMENTE las dos que esta migración cambia.
--   · El destino NO existe todavía en esas marcas: «Men-Polos S/S Core» no está
--     en TH Menswear y «Women-Polos S/S Core» no está en TH Womenswear, así que
--     el índice único (lower(marca), lower(descripcion)) no se toca. Aun así el
--     UPDATE lleva su guarda NOT EXISTS: si alguien aprueba el plural antes de
--     que esto corra, la migración NO duplica y NO falla — deja la fila como
--     está y hay que mirarla a mano.
--
-- ⚠️ TH Kids NO SE TOCA: sus dos filas («Boys-Polos S/S Core» y «Toddler
-- Boys-Polos S/S Core») ya están en plural desde la semilla del 22-jul-2026.
-- Con esta migración las CUATRO quedan emparejadas, que es el punto.
--
-- 🔴 ACOTADA AL VALOR EXACTO, JAMÁS UN `LIKE`. El `WHERE` nombra la marca Y la
-- descripción completas. Un `ILIKE '%polo%'` se llevaría por delante las 16
-- filas que ya están bien, en seis marcas distintas.
--
-- 🔴 NADA POR PARECIDO. Que el singular y el plural sean la misma prenda no lo
-- dedujo una distancia de edición: lo dijo Daniel mirando los dos estilos con
-- el mismo precio. `difiereSoloPorSFinal` los sigue viendo como dos
-- descripciones distintas, y eso está bien — es la alarma, no el amarre.
--
-- 🔴 NADA SE BORRA. Son dos `UPDATE` de dos filas. Ni un DELETE, ni un DROP.
--
-- ⚠️ EL ORDEN IMPORTA — primero esta migración, después el cambio en Switch.
-- Daniel tiene que reescribir los 42 artículos de Fashion Wear que hoy dicen
-- «Men-Polo S/S Core». Si lo hace ANTES de que esto corra, esos 42 le van a
-- saltar la alarma de descripción desconocida hasta que la migración pase.
-- En MUJER no hay nada que tocar en Switch: «Women-Polo S/S Core» (singular)
-- no existe en ningún artículo — solo vivía en el catálogo. Lo que Switch manda
-- ya es «Women-Polos S/S Core» (22 artículos · 1.409 piezas), que hasta hoy NO
-- estaba en el catálogo y con esto empieza a estarlo.
--
-- Migración ADITIVA (dos UPDATE) e IDEMPOTENTE: corrida dos veces, la segunda
-- no encuentra nada que cambiar.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── 1) Hombre · TH Menswear ─────────────────────────────────────────────────
-- Es la fila que costó las 7.219 piezas partidas en dos.
UPDATE depurador_descripciones d
   SET descripcion = 'Men-Polos S/S Core'
 WHERE d.marca = 'TH Menswear'
   AND d.descripcion = 'Men-Polo S/S Core'
   AND NOT EXISTS (
     SELECT 1 FROM depurador_descripciones x
      WHERE lower(x.marca) = lower('TH Menswear')
        AND lower(x.descripcion) = lower('Men-Polos S/S Core')
   );

-- ─── 2) Mujer · TH Womenswear ────────────────────────────────────────────────
-- Acá no hay dos filas peleando: el singular solo vive en el catálogo y el
-- plural es lo único que Switch manda. Se empareja para que las cuatro filas de
-- polo «Core» digan lo mismo, y para que los 22 artículos de mujer que hoy
-- llegan en plural dejen de caer fuera del catálogo.
UPDATE depurador_descripciones d
   SET descripcion = 'Women-Polos S/S Core'
 WHERE d.marca = 'TH Womenswear'
   AND d.descripcion = 'Women-Polo S/S Core'
   AND NOT EXISTS (
     SELECT 1 FROM depurador_descripciones x
      WHERE lower(x.marca) = lower('TH Womenswear')
        AND lower(x.descripcion) = lower('Women-Polos S/S Core')
   );
