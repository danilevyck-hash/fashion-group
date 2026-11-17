-- ─────────────────────────────────────────────────────────────────────────────
-- PRÉSTAMOS — el pago de $200 de Roxana Hernández (15-nov-2026) pasa de
-- «Efectivo» a «Abono». UNA fila, por su id. Aprobado por Daniel el 16-nov-2026.
--
-- Por qué: la pantalla ofrecía «Abono» y la base lo rechazaba (ver
-- `20270121120000`), así que la fila quedó con la palabra vieja. Medido antes
-- de correrla: ningún número se mueve — el saldo mira el concepto, y el freno
-- de duplicados, la casilla de la planilla y la columna «Origen» de Movimientos
-- solo preguntan «¿es Quincena o vacío?». «Efectivo» y «Abono» contestan igual.
-- Lo único que cambia es la palabra que se ve en la ficha y en el Excel.
--
-- Requiere `20270121120000` aplicada (el CHECK tiene que aceptar «Abono»).
-- Deja rastro en `activity_logs`.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  n integer;
BEGIN
  UPDATE prestamos_movimientos
     SET origen_pago = 'Abono'
   WHERE id = '0fc31704-63b7-46b7-888f-6098e14a91a1'
     AND concepto = 'Pago'
     AND monto = 200.00
     AND origen_pago = 'Efectivo';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'Se esperaba corregir exactamente 1 fila y se encontraron %', n;
  END IF;

  INSERT INTO activity_logs (user_role, action, entity_type, entity_id, details)
  VALUES (
    'admin',
    'prestamo_mov_update',
    'prestamos',
    '0fc31704-63b7-46b7-888f-6098e14a91a1',
    jsonb_build_object(
      'movimientoId', '0fc31704-63b7-46b7-888f-6098e14a91a1',
      'fields', jsonb_build_array('origen_pago'),
      'antes', 'Efectivo',
      'despues', 'Abono',
      'user_name', 'Claude (corrección aprobada por Daniel, 16-nov-2026)',
      'migracion', '20270121120100_prestamos_roxana_pago_abono'
    )
  );
END $$;
