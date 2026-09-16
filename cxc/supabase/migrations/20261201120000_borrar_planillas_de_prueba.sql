-- ─────────────────────────────────────────────────────────────────────────────
-- BORRAR LAS CABECERAS DE PLANILLA QUE NO SON QUINCENAS (15-sep-2026).
--
-- Daniel, textual: *«borrarlas. Son pruebas»*. Y el 14-sep, sobre esas mismas
-- corridas: *«a nadie se le ha pagado nada»*.
--
-- ── QUÉ SON ──────────────────────────────────────────────────────────────────
-- Son las pruebas que dejó Roxana el 13-sep-2026 usando «Otro rango ⌄», el
-- calendario que ese mismo día se retiró de la Planilla. Un rango que no es una
-- quincena prorratea el sueldo por `factorBase`, APAGA los montos escritos a
-- mano (ISR, préstamo, terceros, mercancía, otros servicios) y deja guardada
-- una cabecera con `quincena = NULL` — y esa cabecera es justo la razón por la
-- que el ajuste de la quincena anterior no se dispara nunca: `medirAjusteAnterior`
-- exige que la anterior esté cerrada COMO quincena y con su corte.
--
-- ── 🩸 MEDIDO CONTRA PRODUCCIÓN, 15-sep-2026, ANTES DE ESCRIBIR ESTO ─────────
-- `asistencia_planilla_guardada` tiene **6 filas**. CINCO tienen `quincena = NULL`
-- (no son quincenas) y UNA es una quincena de verdad:
--
--   · b7923fbf  vistana              2026-08-15 → 2026-08-28  cerrada     9 líneas
--   · e47211e7  confecciones_boston  2026-08-15 → 2026-08-31  reabierta  18 líneas
--   · 4996da0f  confecciones_boston  2026-08-15 → 2026-08-25  cerrada    18 líneas
--   · 5bc68925  fashion_wear         2026-08-15 → 2026-08-28  cerrada     8 líneas
--   · 09bc634d  vistana              2026-08-29 → 2026-09-10  reabierta   9 líneas
--   · 55b47a9f  fashion_wear         2026-09-01 → 2026-09-15  cerrada  ← ES QUINCENA
--
-- Las CINCO tienen **0 amarres** en `asistencia_planilla_prestamo`: ninguna le
-- bajó la deuda a nadie. La única que sí escribió pagos (códigos 29 y 10, los
-- dos movimientos que existen) es `55b47a9f`, que es una quincena de verdad y
-- **NO se toca**.
--
-- ── 🔴 SOLO SE BORRAN LAS TRES QUE DANIEL VIO ────────────────────────────────
-- El encargo del 15-sep-2026 le mostró TRES y sobre esas tres dijo «borrarlas».
-- Las otras dos —`b7923fbf` (vistana 15→28 ago) y `5bc68925` (fashion_wear
-- 15→28 ago)— son de la misma tanda (misma fecha, mismo usuario, mismo tipo de
-- rango) y casi seguro son pruebas también, pero **él no las vio**, y borrar
-- una planilla cerrada que nadie miró no se decide por parecido. Quedan para
-- que se le pregunten; agregarlas es sumar dos líneas a la lista de abajo.
--
-- ── 🔴 POR LISTA DE IDS EXPLÍCITA, NUNCA UN `DELETE` ABIERTO ─────────────────
-- Un `DELETE ... WHERE quincena IS NULL` se llevaría por delante cualquier
-- cabecera futura que caiga en ese estado. Acá se nombran los tres uuid, uno
-- por uno, y antes de borrar se comprueba que sigan siendo lo que se midió: si
-- alguno resultara ser una quincena, o tuviera un pago de préstamo atado, la
-- migración FALLA ENTERA y no borra nada.
--
-- ⚠️ El FK de las líneas es `ON DELETE RESTRICT`: hay que borrar las líneas
-- primero. Va todo en una transacción (Supabase corre cada archivo en una), así
-- que o se van las tres cabeceras con sus líneas, o no se va ninguna.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  ids uuid[] := ARRAY[
    '09bc634d-2c85-4d98-967d-d9cdea45e2de',  -- vistana             2026-08-29 → 2026-09-10 (reabierta)
    'e47211e7-690a-4fba-a18f-d4b02e461db5',  -- confecciones_boston 2026-08-15 → 2026-08-31 (reabierta)
    '4996da0f-e861-4d93-93a6-753e1e6cb03b'   -- confecciones_boston 2026-08-15 → 2026-08-25 (cerrada)
  ];
  antes_cab   int;
  antes_lin   int;
  con_quin    int;
  con_pago    int;
  borradas    int;
  despues_cab int;
BEGIN
  SELECT count(*) INTO antes_cab FROM asistencia_planilla_guardada;
  SELECT count(*) INTO antes_lin FROM asistencia_planilla_guardada_linea
    WHERE planilla_id = ANY(ids);
  RAISE NOTICE 'ANTES: % cabeceras en total; las 3 nombradas tienen % líneas', antes_cab, antes_lin;

  -- 🔴 GUARDA 1: ninguna de las tres puede ser una quincena de verdad.
  SELECT count(*) INTO con_quin FROM asistencia_planilla_guardada
    WHERE id = ANY(ids) AND quincena IS NOT NULL;
  IF con_quin > 0 THEN
    RAISE EXCEPTION 'ABORTADO: % de las cabeceras nombradas SÍ es una quincena. No se borró nada.', con_quin;
  END IF;

  -- 🔴 GUARDA 2: ninguna puede haberle bajado la deuda a nadie. Si alguna tiene
  -- un pago atado, borrarla dejaría el movimiento huérfano y el saldo mentiría.
  SELECT count(*) INTO con_pago FROM asistencia_planilla_prestamo
    WHERE planilla_id = ANY(ids);
  IF con_pago > 0 THEN
    RAISE EXCEPTION 'ABORTADO: hay % pago(s) de préstamo atados a estas cabeceras. No se borró nada.', con_pago;
  END IF;

  -- Las líneas primero: el FK es ON DELETE RESTRICT a propósito.
  DELETE FROM asistencia_planilla_guardada_linea WHERE planilla_id = ANY(ids);
  DELETE FROM asistencia_planilla_guardada WHERE id = ANY(ids);
  GET DIAGNOSTICS borradas = ROW_COUNT;

  IF borradas <> 3 THEN
    RAISE EXCEPTION 'ABORTADO: se esperaban 3 cabeceras y se borraron %. Se revierte todo.', borradas;
  END IF;

  SELECT count(*) INTO despues_cab FROM asistencia_planilla_guardada;
  RAISE NOTICE 'DESPUÉS: % cabeceras (se borraron % con sus % líneas)', despues_cab, borradas, antes_lin;
END $$;
