-- ─────────────────────────────────────────────────────────────────────────────
-- ASISTENCIA — LAS VACACIONES SE MUDAN A SU PROPIA MESA
--
-- Daniel, 25-ago-2026: unas vacaciones NO son una justificacion. Una
-- justificacion explica por que alguien FALTO un dia que tenia que trabajar;
-- unas vacaciones son un derecho que se gana, se gasta y lleva su propia
-- cuenta de dias. Metidas en la misma lista, en tres meses nadie puede
-- distinguir quien estuvo enfermo de quien estuvo de vacaciones.
--
-- Una vacacion es: persona + desde + hasta + un interruptor. Nada mas.
--
-- ── EL INTERRUPTOR: "ya se le pago" ─────────────────────────────────────────
--
-- La regla es de la contadora, textual: "Si la persona habia cobrado sus
-- vacaciones anteriormente en dinero y no se habia ido esos tres dias, yo se
-- los descuento porque ya se los pague; si la persona no ha cobrado sus
-- vacaciones entonces se los pago."
--
--   ya_pagadas = false  (DEFAULT) -> esos dias SE PAGAN. No se descuenta nada.
--   ya_pagadas = true             -> esos dias NO se pagan: ya se cobraron.
--
-- ── 🔴 EL DEFAULT ES false Y ESO NO SE PUEDE CAMBIAR SIN MIRAR ──────────────
--
-- El caso normal es que se pagan, y es EXACTAMENTE el comportamiento que hoy
-- tiene la justificacion de ELOYN MENDOZA (codigo 29, 16-jul -> 13-ago-2026):
-- sus dias no se descuentan. Con un default en `true`, mudarla le habria
-- descontado una quincena entera sin que nadie tocara nada.
--
-- ── ⚠️ ESTA MIGRACION SI MUEVE UNA FILA, y esta medido cual ────────────────
--
-- Contado por la puerta de la app (GET /api/asistencia/justificaciones,
-- 25-ago-2026): hay 5 justificaciones vivas y **UNA SOLA** con motivo
-- "Vacaciones" — la de ELOYN MENDOZA. Las otras 4 (3 de Incapacidad y 1 de
-- trabajo fuera) NO se tocan.
--
-- El PASO 1 es una VISTA PREVIA que no escribe: si el conteo no da 1, se para
-- ahi y no se corre el resto. El PASO 3 borra la justificacion vieja, y ese
-- borrado NO es opcional: dejarla viva haria que el mismo dia se lea DOS veces
-- —una como vacacion y otra como "Ausencia justificada — Vacaciones"— y con
-- dos etiquetas para el mismo dia la pantalla y el papel terminan diciendo
-- cosas distintas.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── PASO 1 · VISTA PREVIA (no escribe nada) ─────────────────────────────────
-- Tiene que devolver UNA fila: empleado_codigo 29, 2026-07-16 -> 2026-08-13.
SELECT
  empleado_codigo,
  desde,
  hasta,
  nota,
  registrado_por
FROM asistencia_justificaciones
WHERE btrim(motivo) = 'Vacaciones'
ORDER BY desde;

-- ── PASO 2 · LA TABLA ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asistencia_vacaciones (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- El codigo del reloj. La misma llave que usa todo el modulo.
  empleado_codigo   text NOT NULL CHECK (btrim(empleado_codigo) <> ''),

  desde             date NOT NULL,
  hasta             date NOT NULL,

  -- 🔴 EL INTERRUPTOR. NOT NULL con DEFAULT false: "no se sabe" no existe acá,
  -- porque de este campo depende si a alguien se le descuenta la quincena. Un
  -- NULL obligaria a cada lector a inventar un default, y basta con que uno lo
  -- invente al reves para que la planilla pague de mas o de menos.
  ya_pagadas        boolean NOT NULL DEFAULT false,

  -- Quien la cargo y cuando. No es un campo que alguien llene: es la firma.
  registrado_por    text,
  created_at        timestamptz NOT NULL DEFAULT now(),

  -- Soft delete, como el resto del modulo. Una vacacion ya avisada al personal
  -- no se borra: se retira, y queda el rastro de que existio.
  deleted           boolean NOT NULL DEFAULT false,

  -- Un rango al reves no cubriria ningun dia: seria una vacacion que no
  -- vacaciona nada, y en silencio.
  CONSTRAINT asistencia_vacaciones_rango CHECK (hasta >= desde)
);

-- La lectura tipica es "las vacaciones que tocan este rango de fechas", por
-- persona. Es la misma forma del indice que ya tienen las justificaciones.
CREATE INDEX IF NOT EXISTS asistencia_vacaciones_emp_idx
  ON asistencia_vacaciones (empleado_codigo, desde);

-- RLS encendida SIN politicas: nadie entra con la llave publica. Todo el
-- acceso pasa por el servidor con service_role, igual que el resto del modulo.
ALTER TABLE asistencia_vacaciones ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE asistencia_vacaciones IS
  'Vacaciones por rango de fechas. En un dia de vacaciones no se calcula nada del reloj: no genera horas, ni tardanza, ni ausencia. ya_pagadas = true significa que esos dias NO se pagan porque ya se cobraron en efectivo antes.';
COMMENT ON COLUMN asistencia_vacaciones.ya_pagadas IS
  'false (default) = esos dias SE PAGAN. true = NO se pagan: la persona ya los cobro en dinero antes y la planilla se los descuenta.';
COMMENT ON COLUMN asistencia_vacaciones.deleted IS
  'Soft delete. Una vacacion se retira, no se borra: el rastro de que existio vale mas que la fila limpia.';

-- ── PASO 3 · LA MUDANZA DE LA UNICA VACACION VIVA ───────────────────────────
--
-- 🔴 NACE SIN MARCAR (ya_pagadas queda en su DEFAULT false), o sea que se
-- sigue pagando exactamente como hoy. Es la unica forma de que mudarla no
-- mueva un centavo.
--
-- El NOT EXISTS hace la migracion idempotente: correrla dos veces no duplica
-- la vacacion. Compara por (persona, desde, hasta), que es lo que la
-- identifica — el id es nuevo y no sirve para reconocerla.
INSERT INTO asistencia_vacaciones (empleado_codigo, desde, hasta, registrado_por)
SELECT j.empleado_codigo, j.desde, j.hasta, j.registrado_por
FROM asistencia_justificaciones j
WHERE btrim(j.motivo) = 'Vacaciones'
  AND NOT EXISTS (
    SELECT 1
    FROM asistencia_vacaciones v
    WHERE v.empleado_codigo = j.empleado_codigo
      AND v.desde = j.desde
      AND v.hasta = j.hasta
  );

-- Y recien ahora se retira la justificacion vieja. El orden importa: si el
-- DELETE fuera primero y el INSERT fallara, la vacacion desapareceria y esos
-- dias volverian a contarse como ausencia.
--
-- ⚠️ Se borra SOLO lo que ya quedo copiado: el EXISTS lo verifica fila por
-- fila contra la tabla nueva. Un DELETE ... WHERE motivo = 'Vacaciones' a
-- secas confiaria en que el INSERT de arriba salio bien, y eso es justo lo que
-- no se puede dar por sentado cuando lo que se pierde es una quincena.
DELETE FROM asistencia_justificaciones j
WHERE btrim(j.motivo) = 'Vacaciones'
  AND EXISTS (
    SELECT 1
    FROM asistencia_vacaciones v
    WHERE v.empleado_codigo = j.empleado_codigo
      AND v.desde = j.desde
      AND v.hasta = j.hasta
  );

-- ── PASO 4 · COMPROBACION (no escribe nada) ─────────────────────────────────
-- Tiene que devolver: vacaciones_migradas = 1, justificaciones_vacaciones = 0.
SELECT
  (SELECT count(*) FROM asistencia_vacaciones WHERE deleted = false)         AS vacaciones_migradas,
  (SELECT count(*) FROM asistencia_justificaciones
    WHERE btrim(motivo) = 'Vacaciones')                                      AS justificaciones_vacaciones,
  (SELECT count(*) FROM asistencia_vacaciones WHERE ya_pagadas = true)       AS marcadas_ya_pagadas;

-- ─────────────────────────────────────────────────────────────────────────────
-- ⛔ LO QUE ESTA MIGRACION NO HACE, A PROPOSITO
--
--   1. NO toca las otras 4 justificaciones vivas (3 de Incapacidad y la de
--      trabajo fuera de la oficina, la de RODRIGO MIRANDA). El WHERE nombra
--      un solo motivo y lo compara por igualdad, sin LIKE.
--   2. NO marca a nadie como "ya pagado". La unica vacacion que se muda nace
--      sin marcar, que es como se comporta hoy.
--   3. NO agrega un CHECK sobre `motivo` en asistencia_justificaciones. Sigue
--      siendo texto libre a proposito: los motivos RETIRADOS —Permiso, Luto,
--      Otro y el nombre viejo de "Trabajo de vendedor"— estan guardados en
--      filas vivas y un CHECK con la lista nueva las volveria invalidas.
--   4. NO lleva cuenta de dias de vacaciones ganados ni gastados. Eso no
--      existe hoy en el sistema y es una decision de Daniel, aparte.
--
-- ⚠️ La app FUNCIONA SIN ESTA MIGRACION: `leerVacaciones` devuelve cero filas
-- cuando la tabla no existe, la pestaña de Vacaciones lo dice en ambar y todo
-- el resto del modulo se comporta EXACTAMENTE como antes.
-- ─────────────────────────────────────────────────────────────────────────────
