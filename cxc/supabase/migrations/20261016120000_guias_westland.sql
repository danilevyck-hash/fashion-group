-- ═════════════════════════════════════════════════════════════════════════════
-- Guías — «Wesland» se escribe «Westland» (8-sep-2026)
-- ═════════════════════════════════════════════════════════════════════════════
-- Es el mismo arreglo que «Changuinola» del 5-sep-2026, en el otro typo que
-- quedó sembrado en la lista de destinos: la lista OFRECÍA la grafía mala, la
-- gente la tocaba, y el mismo lugar contaba como dos destinos distintos.
--
-- 🩸 EL DATO, medido contra producción el 8-sep-2026:
--   · La lista compartida (`guias_destino_lista`, fila id 15) ofrece «Wesland».
--   · En `guia_items` hay 5 renglones que dicen EXACTAMENTE «Wesland»
--     (4 vivos en 4 guías distintas + 1 de una guía ya borrada).
--   · La grafía buena SOLA no existe en el histórico: «Westland» exacto = 0
--     renglones. Solo aparece acompañada de la tienda («WESTLAND TIENDA 5»,
--     «TIENDA 6 WESTLAND MALL», «MAS FLOW - WESTLAND»…), que dicen MÁS que el
--     nombre del lugar.
--   · Y los destinos DEFINIDOS por Daniel ya dicen «Westland»: D-99 (el de
--     siempre) y D-142 Sporting Shoes (con sus tiendas 5, 6, 14 y «Mas Flow»).
--     O sea que la grafía correcta ya estaba decidida; lo que estaba mal era lo
--     que el campo ofrecía.
--
-- 🔴 ACOTADA AL VALOR EXACTO, NUNCA UN `LIKE` SUELTO. Un `ILIKE '%wesland%'`
-- también pisaría «WESTLAND TIENDA 5» o «WESTLAND (ENTREGA EN SPORTCORNER)»,
-- que son direcciones que dicen algo más que el nombre del mall y que nadie
-- pidió reescribir. Acá se cambia solo lo que es EXACTAMENTE el nombre mal
-- escrito, con o sin espacios en los bordes.
--
-- 🔴 NADA SE PAREA POR PARECIDO. Que «Wesland» y «Westland» sean el mismo lugar
-- NO lo dedujo una distancia de edición: lo dice la lista escrita a mano de
-- `guias_destino_cliente`, revisada por Daniel. `claveDestino` los sigue viendo
-- como dos destinos distintos y eso no cambia — es lo correcto, porque la regla
-- del sistema es exacta y normalizada, jamás por semejanza.
--
-- ⚠️ Esto TOCA el histórico, que en este módulo es la excepción y no la regla
-- («el texto escrito no se toca»). Es un tipeo del nombre de un mall, no un
-- dato del envío: no cambia a quién se le mandó, ni cuántos bultos, ni cuándo.
-- Medido antes y después: 226 guías vivas · 540 renglones · 7.630 bultos,
-- idénticos. Cero filas de `guia_transporte` se tocan.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── 1) Los renglones viejos ─────────────────────────────────────────────────
-- 5 filas (4 vivas + 1 de guía borrada). El criterio es el mismo que el de
-- «Changuinola»: el valor EXACTO, con o sin bordes.
UPDATE guia_items
   SET direccion = 'Westland'
 WHERE btrim(direccion) = 'Wesland';

-- ─── 2) La lista que ofrece el campo ─────────────────────────────────────────
-- 🔴 SOFT DELETE FIRMADO, NUNCA DELETE — y tampoco un UPDATE del texto en su
-- lugar: la fila dice `creado_por = 'sistema'` el 7-sep-2026, y reescribirle el
-- destino haría que esa firma mienta (nunca se sembró «Westland»). Se quita la
-- mala, se agrega la buena, y en la tabla queda escrito que «Wesland» se ofreció
-- y por qué dejó de ofrecerse.
UPDATE guias_destino_lista
   SET activo          = false,
       desactivado_por = 'migracion-20261016120000',
       desactivado_en  = now()
 WHERE destino = 'Wesland'
   AND activo;

-- El índice único es solo entre ACTIVAS, así que esto convive con la fila
-- quitada de arriba. Medido: no había ninguna «Westland» activa.
INSERT INTO guias_destino_lista (destino, creado_por, creado_en)
VALUES ('Westland', 'migracion-20261016120000', now())
ON CONFLICT DO NOTHING;
