-- ─────────────────────────────────────────────────────────────────────────────
-- Catálogo del Depurador · SEGUNDO LOTE (26-ago-2026).
--
-- Misma decisión que las 5 mitades del lote anterior (20260826040000): son
-- categorías que el negocio vende y el catálogo no conocía, así que abrían la
-- alarma roja y bloqueaban la descarga del Excel.
--
--   Home · Towels · Kanine · Luggage · Watches · Boots · Pyjamas ·
--   Woven Bottoms · Bikini Bottoms · Tops · los packs 2PK/3PK/5PK/6PK/7PK
--   + «Toddler Girls», que NO es una mitad derecha sino una IZQUIERDA: el
--     catálogo ya tenía "Toddler Boys-T-Shirts S/S" y le faltaba la nena.
--
-- ── QUÉ SE MIRÓ ANTES DE APROBAR ─────────────────────────────────────────────
-- Las dos categorías que menos se entendían, miradas artículo por artículo:
--
--   Unisex-Home (25 art · 4.367 u.) NO es un cajón de sastre: son toallas
--   Tommy. Dos familias de código con variante de color — 118612BATH/HAND###
--   (CIF 8,25 · precio 12,50) y 27T3128BT/HD#### — compradas a American
--   Fashion Wear. Vendido: 19.072 u. / $225.717 entre feb-2023 y ago-2026, con
--   venta viva (última 17-ago-2026). Es el rubro más grande del barrido.
--
--   Unisex-Kanine (10 art · 55 u.) es la línea de mascotas: 10 códigos T4FD**
--   (AH/AT/CC/CH/CL + color), CIF 17,60–38,50, precio 22–49. Vendido 453 u. /
--   $13.803 entre may y jul-2025. Colección real, chica y ya discontinuada.
--
-- ⚠️ HALLAZGO: el catálogo ya tenía 'TH Other | Unisex-Home Towels', un nombre
-- que Switch NO manda nunca (0 líneas de factura). Switch manda HOME y TOWELS
-- por separado. La fila vieja queda —no se borra nada— pero las vivas son las
-- dos nuevas.
--
-- ── QUÉ SE DEJÓ AFUERA A PROPÓSITO ───────────────────────────────────────────
--   · 'Men-Blazers / Sports Jackets' → NO entra al catálogo: es la forma sucia
--     de "Men-Blazers" y se limpia en el mapa de NORMALIZACION (el gemelo
--     femenino ya estaba ahí). Switch manda las dos: BLAZERS 232 u. vendidas,
--     BLAZERS - SPORTS JACKETS 28 u.
--   · 'Men-Ties / Neckwear' (1 art · 1 u. · 5 u. vendidas en una sola línea de
--     dic-2025). Mismo olor a forma sucia pero sin forma limpia catalogada:
--     sigue alertando a propósito, hasta que Daniel diga qué es.
--   · Las 4 filas de Reebok mal clasificadas bajo CK Jeans y las 7 sin género
--     adelante (Bags, Socks Sport, Polos S/S, Denim Pants, Cosmetiquera,
--     TE BOTTLE 7/750): eso es dato sucio de Switch, no categorías.
--
-- ── EFECTO MEDIDO EN PANTALLA (no en SQL) ────────────────────────────────────
-- Cargando por /productos/cargar el Excel del universo real (858 pares
-- marca+descripción de producción, scripts/_universo-depurador-excel.ts):
--
--     ANTES:                    36 por revisar · 87 pasaron solas
--     con el arreglo de Blazers 35 por revisar · 88 pasaron solas
--     DESPUÉS:                  12 por revisar · 88 pasaron solas
--
-- Las 12 que sobreviven son las que se dejaron afuera arriba. No es un tercer
-- hueco del mismo tipo: es la basura de datos, y se arregla en Switch.
--
-- ── ESTA MIGRACIÓN NO ES LA QUE ESCRIBIÓ PRODUCCIÓN ──────────────────────────
-- Las 23 filas se aprobaron por el camino de la pantalla (18 con el botón,
-- 5 por POST /api/productos/cargar/descripciones/aprobar cuando la hermana ya
-- había dejado de alertar), sesión real de `daniel`, origen='aprobada'. Es el
-- único camino que pasa por normalizarEspacios(). Esta migración deja el
-- registro en el repo y siembra lo mismo donde falte: ADITIVA e idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

insert into depurador_descripciones (marca, descripcion, origen) values
  -- Hogar, mascotas y viaje (TH Other / TH Accessories)
  ('TH Other',       'Unisex-Home',                 'aprobada'),
  ('TH Other',       'Unisex-Towels',               'aprobada'),
  ('TH Other',       'Unisex-Kanine',               'aprobada'),
  ('TH Other',       'Unisex-Luggage',              'aprobada'),
  ('TH Accessories', 'Unisex-Luggage',              'aprobada'),
  -- Relojes
  ('TH Accessories', 'Women-Watches',               'aprobada'),
  ('TH Accessories', 'Men-Watches',                 'aprobada'),
  ('TH Other',       'Men-Watches',                 'aprobada'),
  -- Toddler Girls (mitad izquierda, espejo de Toddler Boys)
  ('TH Kids',        'Toddler Girls-T-Shirts S/S',  'aprobada'),
  ('TH Kids',        'Toddler Girls-Dresses',       'aprobada'),
  -- Packs de ropa interior y medias
  ('TH Underwear',   'Men-Underwear Bottoms 3PK',   'aprobada'),
  ('TH Underwear',   'Men-Underwear Bottoms 2PK',   'aprobada'),
  ('TH Underwear',   'Women-Panties 3PK',           'aprobada'),
  ('CK Underwear',   'Women-Panties 3PK',           'aprobada'),
  ('CK Underwear',   'Women-Panties 5PK',           'aprobada'),
  ('TH Underwear',   'Girls-Panties 7PK',           'aprobada'),
  ('TH Menswear',    'Men-T-Shirts S/S 3PK',        'aprobada'),
  ('TH Legwear',     'Men-Socks Sport 6PK',         'aprobada'),
  -- Baño y playa
  ('CK Swimwear',    'Men-Woven Bottoms',           'aprobada'),
  ('CK Swimwear',    'Women-Bikini Bottoms',        'aprobada'),
  ('CK Swimwear',    'Women-Tops',                  'aprobada'),
  -- Resto
  ('TH Footwear',    'Boys-Boots',                  'aprobada'),
  ('TH Underwear',   'Men-Pyjamas',                 'aprobada')
on conflict do nothing;
