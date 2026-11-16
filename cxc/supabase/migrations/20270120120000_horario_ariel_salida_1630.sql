-- Corrección de dato (16-nov-2026), aprobada por Daniel: «sí, corrígelo a 4:30 pm».
-- Ariel Rodríguez (Boston, código 65) quedó con salida 04:30 al guardar su
-- horario hoy a las 9:25 a. m. de Panamá; debe ser 16:30. Con 04:30 el Reporte
-- le contaba ~12 h de extra al día. Solo cambia la columna `salida` de esa fila.
-- La ruta PUT /api/asistencia/horarios no deja rastro: se anota aquí a mano.
BEGIN;

UPDATE asistencia_horarios
   SET salida = '16:30:00', updated_at = now()
 WHERE empleado_codigo = '65'
   AND salida = '04:30:00';

INSERT INTO activity_logs (user_role, action, entity_type, entity_id, details)
VALUES ('admin', 'update', 'asistencia_horarios', NULL,
  json_build_object(
    'detalle', 'Corrección de Claude aprobada por Daniel, 16-nov-2026: salida de Ariel Rodríguez de 04:30 a 16:30 (se había guardado 04:30 por error)',
    'empleado_codigo', '65',
    'antes', json_build_object('salida', '04:30:00'),
    'despues', json_build_object('salida', '16:30:00'),
    'user_name', 'Claude (por orden de Daniel)'
  )::text);

COMMIT;
