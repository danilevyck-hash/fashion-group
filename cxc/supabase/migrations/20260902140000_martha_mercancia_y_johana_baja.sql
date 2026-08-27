-- ─────────────────────────────────────────────────────────────────────────────
-- DOS CORRECCIONES DE DATOS, CADA UNA CON SU GUARD DE CONDUCTA.
--
-- Son dos filas y nada más. Van juntas porque las dos salieron de la misma
-- revisión de la quincena 1-15 de agosto de 2026 con la contadora.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · LOS $15 DE MARTHA SON DE MERCANCÍA, NO DE PRÉSTAMO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- MARTHA ASUCENA CHAVARRIA Z. (código 43) tiene $15,00 en la casilla `prestamo`
-- de la quincena `2026-08-1`. **Lo confirmó la contadora: son de MERCANCÍA.** Y
-- se comprueba solo: Martha no tiene ninguna ficha en el módulo de Préstamos.
--
-- 🔴 SU PAGO NO SE MUEVE UN CENTAVO, y no es un razonamiento: está EJECUTADO.
-- Las dos columnas entran en la MISMA suma (`totalDeducciones = seguroSocial +
-- seguroEducativo + isr + prestamo + terceros + mercancia`), así que el total y
-- el neto quedan idénticos. `scripts/_verif-martha-mercancia-no-mueve-nada.ts`
-- corre `calcularDinero` —la misma función que paga— con los montos de antes y
-- los de después sobre LAS 12 PERSONAS de la quincena y compara los 20 campos
-- de dinero: **288 campos, 2 cambios (las dos casillas de Martha) y 0 cambios
-- no pedidos.** Lo que cambia es de qué se dice que es el descuento.
--
-- ⚠️ EL GUARD ES DE CONDUCTA, NO UN COMENTARIO. El UPDATE exige que la casilla
-- diga EXACTAMENTE 15,00 y que la de mercancía esté en 0. Si alguien ya lo
-- corrigió a mano, o si el monto cambió, **no se escribe nada**: correr esto dos
-- veces no puede mover otros $15, y encontrarse otro número es motivo para
-- parar, no para pisarlo.

UPDATE asistencia_planilla_manual
   SET prestamo   = 0,
       mercancia  = mercancia + 15,
       updated_at = now()
 WHERE quincena        = '2026-08-1'
   AND empleado_codigo = '43'
   AND prestamo        = 15.00
   AND mercancia       = 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · JOHANA VALLEJO SE DA DE BAJA EN PRÉSTAMOS
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Ya no trabaja acá y **ya pagó todo**: sus dos fichas suman saldo $0,00
-- (medido, 1.523,00 prestado contra 1.523,00 pagado en una, y 1.300,00 contra
-- 1.300,00 en la otra). Una de las dos seguía marcada como activa, así que el
-- módulo la contaba entre la gente con préstamo vivo. Tampoco tiene ficha en la
-- planilla, o sea que el amarre la deja —correctamente— sin código.
--
-- 🔴 SE ARCHIVA, NO SE BORRA. `activo = false` es lo que hace el botón de
-- archivar de la pantalla; sus 78 movimientos quedan intactos y su historial se
-- puede seguir consultando. Borrar una ficha con 78 movimientos de plata es
-- irreversible y nadie lo pidió.
--
-- ⚠️ GUARD DE CONDUCTA: solo se archiva la ficha cuyo SALDO REAL da 0,00,
-- calculado con la MISMA cuenta del módulo (`prestado − pagado` sobre los
-- movimientos aprobados y no borrados). Si mañana alguien le carga un préstamo
-- nuevo, esta migración deja de tocarla en vez de esconderle una deuda viva.

UPDATE prestamos_empleados e
   SET activo = false
 WHERE upper(btrim(e.nombre)) = 'JOHANA VALLEJO'
   AND e.activo = true
   AND coalesce(e.deleted, false) = false
   AND 0 = (
     SELECT coalesce(sum(
              CASE
                WHEN m.concepto IN ('Préstamo', 'Responsabilidad por daño') THEN m.monto
                WHEN m.concepto IN ('Pago', 'Abono extra', 'Pago de responsabilidad') THEN -m.monto
                ELSE 0
              END), 0)
       FROM prestamos_movimientos m
      WHERE m.empleado_id = e.id
        AND m.estado = 'aprobado'
        AND coalesce(m.deleted, false) = false
   );
