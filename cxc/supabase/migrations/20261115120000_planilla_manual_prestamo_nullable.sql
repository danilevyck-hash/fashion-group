-- ─────────────────────────────────────────────────────────────────────────────
-- PLANILLA — «NO DESCONTAR EL PRÉSTAMO ESTA QUINCENA» (11-sep-2026)
--
-- Daniel: *«sí»* a poder saltarse una quincena.
--
-- ── 🩸 POR QUÉ ────────────────────────────────────────────────────────────────
--
-- Desde el 11-sep-2026 la cuota del préstamo (y la de terceros) entra SOLA a la
-- casilla de la planilla; lo escrito a mano manda. Las dos columnas eran
-- `NOT NULL DEFAULT 0`, y el 0 se leía como «nadie escribió nada → va la cuota
-- automática». O sea que NO había forma de decir «esta quincena, nada»: si
-- Yulissa borraba la casilla, volvía la cuota; si escribía 0, volvía la cuota.
--
-- ── 🔴 LOS TRES ESTADOS ──────────────────────────────────────────────────────
--
--     NULL   = no escrito: va la cuota automática que propone Préstamos
--     0      = escrito a propósito: ESTA QUINCENA NO SE DESCUENTA
--     monto  = escrito a mano: se descuenta ESE monto
--
-- Solo cambian `prestamo` y `terceros`, que son las DOS casillas con cuota
-- automática. `mercancia` (daño) no propone cuota, así que en ella NULL y 0
-- dirían lo mismo; `isr` y `otros_servicios` tampoco. Se quedan como están.
--
-- ── 🔴 BACKFILL: TODO 0 PASA A NULL, Y NADIE CAMBIA DE NETO ───────────────────
--
-- Medido el 11-sep-2026 antes de correr esto: 28 filas (12 · 14 · 2 en las
-- quincenas 2026-08-1, 2026-08-2 y 2026-09-1); `prestamo = 0` en 6 (5 + 1 + 0)
-- y `terceros = 0` en las 28. Ninguna NULL.
--
-- No se puede saber POR COLUMNA si un 0 llegó por el DEFAULT o lo tecleó una
-- persona: la pantalla siempre escribe la fila entera (`upsert` de las cinco
-- casillas) y `updated_at` es de la fila. Y no hace falta saberlo: hasta hoy un
-- 0 solo podía significar «vacío» —antes del 11-sep la casilla se escribía a
-- mano y 0 era «nada»; desde el 11-sep, 0 era «va la cuota»—. Ningún 0 pudo
-- significar «no descontar», porque ese significado nace con esta migración.
-- Dejarlos en 0 sí cambiaría netos: le apagaría la cuota a 6 personas en
-- agosto sin que nadie lo pidiera. A NULL, la planilla da lo de ayer al centavo.
--
-- (El 0 de Martha Chavarría en 2026-08-1 — puesto por la migración
-- 20260902140000 al mover $15 a mercancía — también es «nada en préstamo».)
--
-- Aditiva e idempotente: DROP NOT NULL / DROP DEFAULT no fallan si ya están, el
-- UPDATE está acotado al valor EXACTO 0 y no toca `updated_at` (no es una
-- edición de una persona). Sin `LIKE`, sin UPDATE amplio.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE asistencia_planilla_manual
  ALTER COLUMN prestamo DROP NOT NULL,
  ALTER COLUMN prestamo DROP DEFAULT,
  ALTER COLUMN terceros DROP NOT NULL,
  ALTER COLUMN terceros DROP DEFAULT;

-- El CHECK (prestamo >= 0) se queda: NULL lo pasa, y un negativo sigue sin entrar.

UPDATE asistencia_planilla_manual SET prestamo = NULL WHERE prestamo = 0;
UPDATE asistencia_planilla_manual SET terceros = NULL WHERE terceros = 0;

COMMENT ON COLUMN asistencia_planilla_manual.prestamo IS
  'Casilla «Préstamo» de la planilla. NULL = no escrito, va la cuota automática que propone Préstamos. 0 = escrito a propósito: esta quincena NO se descuenta (el cierre no anota pago). Monto > 0 = se descuenta ese monto. Desde 20261115120000; antes era NOT NULL DEFAULT 0 y el 0 se leía como vacío.';

COMMENT ON COLUMN asistencia_planilla_manual.terceros IS
  'Casilla «Terceros» de la planilla. Misma regla que prestamo: NULL = va la cuota automática de la ficha; 0 = esta quincena no se descuenta, a propósito; monto > 0 = se descuenta ese monto. Desde 20261115120000.';
