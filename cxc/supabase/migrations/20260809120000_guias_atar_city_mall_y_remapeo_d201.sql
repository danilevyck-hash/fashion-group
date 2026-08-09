-- ============================================================================
-- Guías — atar las líneas que la DIRECCIÓN desambigua, y sacar D-201 de en medio
-- ============================================================================
-- Corre esta migración A MANO en el SQL Editor de Supabase, PASO POR PASO.
-- El PASO 1 no escribe nada: es la vista previa. Si sus conteos no dan lo
-- esperado, PARÁ ahí y no sigas — algo cambió en los datos desde la medición.
--
-- Estado medido el 9-ago-2026 contra producción:
--     441 líneas vivas · 169 atadas · 272 sin atar
--
-- 🔴 EL TEXTO ESCRITO NO SE TOCA. NUNCA.
-- La guía tiene que seguir imprimiendo "City Mall | Paso Canoas" tal cual lo
-- escribió bodega. Lo único que se escribe es `cliente_codigo` — el código es
-- plomería invisible. Reemplazar el texto por el nombre oficial dejaría
-- "City Mall Paso Canoa | Paso Canoas", que es una redundancia que no aporta
-- nada y borra la prueba de lo que se anotó ese día.
--
-- ── A) CITY MALL: la DIRECCIÓN lo resuelve ──────────────────────────────────
-- `D-200 "City Mall"` está borrado, y está BIEN borrado: es ambiguo porque hay
-- DOS tiendas. Las buenas existen y están vivas: D-24 "City Mall David" y
-- D-25 "City Mall Paso Canoa". `guia_items.direccion` es lo que las separa.
--
-- 🔴 `City Mall · Guabito` (GUÍA 36, 15-abr-2026, Active Shoes, factura 6666,
--    6 bultos) SÍ se ata, y va a D-25. Daniel lo resolvió: "era paso canoas".
--    ⚠️ PERO NO ES UNA REGLA DE DIRECCIÓN: `guabito` NO entra en la tabla de
--    equivalencias. Guabito es la frontera con Costa Rica y ahí van los DUTY
--    FREE — La Frontera, Outlet Duty Free N2, Jerusalem Duty Free, Wolf Mall.
--    Las otras 12 líneas con esa dirección son de esos clientes y NO se tocan.
--    Como regla general, la próxima línea de un duty free en Guabito se ataría
--    a City Mall. Por eso va en su propio paso (PASO 3B), identificada por
--    NÚMERO DE GUÍA, y la vista previa la muestra aparte de las 99.
--
-- ── B) Los otros tres ───────────────────────────────────────────────────────
-- Sporting Shoes → D-142 · American/America Clasic → D-108 · Jerusalem Panama → D-80
--
-- ⚠️ `D-201 "American Classics"` es un DUPLICADO: no existe en Switch, 0
--    facturas, 0 CXC. Tiene 13 líneas de guía atadas y se REMAPEAN a D-108, que
--    es el American Classics de verdad del grupo (existe en las 6 empresas).
--    **D-201 NO se borra del maestro** — eso es decisión de Daniel; acá solo se
--    deja de usar en guías. Es el ÚNICO caso de reescritura de esta migración.
--
-- ⚠️ `111380 "American Classic Store"` es de Confecciones Boston y NO va. Al
--    9-ago-2026 ya no queda ninguna línea viva atada a él (se corrigió desde la
--    pantalla), así que acá no hay nada que hacer. El PASO 5 lo verifica igual.
--
-- ── Cómo parea, y cómo NO ───────────────────────────────────────────────────
-- Comparación EXACTA sobre el texto normalizado (sin acentos, sin mayúsculas,
-- sin espacios de más). **NADA por parecido, ni por distancia de edición, ni
-- con LIKE.** Cualquier combinación que no esté en las tablas de reglas se
-- queda sin atar y se reporta en el PASO 6. Es a propósito: `Sporting Shoes N7`
-- y `Sporting Shoes N9` se parecen a `Sporting Shoes N4` y son OTRAS tiendas.
--
-- Solo se escriben filas con `cliente_codigo IS NULL` (salvo las 13 de D-201).
-- Una línea ya atada nunca se pisa.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 0 — el normalizador, en UN solo lugar
-- ────────────────────────────────────────────────────────────────────────────
-- Aditivo e idempotente. Existe para no repetir la misma expresión de 200
-- caracteres ocho veces: un typo en una de las copias cambiaría el pareo EN
-- SILENCIO, que es exactamente el modo de fallo que esta migración quiere
-- evitar. `translate` en vez de `unaccent` para no depender de una extensión.
--
-- OJO: no es el mismo normalizador que `clientes_master.nombre_normalized`
-- (ese es UPPER + quitar [.,]). Éste compara textos escritos a mano contra una
-- tabla de reglas literales, no contra el directorio.
CREATE OR REPLACE FUNCTION fg_norm_guia_texto(t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $fgnorm$
  SELECT lower(btrim(regexp_replace(
    translate(coalesce(t, ''),
              'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
              'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC'),
    '\s+', ' ', 'g')));
$fgnorm$;

COMMENT ON FUNCTION fg_norm_guia_texto(text) IS
  'Normaliza texto escrito a mano de guia_items para pareo exacto: sin acentos, sin mayusculas, sin espacios de mas.';


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 1 — VISTA PREVIA. No escribe nada. 🔴 SI LOS NÚMEROS NO DAN, PARÁ ACÁ.
-- ────────────────────────────────────────────────────────────────────────────
-- Esperado, medido el 9-ago-2026:
--
--   regla                                          esperado
--   ------------------------------------------------------
--   D-25  city mall + paso canoas                        60
--   D-25  city mall + pasocanoas                          1
--   D-25  city mall + paso canoa                          1
--   D-25  city mall paso canoa + paso canoas              0  ← ya atadas en jun
--   D-24  city mall + david                              27
--   D-24  city mall david + david                         0  ← ya atadas en jun
--   D-142 sporting shoes                                 17
--   D-142 sporting shoes n4                              21
--   D-108 american clasic                                 8
--   D-108 america clasic                                  7
--   D-108 american classic store                          0  ← la de GT-183 ya no existe
--   D-80  jerusalem panama                                8
--   ------------------------------------------------------
--   subtotal por reglas                                 150
--   + PASO 3B · correccion puntual GUIA 36 → D-25          1
--   TOTAL a atar                                        151
--   + remapeo D-201 → D-108                              13
--   quedan SIN ATAR                                     121
--
-- Los ceros NO son un error: son reglas del reporte que el backfill de junio ya
-- resolvió por nombre. Se dejan escritas para que una línea nueva con ese texto
-- también se ate, y para que la tabla sea legible al lado del reporte.

WITH reglas_dir(cliente_n, direccion_n, codigo) AS (
  VALUES
    ('city mall',            'paso canoas', 'D-25'),
    ('city mall',            'pasocanoas',  'D-25'),
    ('city mall',            'paso canoa',  'D-25'),
    ('city mall paso canoa', 'paso canoas', 'D-25'),
    ('city mall david',      'david',       'D-24'),
    ('city mall',            'david',       'D-24')
),
reglas_nom(cliente_n, codigo) AS (
  VALUES
    ('sporting shoes',        'D-142'),
    ('sporting shoes n4',     'D-142'),
    ('american clasic',       'D-108'),
    ('america clasic',        'D-108'),
    ('american classic store','D-108'),
    ('jerusalem panama',      'D-80')
),
vivas AS (
  SELECT gi.id, gi.cliente_codigo,
         fg_norm_guia_texto(gi.cliente)   AS cliente_n,
         fg_norm_guia_texto(gi.direccion) AS direccion_n
  FROM guia_items gi
  JOIN guia_transporte gt ON gt.id = gi.guia_id AND gt.deleted = false
  WHERE COALESCE(gi.deleted, false) = false
),
sin_atar AS (SELECT * FROM vivas WHERE cliente_codigo IS NULL)
SELECT 'A) por direccion' AS bloque,
       r.codigo,
       r.cliente_n || ' + ' || r.direccion_n AS regla,
       COUNT(s.id) AS lineas
FROM reglas_dir r
LEFT JOIN sin_atar s ON s.cliente_n = r.cliente_n AND s.direccion_n = r.direccion_n
GROUP BY r.codigo, r.cliente_n, r.direccion_n
UNION ALL
SELECT 'B) por nombre', r.codigo, r.cliente_n,
       COUNT(s.id)
FROM reglas_nom r
LEFT JOIN sin_atar s ON s.cliente_n = r.cliente_n
GROUP BY r.codigo, r.cliente_n
UNION ALL
SELECT 'C) remapeo', 'D-201 -> D-108', 'lineas hoy atadas a D-201',
       COUNT(*) FROM vivas WHERE upper(btrim(cliente_codigo)) = 'D-201'
UNION ALL
SELECT 'D) totales', '', 'lineas vivas',   COUNT(*) FROM vivas
UNION ALL
SELECT 'D) totales', '', 'atadas hoy',     COUNT(*) FROM vivas WHERE cliente_codigo IS NOT NULL
UNION ALL
SELECT 'D) totales', '', 'sin atar hoy',   COUNT(*) FROM sin_atar
ORDER BY 1, 2, 3;

-- Y que los 4 códigos destino existan VIVOS. Tienen que salir las 4 filas.
SELECT codigo, nombre, deleted
FROM clientes_master
WHERE codigo IN ('D-24', 'D-25', 'D-142', 'D-108', 'D-80', 'D-200', 'D-201')
ORDER BY codigo;


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 2 — atar CITY MALL por (cliente + dirección). Esperado: 89 filas.
-- ────────────────────────────────────────────────────────────────────────────
-- `cliente` y `direccion` NO se tocan. Solo se escribe `cliente_codigo`.
UPDATE guia_items gi
SET cliente_codigo = r.codigo
FROM (
  VALUES
    ('city mall',            'paso canoas', 'D-25'),
    ('city mall',            'pasocanoas',  'D-25'),
    ('city mall',            'paso canoa',  'D-25'),
    ('city mall paso canoa', 'paso canoas', 'D-25'),
    ('city mall david',      'david',       'D-24'),
    ('city mall',            'david',       'D-24')
) AS r(cliente_n, direccion_n, codigo)
WHERE gi.cliente_codigo IS NULL
  AND COALESCE(gi.deleted, false) = false
  AND fg_norm_guia_texto(gi.cliente)   = r.cliente_n
  AND fg_norm_guia_texto(gi.direccion) = r.direccion_n
  AND EXISTS (SELECT 1 FROM guia_transporte gt WHERE gt.id = gi.guia_id AND gt.deleted = false)
  -- El destino tiene que existir VIVO. Si alguien borrara D-25, esto no escribe
  -- nada en vez de dejar líneas apuntando a un cliente que no está.
  AND EXISTS (SELECT 1 FROM clientes_master cm WHERE cm.codigo = r.codigo AND cm.deleted = false);


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 3 — atar Sporting Shoes / American Clasic / Jerusalem. Esperado: 61 filas.
-- ────────────────────────────────────────────────────────────────────────────
-- Acá la dirección NO desambigua nada (Sporting Shoes N4 aparece en 15
-- direcciones distintas y todas son la misma tienda), así que se parea por
-- nombre exacto normalizado. `sporting shoes n7/n8/n9` y `sporting shoes
-- tienda 7/8/9` NO están en la lista: son OTRAS tiendas y quedan sin atar.
UPDATE guia_items gi
SET cliente_codigo = r.codigo
FROM (
  VALUES
    ('sporting shoes',        'D-142'),
    ('sporting shoes n4',     'D-142'),
    ('american clasic',       'D-108'),
    ('america clasic',        'D-108'),
    ('american classic store','D-108'),
    ('jerusalem panama',      'D-80')
) AS r(cliente_n, codigo)
WHERE gi.cliente_codigo IS NULL
  AND COALESCE(gi.deleted, false) = false
  AND fg_norm_guia_texto(gi.cliente) = r.cliente_n
  AND EXISTS (SELECT 1 FROM guia_transporte gt WHERE gt.id = gi.guia_id AND gt.deleted = false)
  AND EXISTS (SELECT 1 FROM clientes_master cm WHERE cm.codigo = r.codigo AND cm.deleted = false);


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 3B — corrección PUNTUAL de UNA fila. Esperado: 1 fila. 🔴 Si da más, PARÁ.
-- ────────────────────────────────────────────────────────────────────────────
-- La línea `City Mall | Guabito` de la GUÍA 36. Daniel: "era paso canoas".
--
-- 🔴 ESTO NO ES UNA REGLA, Y NO DEBE VOLVERSE UNA. Va acotada por NÚMERO DE
-- GUÍA justamente para que no alcance a nadie más: en Guabito despachan los
-- duty free (La Frontera, Outlet Duty Free N2, Jerusalem Duty Free, Wolf Mall)
-- y hay 12 líneas más con esa dirección que NO son City Mall. Meter
-- ("city mall","guabito") en la tabla del PASO 2 habría sido barato de escribir
-- y habría atado mal la próxima línea que alguien cargue.
--
-- ⚠️ La dirección SIGUE DICIENDO "Guabito", y se queda así. Esa guía está
-- Completada y firmada: cambiarle el texto impreso a un documento ya entregado
-- es otra cosa que lo que se aprobó. Acá solo se anota a qué cliente fue.
UPDATE guia_items gi
SET cliente_codigo = 'D-25'
FROM guia_transporte gt
WHERE gt.id = gi.guia_id
  AND gt.numero = 36
  AND gt.deleted = false
  AND gi.cliente_codigo IS NULL
  AND COALESCE(gi.deleted, false) = false
  AND fg_norm_guia_texto(gi.cliente)   = 'city mall'
  AND fg_norm_guia_texto(gi.direccion) = 'guabito'
  AND EXISTS (SELECT 1 FROM clientes_master cm WHERE cm.codigo = 'D-25' AND cm.deleted = false);


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 4 — el ÚNICO caso de reescritura: D-201 → D-108. Esperado: 13 filas.
-- ────────────────────────────────────────────────────────────────────────────
-- D-201 "American Classics" es un duplicado sin respaldo en Switch (0 facturas,
-- 0 CXC). D-108 es el American Classics real del grupo. El texto de la línea
-- ("AMERICAN CLASSICS") queda intacto, como en todo lo demás.
--
-- D-201 NO se borra de `clientes_master`. Eso es decisión de Daniel.
UPDATE guia_items gi
SET cliente_codigo = 'D-108'
WHERE upper(btrim(gi.cliente_codigo)) = 'D-201'
  AND COALESCE(gi.deleted, false) = false
  AND EXISTS (SELECT 1 FROM guia_transporte gt WHERE gt.id = gi.guia_id AND gt.deleted = false)
  AND EXISTS (SELECT 1 FROM clientes_master cm WHERE cm.codigo = 'D-108' AND cm.deleted = false);


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 5 — verificación. Esperado: 441 vivas · 320 atadas · 121 sin atar ·
--          0 con D-201 · 0 con código ajeno (no D-XXX).
-- ────────────────────────────────────────────────────────────────────────────
WITH vivas AS (
  SELECT gi.cliente_codigo
  FROM guia_items gi
  JOIN guia_transporte gt ON gt.id = gi.guia_id AND gt.deleted = false
  WHERE COALESCE(gi.deleted, false) = false
)
SELECT COUNT(*)                                                            AS lineas_vivas,
       COUNT(*) FILTER (WHERE cliente_codigo IS NOT NULL)                  AS atadas,
       COUNT(*) FILTER (WHERE cliente_codigo IS NULL)                      AS sin_atar,
       COUNT(*) FILTER (WHERE upper(btrim(cliente_codigo)) = 'D-201')      AS quedan_en_d201,
       COUNT(*) FILTER (WHERE cliente_codigo IS NOT NULL
                          AND cliente_codigo !~ '^D-[0-9]+$')              AS codigo_ajeno,
       COUNT(*) FILTER (WHERE upper(btrim(cliente_codigo)) = 'D-108')      AS en_d108
FROM vivas;


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 6 — qué quedó SIN ATAR y por qué. Esperado: 121 líneas, ~94 textos.
-- ────────────────────────────────────────────────────────────────────────────
-- No es una lista de pendientes urgentes: son destinos que hoy NO existen en el
-- directorio (tiendas de Sporting Shoes que no son la N4, duty free de Guabito,
-- City Moda, etc.). Se atan a mano desde /guias cuando alguien sepa cuál es.
--
-- 🔴 Verificá que NO aparezca ninguna línea de City Mall: las 100 tienen que
--    haber quedado atadas. Sí siguen acá los duty free de Guabito (La Frontera,
--    Outlet Duty Free N2, Wolf Mall), que es lo correcto.
SELECT gt.numero AS guia,
       gi.cliente,
       gi.direccion,
       COUNT(*) OVER (PARTITION BY fg_norm_guia_texto(gi.cliente),
                                   fg_norm_guia_texto(gi.direccion)) AS lineas_iguales
FROM guia_items gi
JOIN guia_transporte gt ON gt.id = gi.guia_id AND gt.deleted = false
WHERE gi.cliente_codigo IS NULL
  AND COALESCE(gi.deleted, false) = false
ORDER BY lineas_iguales DESC, gi.cliente, gi.direccion, gt.numero;
