-- ============================================================================
-- Guías — atar las líneas donde el nombre escrito ES el del cliente
-- ============================================================================
-- Corre esta migración A MANO en el SQL Editor de Supabase, PASO POR PASO.
-- El PASO 1 no escribe nada: es la vista previa. Si sus conteos no dan lo
-- esperado, PARÁ ahí y no sigas — algo cambió en los datos desde la medición.
--
-- Estado medido el 9-ago-2026 contra producción, DESPUÉS de la migración de
-- City Mall (20260809120000):
--     441 líneas vivas · 320 atadas (73%) · 121 sin atar en 68 nombres
--
-- 🔴 EL TEXTO ESCRITO NO SE TOCA. NUNCA. Solo se escribe `cliente_codigo`.
-- La guía impresa no cambia ni un carácter: sigue diciendo "GRUPO HANNA" y no
-- "Grupo Hanna, S.A.". El código es plomería invisible.
--
-- ── LA REGLA, Y POR QUÉ ESTAS 12 SON SEGURAS ────────────────────────────────
--
-- El nombre escrito y el del directorio son IGUALES salvo la coletilla
-- jurídica (`S.A.`, `S, A`, `Int`) y los signos de puntuación:
--
--     escrito "GRUPO HANNA"                 maestro "Grupo Hanna, S.A."     D-68
--     escrito "Wolf Mall Center"            maestro "Wolf Mall Center Int"  D-156
--     escrito "City Moda Calidonia"         maestro "City Moda / Calidonia" D-27
--     escrito "Dollar Mall S, A"            maestro "Dollar Mall"           D-46
--
-- Y para cada uno hay **UN SOLO** cliente D-XXX vivo que cumple eso — medido,
-- comparando contra el nombre Y la razón social de los 146 vivos.
--
-- 🔴 LO QUE HACE SEGURA A LA REGLA ES QUE **NO TOCA LOS DÍGITOS.**
-- `Outlet Duty Free N2` (D-117), `N3` (D-118) y `Sporting Shoes N 4` (D-142)
-- son TIENDAS DISTINTAS. Una normalización que borre o ignore los números las
-- vuelve el mismo nombre y mete el despacho de una en la cuenta de otra, sin
-- dejar rastro: el texto seguiría diciendo "N2". Por eso el candado
-- `src/__tests__/lib/guias-reglas-nombres-exactos.test.ts` exige, regla por
-- regla, que los dígitos del texto escrito y los del nombre del cliente sean
-- IDÉNTICOS, y se pone rojo si alguien agrega un pareo cruzado.
--
-- ⚠️ NADA POR PARECIDO. Ni distancia de edición, ni LIKE, ni "casi igual".
-- `Hanna Calzado` (falta la S), `Nine Sport`, `American Clasicc`, `Jerusalem
-- Dutty Free` y los otros 55 nombres NO entran acá: se atan A MANO desde
-- `/guias`, donde la pantalla ahora SUGIERE los candidatos parecidos y la
-- persona confirma. Esa es la diferencia entre lo que se escribe solo y lo que
-- necesita ojos.
--
-- Solo se escriben filas con `cliente_codigo IS NULL`. Una línea ya atada nunca
-- se pisa, ni siquiera para "mejorarla".
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 0 — el normalizador tiene que existir. NO se vuelve a escribir acá.
-- ────────────────────────────────────────────────────────────────────────────
-- `fg_norm_guia_texto` la creó `20260809120000_guias_atar_city_mall_y_remapeo_d201.sql`.
-- Copiarla acá sería tener DOS definiciones del mismo criterio de pareo, y un
-- día divergirían en silencio. Si esto revienta, corré primero esa migración.
DO $fgchk$
BEGIN
  IF to_regprocedure('fg_norm_guia_texto(text)') IS NULL THEN
    RAISE EXCEPTION 'Falta fg_norm_guia_texto(text). Corré primero 20260809120000_guias_atar_city_mall_y_remapeo_d201.sql';
  END IF;
END
$fgchk$;


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 1 — VISTA PREVIA. No escribe nada. 🔴 SI LOS NÚMEROS NO DAN, PARÁ ACÁ.
-- ────────────────────────────────────────────────────────────────────────────
-- Esperado, medido el 9-ago-2026:
--
--   texto escrito                        código  líneas
--   -------------------------------------------------
--   grupo hanna                          D-68         6
--   wolf mall center                     D-156        6
--   super centro la competencia          D-145        5
--   outlet duty free n2                  D-117        5
--   star shoes                           D-144        3
--   city moda los andes                  D-32         2
--   petty shop                           D-122        2
--   outlet duty free n3                  D-118        2
--   city moda calidonia                  D-27         1
--   city moda del este                   D-31         1
--   mas flow 21 oeste                    D-99         1
--   dollar mall s, a                     D-46         1
--   -------------------------------------------------
--   TOTAL a atar                                     35
--
--   líneas vivas       441
--   atadas antes       320   →  después   355  (80,5%)
--   sin atar antes     121   →  después    86
WITH reglas(cliente_n, codigo) AS (
  VALUES
    ('grupo hanna',                 'D-68'),
    ('wolf mall center',            'D-156'),
    ('super centro la competencia', 'D-145'),
    ('outlet duty free n2',         'D-117'),
    ('star shoes',                  'D-144'),
    ('city moda los andes',         'D-32'),
    ('petty shop',                  'D-122'),
    ('outlet duty free n3',         'D-118'),
    ('city moda del este',          'D-31'),
    ('city moda calidonia',         'D-27'),
    ('mas flow 21 oeste',           'D-99'),
    ('dollar mall s, a',            'D-46')
),
vivas AS (
  SELECT gi.id, gi.cliente_codigo,
         fg_norm_guia_texto(gi.cliente) AS cliente_n
  FROM guia_items gi
  JOIN guia_transporte gt ON gt.id = gi.guia_id AND gt.deleted = false
  WHERE COALESCE(gi.deleted, false) = false
),
sin_atar AS (SELECT * FROM vivas WHERE cliente_codigo IS NULL)
SELECT 'A) por regla' AS bloque, r.codigo, r.cliente_n AS regla, COUNT(s.id) AS lineas
FROM reglas r
LEFT JOIN sin_atar s ON s.cliente_n = r.cliente_n
GROUP BY r.codigo, r.cliente_n
UNION ALL
SELECT 'B) totales', '', 'lineas vivas', COUNT(*) FROM vivas
UNION ALL
SELECT 'B) totales', '', 'atadas hoy',   COUNT(*) FROM vivas WHERE cliente_codigo IS NOT NULL
UNION ALL
SELECT 'B) totales', '', 'sin atar hoy', COUNT(*) FROM sin_atar
ORDER BY 1, 2, 3;

-- Los 12 destinos tienen que salir VIVOS. Si falta alguno, PARÁ.
SELECT codigo, nombre, razon_social, deleted
FROM clientes_master
WHERE codigo IN ('D-68','D-156','D-145','D-117','D-144','D-32',
                 'D-122','D-118','D-31','D-27','D-99','D-46')
ORDER BY codigo;


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 2 — atar. Esperado: 35 filas.
-- ────────────────────────────────────────────────────────────────────────────
-- `cliente` y `direccion` NO se tocan. La lista es IDÉNTICA a la del PASO 1: si
-- difirieran, la vista previa estaría mintiendo sobre lo que va a pasar, que es
-- la peor forma de fallar acá. El candado lo verifica leyendo este archivo.
UPDATE guia_items gi
SET cliente_codigo = r.codigo
FROM (
  VALUES
    ('grupo hanna',                 'D-68'),
    ('wolf mall center',            'D-156'),
    ('super centro la competencia', 'D-145'),
    ('outlet duty free n2',         'D-117'),
    ('star shoes',                  'D-144'),
    ('city moda los andes',         'D-32'),
    ('petty shop',                  'D-122'),
    ('outlet duty free n3',         'D-118'),
    ('city moda del este',          'D-31'),
    ('city moda calidonia',         'D-27'),
    ('mas flow 21 oeste',           'D-99'),
    ('dollar mall s, a',            'D-46')
) AS r(cliente_n, codigo)
WHERE gi.cliente_codigo IS NULL
  AND COALESCE(gi.deleted, false) = false
  AND fg_norm_guia_texto(gi.cliente) = r.cliente_n
  AND EXISTS (SELECT 1 FROM guia_transporte gt WHERE gt.id = gi.guia_id AND gt.deleted = false)
  -- El destino tiene que existir VIVO. Si alguien borrara D-117, esto no
  -- escribe nada en vez de dejar líneas apuntando a un cliente que no está.
  AND EXISTS (SELECT 1 FROM clientes_master cm WHERE cm.codigo = r.codigo AND cm.deleted = false);


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 3 — verificación. Esperado: 441 vivas · 355 atadas · 86 sin atar ·
--          0 con código ajeno (todo lo atado tiene que ser D-XXX).
-- ────────────────────────────────────────────────────────────────────────────
WITH vivas AS (
  SELECT gi.cliente_codigo
  FROM guia_items gi
  JOIN guia_transporte gt ON gt.id = gi.guia_id AND gt.deleted = false
  WHERE COALESCE(gi.deleted, false) = false
)
SELECT COUNT(*)                                                   AS lineas_vivas,
       COUNT(*) FILTER (WHERE cliente_codigo IS NOT NULL)         AS atadas,
       COUNT(*) FILTER (WHERE cliente_codigo IS NULL)             AS sin_atar,
       COUNT(*) FILTER (WHERE cliente_codigo IS NOT NULL
                          AND cliente_codigo !~ '^D-[0-9]+$')     AS codigo_ajeno
FROM vivas;


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 4 — qué quedó SIN ATAR. Esperado: 86 líneas en 56 textos.
-- ────────────────────────────────────────────────────────────────────────────
-- No es una lista de urgencias: son nombres con error de tipeo (`Hanna
-- Calzado`, `Jerusalem Dutty Free`, `American Clasicc`) o tiendas que hoy no
-- existen en el directorio. Los primeros se atan de un toque desde `/guias`
-- —la pantalla sugiere los candidatos parecidos—; los segundos hay que darlos
-- de alta en Switch primero.
SELECT gt.numero AS guia,
       gi.cliente,
       gi.direccion,
       COUNT(*) OVER (PARTITION BY fg_norm_guia_texto(gi.cliente)) AS lineas_iguales
FROM guia_items gi
JOIN guia_transporte gt ON gt.id = gi.guia_id AND gt.deleted = false
WHERE gi.cliente_codigo IS NULL
  AND COALESCE(gi.deleted, false) = false
ORDER BY lineas_iguales DESC, gi.cliente, gt.numero;
