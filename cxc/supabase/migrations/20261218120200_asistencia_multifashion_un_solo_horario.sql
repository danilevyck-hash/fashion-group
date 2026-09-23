-- Multifashion: cada persona tiene UN horario, marque donde marque (Daniel, 23-sep-2026).
-- Ana Trejos (2), Cindy De Gracia (3) y Yeisibeth Muñoz (306) pasan a 09:00–18:00 en el reloj
-- y se les quita el horario «de afuera» (que era ese mismo 09:00–18:00). Las otras cinco de la
-- tienda siguen 10:00–18:30 y nunca tuvieron horario de afuera. Rodrigo (13, bodega) NO se toca:
-- Daniel confirmó que es el único con dos horarios distintos a propósito.
-- 3 filas. No toca marcas ni planillas cerradas.
UPDATE asistencia_horarios
   SET entrada = '09:00', salida = '18:00',
       entrada_afuera = NULL, salida_afuera = NULL,
       updated_at = now()
 WHERE empleado_codigo IN ('2', '3', '306');
