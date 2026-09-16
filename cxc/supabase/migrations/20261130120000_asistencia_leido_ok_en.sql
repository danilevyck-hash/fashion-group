-- ─────────────────────────────────────────────────────────────────────────────
-- ASISTENCIA — CUÁNDO SE PUDO LEER EL RELOJ POR ÚLTIMA VEZ (15-sep-2026).
--
-- ── EL PROBLEMA QUE RESUELVE ─────────────────────────────────────────────────
-- Daniel, con la captura de Telegram en la mano: cuatro mensajes en 35 minutos
-- por el reloj de Multifashion —«falló 3 veces» / «ya volvió» / «falló 3 veces»
-- / «ya volvió»—, a las 11:04, 11:11, 11:22 y 11:39 de la noche. Y el dato que
-- faltaba lo puso él: *«pero la PC del reloj está apagada a estas horas»*. El
-- reloj de Multifashion vive EN LA TIENDA, que cierra a las 7. Que de noche no
-- se pueda leer no es una avería: es que la tienda está cerrada.
--
-- Su decisión, textual: *«¿que me avise si lleva más de 24 horas, si de lunes a
-- viernes?»*. O sea: el aviso mide **cuánto hace que no se puede leer EL
-- RELOJ**, no cuánto hace que no se sabe nada de la PC.
--
-- 🩸 Y ESA DIFERENCIA ES TODO EL PUNTO. El vigía medía `visto_en`, que es
-- «cuándo dio señales la PC de la oficina» — y el ingest lo actualiza TAMBIÉN
-- cuando el agente reporta que NO pudo leer el reloj. En el episodio que
-- originó esto la PC estaba PRENDIDA (por eso llegaron los cuatro mensajes) y
-- el reloj inalcanzable: con `visto_en` siempre fresco, ese caso no habría
-- sonado nunca. Esta columna es la que lo hace medible.
--
-- ── SEGURIDAD DE LA MIGRACIÓN ────────────────────────────────────────────────
-- Un solo `ADD COLUMN IF NOT EXISTS`: aditiva, idempotente, corre en
-- milisegundos y no toca ni una fila. Y el código aguanta que ESTO NO SE HAYA
-- CORRIDO: el vigía mide `leido_ok_en ?? visto_en`, así que sin la columna se
-- comporta EXACTAMENTE como hoy (avisa a las 24 h de silencio de la PC) y con
-- ella cubre también el reloj inalcanzable. Falla ABIERTA, nunca muda de más.
--
-- ⚠️ Las filas existentes quedan en NULL hasta la primera lectura buena, y
-- mientras tanto cuentan desde `visto_en`. No hace falta backfill: en cuanto el
-- agente traiga algo bien, la columna se llena sola.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE asistencia_dispositivos
  -- Cuándo se LEYÓ el reloj sin error por última vez. Lo escribe SOLO el camino
  -- del éxito de /api/asistencia/ingest. NULL = todavía no hubo ninguna lectura
  -- buena desde que existe la columna.
  ADD COLUMN IF NOT EXISTS leido_ok_en timestamptz;

COMMENT ON COLUMN asistencia_dispositivos.leido_ok_en IS
  'Último instante en que el reloj se pudo LEER bien (no confundir con visto_en, que es el último contacto de la PC y se mueve también cuando el agente reporta un error). De acá sale el aviso de «más de 24 horas sin poder leerse», 15-sep-2026.';
