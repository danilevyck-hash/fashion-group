-- ═════════════════════════════════════════════════════════════════════════════
-- EL DÍA LIBRE DE LA EMPRESA — la deuda de 8 horas y lo que ya se pagó
-- (17-sep-2026)
-- ═════════════════════════════════════════════════════════════════════════════
-- Daniel, textual: *«en las fiestas judías hay días libres, dentro de las
-- jornadas ordinarias, que son libres para el colaborador, pero se pagan con el
-- tiempo de horas extra»* · *«se le paga ese día pero deben las horas laborales
-- (8 horas para todos)»* · *«queda debiendo para la próxima quincena hasta
-- cancelar la deuda de horas»* · *«arrastra para siempre hasta que haga horas
-- extra»*.
--
-- 🔑 NO ES UNA IDEA NUEVA: la contadora lo lleva a mano en su Excel desde mayo
-- («DESC. POR FIESTA JUDÍA (22 DE MAYO) 18.50 … HORAS PENDIENTES A DESCONTAR
-- 12.8375»). Estas dos tablas son ese cuaderno, adentro del sistema.
--
-- 🔴 EN DÓLARES, NO EN HORAS. Daniel: *«debe de ser el dólares pienso, porque
-- no todas las horas valen igual»*. Una hora extra diurna vale 1,25 × rata y
-- una de domingo 1,50 × rata: una deuda medida en horas se cancelaría con
-- distinta cantidad de horas según cuándo se trabajen.
--
-- 🔴 EL MONTO SE CONGELA AL CARGARSE. `monto = 8 × rata` de esa persona el día
-- que se carga el día libre. Recalcularlo después haría que un aumento de
-- sueldo le subiera —retroactivamente— una deuda que ya estaba andando.
--
-- 🔴 NUNCA SALE DEL SUELDO Y NO SE DESCUENTA DE LA LIQUIDACIÓN (Daniel dijo
-- «no», explícito): el cobro está capeado a las horas extra de la quincena, no
-- al neto. Por eso NO hay CHECK que obligue a saldarla ni fecha de vencimiento.
--
-- 🔴 SOFT DELETE FIRMADO, NUNCA DELETE — el mismo patrón que
-- `guias_destino_lista` y `comision_exclusion`: un día libre cargado por error
-- se quita con firma y la fila se queda como historial.
--
-- ⚠️ ADITIVA Y TOLERADA. Sin correr esto, TODO el módulo se comporta
-- exactamente como el día anterior: el motivo «Día libre de la empresa» se
-- puede elegir, el día se paga completo, no nace ninguna deuda y no se le cobra
-- nada a nadie. La pantalla lo dice (`avisoMigracionDiaLibre`).
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── 1) LA DEUDA — un día libre de una persona ───────────────────────────────
CREATE TABLE IF NOT EXISTS asistencia_dia_libre_deuda (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- El código del reloj. La misma llave que usa todo el módulo.
  empleado_codigo text NOT NULL,
  -- La empresa que dio el día libre. Sirve para el cuadro y para poder
  -- deshacer una carga completa; NO decide nada del cálculo.
  empresa_key     text,
  -- El día que la empresa cerró.
  fecha           date NOT NULL,
  -- 🔴 8 × rata por hora, CONGELADO. Ver arriba.
  monto           numeric(12,2) NOT NULL,
  -- Con qué rata se calculó, para poder auditar el monto sin rehacer la cuenta.
  rata_hora       numeric(12,4),
  -- Las horas que se debieron por ese día. Hoy siempre 8 (Daniel: «8 horas para
  -- todos»); viaja para que un día distinto se pueda leer sin adivinarlo.
  horas           numeric(6,2) NOT NULL DEFAULT 8,
  nota            text,
  creado_por      text NOT NULL,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  -- Soft delete firmado. NUNCA un DELETE.
  deleted         boolean NOT NULL DEFAULT false,
  deleted_por     text,
  deleted_en      timestamptz,
  CONSTRAINT asistencia_dia_libre_deuda_monto_positivo CHECK (monto > 0),
  CONSTRAINT asistencia_dia_libre_deuda_baja_firmada
    CHECK (NOT deleted OR (deleted_por IS NOT NULL AND deleted_en IS NOT NULL))
);

-- Un día libre por persona y por día: cargarlo dos veces le cobraría 16 horas.
-- Único solo entre las VIVAS, para que uno quitado se pueda volver a cargar.
CREATE UNIQUE INDEX IF NOT EXISTS asistencia_dia_libre_deuda_una_por_dia
  ON asistencia_dia_libre_deuda (empleado_codigo, fecha)
  WHERE NOT deleted;

CREATE INDEX IF NOT EXISTS asistencia_dia_libre_deuda_por_persona
  ON asistencia_dia_libre_deuda (empleado_codigo) WHERE NOT deleted;

-- ─── 2) EL PAGO — lo que una quincena ya le descontó a la deuda ──────────────
CREATE TABLE IF NOT EXISTS asistencia_dia_libre_pago (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empleado_codigo text NOT NULL,
  -- La clave de la quincena que lo pagó: «2026-09-1».
  quincena        text NOT NULL,
  -- Qué cuadro cerrado lo escribió. Es lo que permite revertirlo al reabrir.
  planilla_id     bigint,
  -- Lo que las horas extra de esa quincena pagaron. Siempre > 0: una quincena
  -- que no cobró nada no deja fila.
  monto           numeric(12,2) NOT NULL,
  creado_por      text NOT NULL,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  deleted         boolean NOT NULL DEFAULT false,
  deleted_por     text,
  deleted_en      timestamptz,
  CONSTRAINT asistencia_dia_libre_pago_monto_positivo CHECK (monto > 0),
  CONSTRAINT asistencia_dia_libre_pago_baja_firmada
    CHECK (NOT deleted OR (deleted_por IS NOT NULL AND deleted_en IS NOT NULL))
);

-- 🔴 CERRAR DOS VECES NO COBRA DOS VECES. Es el mismo candado que ya protege el
-- pago del préstamo en el cierre: un índice único, no una comprobación en el
-- código. Reabrir marca `deleted` y libera la llave.
CREATE UNIQUE INDEX IF NOT EXISTS asistencia_dia_libre_pago_una_por_quincena
  ON asistencia_dia_libre_pago (empleado_codigo, quincena)
  WHERE NOT deleted;

CREATE INDEX IF NOT EXISTS asistencia_dia_libre_pago_por_persona
  ON asistencia_dia_libre_pago (empleado_codigo) WHERE NOT deleted;

-- ─── 3) RLS: solo service_role ───────────────────────────────────────────────
-- La app entra por el cliente del servidor y la ruta exige rol (admin y
-- contabilidad). Mismo trato que `guias_destino_lista` y `comision_exclusion`.
ALTER TABLE asistencia_dia_libre_deuda ENABLE ROW LEVEL SECURITY;
ALTER TABLE asistencia_dia_libre_pago  ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE asistencia_dia_libre_deuda IS
  'Días libres que dio la empresa: cada fila deja debiendo 8 horas en DÓLARES '
  '(monto congelado al cargarse). Se paga SOLO con horas extra, arrastra entre '
  'quincenas, nunca sale del sueldo y no se descuenta de la liquidación.';
COMMENT ON TABLE asistencia_dia_libre_pago IS
  'Lo que las horas extra de cada quincena le pagaron a la deuda de días libres. '
  'Lo escribe el cierre; reabrir lo revierte con soft delete.';
