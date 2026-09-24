-- ─────────────────────────────────────────────────────────────────────────────
-- ASISTENCIA — LAS TRES REGLAS DE HORAS DEL 24-sep-2026
--
--   1. GRACIA DEL ALMUERZO (5 minutos sobre la duración). Daniel, textual:
--      «Almuerzo de 60 que dura 65 no descuenta nada; si dura 66, se descuentan
--      los 6, igual que la tardanza se cuenta desde la hora y no desde el
--      minuto 11. En Multifashion 60 más 5, en las otras 30 más 5.» Una sola
--      regla para las cuatro empresas: una columna en el singleton de reglas.
--   2. ENTRADA AUTORIZADA POR DÍA. «Hoy entraba a las __:__», con motivo y
--      firma. Ese día la hora extra se mide desde esa hora hasta la entrada
--      del horario y pasa por Aprobaciones como cualquier extra. Tabla propia.
--   3. AVISO DE ENTRADA TEMPRANA desde 30 minutos («solo desde 30 minutos»),
--      configurable: la otra columna del singleton.
--
-- ── POR QUÉ LA ENTRADA AUTORIZADA ES UNA TABLA Y NO UN TIPO DE CORRECCIÓN ────
--
-- Una corrección (`asistencia_correcciones`) cambia QUÉ HORA VALE para el
-- cálculo: pisa, agrega o quita una marca. La entrada autorizada no toca una
-- sola marca: cambia DESDE DÓNDE SE MIDE la hora extra de la entrada. Meterla
-- en la misma tabla obligaría a un `tipo` nuevo, a que `aplicarCorrecciones` y
-- cada lector la filtren, y chocaría con el único parcial
-- `(empleado_codigo, fecha, hora) WHERE marcacion_id IS NULL` cuando alguien
-- agregue una marca a la misma hora. Tabla chica, misma forma que las
-- correcciones: motivo obligatorio, firma, y se ANULA, nunca se borra.
--
-- ── QUÉ TOCA ─────────────────────────────────────────────────────────────────
--
--   · `asistencia_reglas`: dos columnas con DEFAULT. Es UNA fila (id = 1).
--   · `asistencia_entradas_autorizadas`: tabla nueva, vacía.
--
-- Aditiva e idempotente. No borra, no reescribe y no recalcula nada.
-- 🔴 NINGÚN NÚMERO DE UNA QUINCENA YA CERRADA CAMBIA: la planilla guardada es
-- el RESULTADO congelado (`asistencia_planilla_guardada`), no la receta.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1 · Gracia del almuerzo ──────────────────────────────────────────────────
-- Minutos que puede pasarse el almuerzo sin descuento. Pasados, el exceso se
-- cuenta ENTERO desde el minuto programado (65 → 0 · 66 → 6, con 60 de
-- almuerzo). Mismo techo que la tolerancia de tardanza.
ALTER TABLE asistencia_reglas
  ADD COLUMN IF NOT EXISTS gracia_almuerzo_min smallint NOT NULL DEFAULT 5
  CONSTRAINT asistencia_reglas_gracia_almuerzo_rango
  CHECK (gracia_almuerzo_min BETWEEN 0 AND 60);

COMMENT ON COLUMN asistencia_reglas.gracia_almuerzo_min IS
  'Gracia del almuerzo, en minutos sobre la duración (24-sep-2026). 60 que dura 65 no descuenta; 66 descuenta los 6 enteros. Una sola regla para las cuatro empresas. 0 = como antes, desde el minuto uno.';

-- ── 3 · Aviso de entrada temprana ────────────────────────────────────────────
-- Desde cuántos minutos antes de su hora de entrada se avisa «llegó N min antes
-- · ¿entrada autorizada?». Es un AVISO: no cuenta, no frena el cierre.
-- 0 = sin aviso.
ALTER TABLE asistencia_reglas
  ADD COLUMN IF NOT EXISTS aviso_entrada_temprana_min smallint NOT NULL DEFAULT 30
  CONSTRAINT asistencia_reglas_aviso_entrada_temprana_rango
  CHECK (aviso_entrada_temprana_min BETWEEN 0 AND 240);

COMMENT ON COLUMN asistencia_reglas.aviso_entrada_temprana_min IS
  'Desde cuántos minutos antes de su entrada se avisa en el Reporte que llegó temprano (24-sep-2026). Solo aviso: no cuenta ni frena. 0 = sin aviso.';

-- ── 2 · Entrada autorizada por día ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asistencia_entradas_autorizadas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Quién. El código del reloj, la misma llave que usa todo el módulo.
  empleado_codigo   text NOT NULL CHECK (btrim(empleado_codigo) <> ''),

  -- El día-calendario de Panamá (UTC−5 fijo) al que aplica.
  fecha             date NOT NULL,

  -- Desde qué hora entraba ese día. La extra se mide desde aquí (o desde la
  -- marca, si marcó después) hasta la hora de entrada de su horario.
  hora              time NOT NULL,

  -- 🔴 OBLIGATORIO, y el CHECK lo exige de verdad: `NOT NULL` deja pasar la
  -- cadena vacía. Sin razón escrita, en tres meses nadie sabe por qué ese día
  -- se pagaron cuatro horas más.
  motivo            text NOT NULL CHECK (btrim(motivo) <> ''),

  -- LA FIRMA: quién lo autorizó.
  creada_por        text NOT NULL CHECK (btrim(creada_por) <> ''),
  creada_en         timestamptz NOT NULL DEFAULT now(),

  -- Deshacer = anular. La fila queda con su firma; la extra vuelve a cero.
  anulada_en        timestamptz,
  anulada_por       text,

  CONSTRAINT asistencia_entradas_autorizadas_anulacion_completa CHECK (
    (anulada_en IS NULL AND anulada_por IS NULL)
    OR (anulada_en IS NOT NULL AND btrim(coalesce(anulada_por, '')) <> '')
  )
);

-- 🔑 UNA sola entrada autorizada VIVA por persona y día. Cambiarla es anular
-- la anterior y escribir la nueva (las dos filas quedan).
CREATE UNIQUE INDEX IF NOT EXISTS asistencia_entradas_autorizadas_dia_uq
  ON asistencia_entradas_autorizadas (empleado_codigo, fecha)
  WHERE anulada_en IS NULL;

-- La lectura típica: «las de este rango de fechas» (reporte y planilla).
CREATE INDEX IF NOT EXISTS asistencia_entradas_autorizadas_fecha_idx
  ON asistencia_entradas_autorizadas (fecha, empleado_codigo);

-- RLS encendida SIN políticas: todo pasa por el servidor con service_role,
-- igual que el resto del módulo.
ALTER TABLE asistencia_entradas_autorizadas ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE asistencia_entradas_autorizadas IS
  'Entrada autorizada por día (24-sep-2026): «hoy entraba a las HH:MM». Ese día la hora extra de la entrada se mide desde esa hora (o desde la marca, si marcó después) hasta la entrada del horario, y se aprueba como cualquier extra. No toca ninguna marcación. Se anula, no se borra.';
COMMENT ON COLUMN asistencia_entradas_autorizadas.hora IS
  'Desde qué hora entraba ese día. Solo vale si es ANTERIOR a la entrada de su horario; si no, no genera extra.';
COMMENT ON COLUMN asistencia_entradas_autorizadas.anulada_en IS
  'Deshacer deja rastro: la fila queda y la extra de entrada de ese día vuelve a cero.';
