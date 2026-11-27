-- Multifashion: «Jailine» (2024–2026) y «Jailine Quispe» (desde el 8-nov-2026)
-- son la MISMA vendedora (Daniel, 27-nov-2026). Medido: las dos vienen con el
-- MISMO código de Switch (4); Switch le cambió el nombre en noviembre y la
-- pantalla la partía en dos filas por el nombre.
--
-- Se usa el amarre que YA existe (`multifashion_vendedora_alias`, leído por
-- `multifashion_vendedora_canonica`): código 4 → «Jailine Quispe». Ninguna venta
-- cambia ni se borra; solo el nombre con el que se agrupa. El total de la
-- tienda no se mueve (medido antes y después en el informe del PR).
--
-- 🔑 El amarre exigía dos códigos DISTINTOS (`..._no_a_si_mismo`): servía para
-- «dos códigos, una persona». Aquí es UN código con dos nombres, así que la
-- regla se ensancha lo justo: se rechaza solo el amarre que no cambia NADA
-- (mismo código Y mismo nombre). Ninguna fila existente cambia.
--
-- Y la meta activa «Viaje playa» la tenía como participante por su clave vieja
-- («JAILINE»): se le pone la clave del nombre que ahora se muestra, o su aporte
-- dejaría de verse. Una fila.

ALTER TABLE public.multifashion_vendedora_alias
  DROP CONSTRAINT IF EXISTS multifashion_vendedora_alias_no_a_si_mismo;
ALTER TABLE public.multifashion_vendedora_alias
  ADD CONSTRAINT multifashion_vendedora_alias_no_a_si_mismo
  CHECK (codigo_switch <> codigo_canonico OR nombre_switch <> nombre_canonico);

INSERT INTO public.multifashion_vendedora_alias
  (codigo_switch, codigo_canonico, nombre_switch, nombre_canonico, creado_por)
VALUES
  (4, 4, 'Jailine', 'Jailine Quispe', 'migracion-20270130120000')
ON CONFLICT DO NOTHING;

UPDATE public.multifashion_meta_participantes
   SET vendedora_clave = 'JAILINE QUISPE',
       vendedora_nombre = 'Jailine Quispe'
 WHERE vendedora_clave = 'JAILINE';
