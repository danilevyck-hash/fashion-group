-- ============================================================================
-- GUÍAS — atar al cliente las líneas viejas que parean SOLAS. Nada más.
--
-- Corre esta migración UNA SOLA VEZ en el SQL Editor de Supabase.
-- ADITIVA. Sin DROP, sin DELETE. Solo un UPDATE acotado.
-- ============================================================================
--
-- ── EL PROBLEMA, medido contra producción el 8-ago-2026 ─────────────────────
--
--   441 líneas de guía (de las 177 guías vivas)
--    └─ 441 con el NOMBRE del cliente escrito   (100%)
--    └─ 120 con el CÓDIGO D-XXX                 ( 27%)
--
--   177 guías · 116 sin ninguna línea con código
--
-- El cliente SÍ se anota siempre — se anota A MANO, y cada quien lo escribe
-- distinto: "City Mall" / "City Mall " / "City Mall Paso Canoa",
-- "Jerusalem Panama" vs "Jerusalem De Panamá". De las 321 sin código, 49
-- parean solas contra un cliente real y 272 no.
--
-- ── 🩸 LO QUE ESTE UPDATE **NO** HACE, Y ES LO MÁS IMPORTANTE ───────────────
--
-- **Ni una sola fila se ata por parecido, por distancia de edición ni por "se
-- parece bastante".** Solo por nombre normalizado IDÉNTICO. "City Moda Los
-- Andes" y "City Moda Los Pueblos" son tiendas DISTINTAS: confundirlas mete
-- despachos en el cliente equivocado, y un despacho mal atribuido es peor que
-- un despacho sin atribuir. Las 272 que no parean se quedan como están y se
-- atan a mano desde la pantalla (`/guias`, enlace "Atar cliente" en cada
-- línea del acordeón).
--
-- ── LAS TRES CONDICIONES DEL PAREO, y por qué cada una ──────────────────────
--
-- 1. `cm.codigo LIKE 'D-%'` — NO `codigo IS NOT NULL`.
--
--    🩸 Este es EL bug del backfill de junio (20260607131000), que filtraba
--    `IS NOT NULL`. Boston y Multifashion usan códigos NUMÉRICOS pelados
--    (`181`, `12188`, `111380`), así que ese filtro los dejaba entrar. Resultado
--    medido: **la línea "American Classic Store" de GT-183 quedó atada al código
--    `111380`**, que es de Confecciones Boston y no del grupo. Esa fila NO se
--    toca acá (ver la nota del final).
--
-- 2. `cm.deleted = false` — un cliente dado de baja no puede recibir despachos
--    nuevos en el historial.
--
-- 3. **UN SOLO código D-XXX vivo para ese nombre.** El `NOT EXISTS` de abajo.
--
--    🩸 El comentario de la migración de junio afirmaba que un índice UNIQUE
--    parcial sobre `clientes_master.nombre_normalized` garantizaba "a lo sumo 1
--    match, no hay fan-out". **Eso es falso hoy**, medido: hay 3 nombres con
--    DOS códigos D-XXX vivos cada uno —
--        "CITY MODA CHORRERA"          → D-30  y D-26
--        "METRO SHOES PANAMA SA"       → D-103 y D-173
--        "EL MACHETAZO SAN MIGUELITO"  → D-171 y D-101
--    Un `UPDATE ... FROM` con dos filas candidatas elige UNA en silencio y de
--    forma NO determinística. Un nombre ambiguo tampoco es inequívoco, así que
--    no se ata: se manda a la pantalla, donde una persona decide cuál es.
--    (Hoy ninguna línea de guía cae en esos 3 nombres — el guard es para que
--    siga sin poder pasar cuando entren datos nuevos.)
--
-- ── LO QUE SE ESPERA ────────────────────────────────────────────────────────
--
--   filas tocadas ........  49
--   quedan sin atar ...... 272   (se atan a mano desde /guias)
--
-- El paso 3 lo verifica y el paso 4 lo cuenta. Si "tocadas" no da 49, PARAR y
-- avisar: el universo cambió desde la medición.
-- ============================================================================

-- ── 1. La columna ya existe desde jun-2026. Aditivo e idempotente igual. ────
ALTER TABLE guia_items
  ADD COLUMN IF NOT EXISTS cliente_codigo text;

-- ── 2. Índice para que "¿qué le despaché a este cliente?" no sea un seq scan
--       de la tabla entera. Parcial: las filas sin atar no se buscan por código.
CREATE INDEX IF NOT EXISTS idx_guia_items_cliente_codigo
  ON guia_items (cliente_codigo)
  WHERE cliente_codigo IS NOT NULL;

-- ── 3. VISTA PREVIA — corré esto ANTES del UPDATE y mirá el número. ─────────
--       Tiene que decir 49. Es un SELECT: no escribe nada.
WITH candidatos AS (
  SELECT
    cm.codigo,
    cm.nombre_normalized
  FROM clientes_master cm
  WHERE cm.deleted = false
    AND cm.codigo LIKE 'D-%'
    -- Sin gemelo vivo con el mismo nombre. Ver el punto 3 de la cabecera.
    AND NOT EXISTS (
      SELECT 1 FROM clientes_master otro
      WHERE otro.deleted = false
        AND otro.codigo LIKE 'D-%'
        AND otro.nombre_normalized = cm.nombre_normalized
        AND otro.codigo <> cm.codigo
    )
)
SELECT count(*) AS se_atarian
FROM guia_items gi
JOIN candidatos c
  ON c.nombre_normalized =
     regexp_replace(
       regexp_replace(upper(trim(gi.cliente)), '[.,]', '', 'g'),
       '\s+', ' ', 'g'
     )
WHERE gi.cliente_codigo IS NULL
  AND gi.cliente IS NOT NULL
  AND btrim(gi.cliente) <> '';

-- ── 4. EL BACKFILL. Mismas condiciones, ni una más. ────────────────────────
--
--    Normalizador canónico, idéntico a `clientes_master.nombre_normalized` y al
--    `norm()` de `api/guias/frecuencias`: UPPER + quitar [.,] + colapsar
--    espacios. Eso es lo que hace que "City Mall " (con el espacio de más) y
--    "Outlet Duty Free N3, S.A." pareen; NO hace que "City Mall" pareé con
--    "City Mall Paso Canoa", que es exactamente lo que no queremos.
--
--    `cliente_codigo IS NULL` acota a las que no tienen nada guardado: una
--    línea ya atada NUNCA se pisa, ni siquiera la de `111380`.
UPDATE guia_items gi
SET cliente_codigo = cm.codigo
FROM clientes_master cm
WHERE cm.deleted = false
  AND cm.codigo LIKE 'D-%'
  AND NOT EXISTS (
    SELECT 1 FROM clientes_master otro
    WHERE otro.deleted = false
      AND otro.codigo LIKE 'D-%'
      AND otro.nombre_normalized = cm.nombre_normalized
      AND otro.codigo <> cm.codigo
  )
  AND gi.cliente_codigo IS NULL
  AND gi.cliente IS NOT NULL
  AND btrim(gi.cliente) <> ''
  AND cm.nombre_normalized =
      regexp_replace(
        regexp_replace(upper(trim(gi.cliente)), '[.,]', '', 'g'),
        '\s+', ' ', 'g'
      );

-- ── 5. VERIFICACIÓN — cómo quedó. ──────────────────────────────────────────
SELECT
  count(*)                                                          AS lineas,
  count(*) FILTER (WHERE cliente_codigo IS NOT NULL)                AS atadas,
  count(*) FILTER (WHERE cliente_codigo IS NULL
                     AND cliente IS NOT NULL
                     AND btrim(cliente) <> '')                      AS sin_atar,
  count(*) FILTER (WHERE cliente_codigo IS NOT NULL
                     AND cliente_codigo NOT LIKE 'D-%')             AS codigo_ajeno
FROM guia_items;

-- ── 6. 🔴 PARA DANIEL — UNA fila que NO se toca acá, a propósito. ───────────
--
--    Este SELECT la muestra. Es la línea "American Classic Store" de GT-183,
--    atada al código `111380`, que es de Confecciones Boston (se coló por el
--    `IS NOT NULL` del backfill de junio).
--
--    NO se corrige sola porque **no es inequívoco qué debería quedar**:
--      · si va a NULL, la línea pierde el vínculo y hay que atarla a mano; o
--      · si va a un D-XXX, hay que decidir a CUÁL — "American Classic Store"
--        (Boston) y "American Classics" (D-201, del grupo) no son
--        obviamente el mismo negocio, y adivinar mete un despacho en el
--        cliente equivocado.
--
--    Se arregla desde la pantalla en 10 segundos: /guias → abrir GT-183 →
--    "Atar cliente" en esa línea (o "Quitar" para dejarla sin vínculo).
SELECT
  gt.numero,
  gt.estado,
  gi.cliente,
  gi.cliente_codigo
FROM guia_items gi
JOIN guia_transporte gt ON gt.id = gi.guia_id
WHERE gi.cliente_codigo IS NOT NULL
  AND gi.cliente_codigo NOT LIKE 'D-%';
