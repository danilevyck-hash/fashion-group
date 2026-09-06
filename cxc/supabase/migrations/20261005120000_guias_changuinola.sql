-- ═════════════════════════════════════════════════════════════════════════════
-- guia_items.direccion — «Changinola» se escribe «Changuinola»
-- ═════════════════════════════════════════════════════════════════════════════
-- Daniel, 5-sep-2026: «es changuinola».
--
-- 🩸 EL DATO, medido contra producción ese mismo día:
--   · 26 renglones vivos dicen «Changinola» (sin la «u») y 1 dice «Changuinola».
--   · Los DOS destinos definidos de ese pueblo en `guias_destino_cliente`
--     (D-156 Wolf Mall Center y D-147 Top Shop) ya dicen «Changuinola».
--   · La lista que el formulario OFRECÍA (`DEFAULT_DIRECCIONES`) decía
--     «Changinola», así que la grafía mala se tocaba y se repetía sola.
-- Consecuencia: el MISMO pueblo contaba como DOS destinos distintos en el
-- agrupado histórico, y los botones de destino de un cliente ofrecían las dos.
--
-- 🔴 ACOTADA AL VALOR EXACTO, NUNCA UN `LIKE` SUELTO. Un `ILIKE '%changinola%'`
-- pisaría «Changinola pasillo 4» o «Changinola centro» — direcciones que dicen
-- algo más que el pueblo y que nadie pidió reescribir. Acá se cambia solo lo
-- que es EXACTAMENTE el nombre mal escrito, con o sin bordes.
--
-- ⚠️ Esto TOCA el histórico, que en este módulo es la excepción y no la regla
-- («el texto escrito no se toca»). Es un tipeo del nombre de un pueblo, no un
-- dato del envío: no cambia a quién se le mandó, ni cuántos bultos, ni cuándo.
-- Cero filas de `guia_transporte` se tocan; el estado, las firmas y los bultos
-- quedan idénticos.
-- ═════════════════════════════════════════════════════════════════════════════

UPDATE guia_items
   SET direccion = 'Changuinola'
 WHERE btrim(direccion) = 'Changinola';
