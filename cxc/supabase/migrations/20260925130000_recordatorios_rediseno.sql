-- ─────────────────────────────────────────────────────────────────────────────
-- RECORDATORIOS — el rediseño del módulo (5-sep-2026).
--
-- El módulo `cheques` pasó a llamarse Recordatorios en agosto; esto es el
-- rediseño de adentro, definido con Daniel contra producción:
--
--   · UNA sola lista, sin pestañas, con cheques y recordatorios juntos.
--   · Escribir un recordatorio es UN RENGLÓN, no una ventana de 4 campos.
--   · UN solo mensaje diario, a las 9:00 a.m. de Panamá.
--   · Los cheques VENCIDOS avisan, una sola vez.
--   · Un cheque depositado se retira solo a los 365 días.
--
-- ── 🔴 ADITIVA. NI UNA FILA CAMBIA DE VALOR ──────────────────────────────────
--
-- Solo se AGREGAN columnas, todas con default o NULL, y se AMPLÍA un CHECK.
-- Nada se borra, nada se renombra, ningún dato se reescribe.
--
-- Medido en producción justo antes de escribir esto (5-sep-2026):
--   cheques        → 19 filas vivas · 17 depositado ($257.174,34) + 2 pendiente
--                    ($22.221,78) · ninguna borrada
--   recordatorios  → 1 fila viva
--
-- ⚠️ El código NO degrada sin esto corrido. La tolerancia a «todavía no corrió
-- el DDL» se retiró de este módulo el 3-sep-2026 a propósito (ver el encabezado
-- de src/lib/recordatorios/server.ts): con la tabla puesta, un «no existe» es un
-- permiso o un cambio de esquema, y leerlo como «falta la migración» dejaba la
-- pantalla normal y vacía mientras los avisos dejaban de sonar. Correr este
-- archivo es parte del despliegue, no un paso opcional.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. RECORDATORIOS — «cada día», «hasta» y «a quién»
-- ═════════════════════════════════════════════════════════════════════════════

-- ── `cada_dia` ───────────────────────────────────────────────────────────────
-- El aviso es UNO por día, así que «cada día» es la repetición más natural del
-- módulo y no estaba. El CHECK sigue siendo una lista CERRADA: un valor
-- inventado dejaría un recordatorio que no vuelve a sonar y nadie se enteraría.
ALTER TABLE recordatorios DROP CONSTRAINT IF EXISTS recordatorios_repeticion_check;
ALTER TABLE recordatorios ADD CONSTRAINT recordatorios_repeticion_check
  CHECK (repeticion IN ('una_vez', 'cada_dia', 'semanal', 'mensual'));

-- ── `hasta` ──────────────────────────────────────────────────────────────────
-- Fecha de fin OPCIONAL de una repetición. NULL = corre hasta que alguien lo
-- borre, que es el caso común. El CHECK impide las dos formas de dejarlo
-- inservible: un `hasta` anterior al arranque (no sonaría nunca) y un `hasta`
-- sobre algo que no se repite (no significa nada, y se volvería una bomba el día
-- que a ese recordatorio le pongan repetición).
ALTER TABLE recordatorios ADD COLUMN IF NOT EXISTS hasta date;
ALTER TABLE recordatorios DROP CONSTRAINT IF EXISTS recordatorios_hasta_check;
ALTER TABLE recordatorios ADD CONSTRAINT recordatorios_hasta_check
  CHECK (hasta IS NULL OR (repeticion <> 'una_vez' AND hasta >= fecha));

-- ── `destino` ────────────────────────────────────────────────────────────────
-- A quién le llega el aviso de las 9:00:
--   'equipo'  → 📊 el grupo de Telegram (tres personas, con el celular de la
--               empresa). Es el DEFAULT y es lo que pasaba hasta hoy: la única
--               fila que existe queda exactamente igual que estaba.
--   'privado' → el chat privado de Daniel.
--
-- 🔴 La opción la ven SOLO los admin; lo que escribe una secretaria va siempre
-- al equipo, y eso lo fuerza el SERVIDOR (`destinoPermitido`), no la pantalla.
--
-- ⚠️ Hay UN solo chat privado, el de Daniel, y hay DOS admin (daniel y
-- alberto): si Alberto marca «solo a mí», el mensaje le llega a DANIEL. Daniel
-- lo sabe y lo aprobó así. No se inventa un chat por usuario.
ALTER TABLE recordatorios ADD COLUMN IF NOT EXISTS destino text NOT NULL DEFAULT 'equipo';
ALTER TABLE recordatorios DROP CONSTRAINT IF EXISTS recordatorios_destino_check;
ALTER TABLE recordatorios ADD CONSTRAINT recordatorios_destino_check
  CHECK (destino IN ('equipo', 'privado'));

COMMENT ON COLUMN recordatorios.hasta IS
  'Fecha de fin OPCIONAL de una repetición (inclusive). NULL = corre hasta que se borre. Solo con repeticion <> una_vez.';
COMMENT ON COLUMN recordatorios.destino IS
  'equipo (default, el grupo de Telegram) | privado (el chat de Daniel). Lo decide el SERVIDOR segun el rol: solo admin puede elegir privado.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. CHEQUES — el aviso de vencido (una sola vez) y la retención de 365 días
-- ═════════════════════════════════════════════════════════════════════════════

-- ── `aviso_vencido_en` ───────────────────────────────────────────────────────
-- 🩸 EL HUECO QUE COSTABA PLATA. El aviso de cheques mira hoy y el próximo día
-- hábil: un cheque que venció y nadie marcó **no se volvía a mencionar jamás**.
-- Estaba pasando el día que se escribió esto — Vistana, cheque 018094, Edwin,
-- $18.393,32, vencía el 31-ago y seguía pendiente cinco días después.
--
-- Ahora avisa, UNA SOLA VEZ, y esta columna es la memoria de que ya se avisó.
-- NULL = todavía no. Una columna y no una tabla nueva: el dato es del cheque,
-- muere con él, y `cheques` ya entra al respaldo diario.
--
-- ⚠️ Se escribe DESPUÉS de que Telegram confirme. Marcarla antes y que el envío
-- falle quemaría el único aviso que ese cheque va a tener.
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS aviso_vencido_en timestamptz;

-- ── `deleted_at` ─────────────────────────────────────────────────────────────
-- Cuándo se retiró la fila. Lo escribe la retención de 365 días (y cualquier
-- borrado a mano). `cheques.deleted` ya existía sin fecha: sin ella no se puede
-- distinguir «lo borró alguien» de «se retiró solo por antigüedad».
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- La consulta de la retención: los depositados vivos, por fecha. Parcial, porque
-- lo único que se barre son los vivos.
CREATE INDEX IF NOT EXISTS cheques_depositados_vivos_idx
  ON cheques (estado, fecha_depositado)
  WHERE deleted = false;

COMMENT ON COLUMN cheques.aviso_vencido_en IS
  'Cuando salio el aviso unico de "vencio y sigue sin depositar". NULL = todavia no se aviso. Se escribe DESPUES de que Telegram confirme: marcarlo antes quemaria el unico aviso de ese cheque.';
COMMENT ON COLUMN cheques.deleted_at IS
  'Cuando se retiro la fila. Lo escribe la retencion de 365 dias del cron cheques-alert (soft delete, nunca DELETE).';
