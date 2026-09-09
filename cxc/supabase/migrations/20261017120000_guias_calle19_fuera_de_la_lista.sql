-- ═════════════════════════════════════════════════════════════════════════════
-- Guías — «CALLE 19» sale de la lista de destinos (8-sep-2026)
-- ═════════════════════════════════════════════════════════════════════════════
-- 🔴 NO ES UN DESTINO: ES UNA CALLE. Entró a la semilla del 7-sep-2026 porque
-- se usó 13 veces, y el criterio de la semilla fue el uso real (3+ veces). El
-- uso era cierto; lo que estaba mal es que se siguiera OFRECIENDO, porque
-- «CALLE 19» sola no dice a qué tienda va el envío.
--
-- 🩸 EL DATO, medido contra producción el 8-sep-2026:
--   · `guias_destino_lista` la ofrece (fila id 8, sembrada con 13 usos).
--   · En `guia_items` son 13 renglones vivos, en tres grafías: «CALLE 19» (9),
--     «Calle 19» (3) y «Calle 19 » (1).
--   · Y ya hay DOS destinos definidos que la nombran bien, los dos dictados por
--     Daniel a mano el 4-sep-2026: D-35 City Shoes → «Calle 19 Central, al lado
--     de la joyería Super Oro» y D-112 Nine Sport → «Calle 19 Central».
--     Esos dos siguen apareciendo como botones de SU cliente, y
--     «Calle 19 Central» (14 usos) se queda en la lista general.
--
-- 🔴 LOS 13 RENGLONES VIEJOS NO SE TOCAN. Es historia: dicen lo que se escribió
-- el día que salió cada guía. Acá no hay un tipeo que corregir —como «Wesland»
-- o «Changinola»—, hay un destino que dejó de ofrecerse. Esta migración no
-- tiene ni un UPDATE sobre `guia_items`, y hay candado que lo exige.
--
-- 🔴 SOFT DELETE FIRMADO, NUNCA DELETE. La fila se queda con quién la quitó y
-- cuándo; si mañana hace falta, se vuelve a agregar de un toque en
-- Guías › Configuración (el índice único es solo entre activas).
--
-- ⚠️ Acotada al VALOR EXACTO: `destino = 'CALLE 19'`. Un `LIKE '%CALLE 19%'`
-- se llevaría por delante «Calle 19 Central», que es el destino BUENO.
--
-- Medido antes y después: 226 guías vivas · 540 renglones · 7.630 bultos,
-- idénticos — esta migración no toca una sola guía.
-- ═════════════════════════════════════════════════════════════════════════════

UPDATE guias_destino_lista
   SET activo          = false,
       desactivado_por = 'migracion-20261017120000',
       desactivado_en  = now()
 WHERE destino = 'CALLE 19'
   AND activo;
