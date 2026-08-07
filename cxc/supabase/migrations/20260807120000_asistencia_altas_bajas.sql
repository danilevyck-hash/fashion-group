-- ─────────────────────────────────────────────────────────────────────────────
-- ASISTENCIA — ALTAS Y BAJAS DE PERSONAL, CON FECHA Y SIN BORRAR NADA
--
-- ── 🩸 EL AGUJERO QUE TAPA ───────────────────────────────────────────────────
--
-- Las ALTAS ya funcionaban solas: alguien nuevo empieza a marcar, el código
-- aparece en Configuración como "falta configurar", le ponen los datos y entra
-- en la planilla. Así entraron los códigos 48 a 53.
--
-- Las BAJAS no existían. Quien se iba quedaba en la lista para siempre y seguía
-- saliendo en cada planilla nueva con cero marcaciones. Caso vivo medido el
-- 6-ago-2026: YERIBETH GONZALEZ (código 47) tiene ficha y CERO marcaciones en
-- las 3.287 cargadas.
--
-- ── 🩸 POR QUÉ UNA FECHA Y NO UN BOTÓN DE BORRAR ─────────────────────────────
--
-- Borrar la ficha se lleva el nombre, el salario y la empresa — o sea, TODO lo
-- que hace falta para volver a armar una quincena vieja. Una planilla cerrada
-- tiene que poder reimprimirse igual dentro de dos años; sin la ficha, la de
-- julio en que esa persona SÍ trabajó saldría con "sin ficha en Configuración"
-- y sin un dólar calculado. La baja es un DATO histórico, no un borrado.
--
-- ── 🩸 POR QUÉ UNA FECHA Y NO EL BOOLEANO `activo` QUE YA ESTABA ─────────────
--
-- `activo` (de la migración 20260806160000) no lo lee ni una línea de código, y
-- por una razón de fondo: un booleano NO TIENE MEMORIA. Con `activo = false` la
-- persona desaparecería de TODAS las quincenas, incluidas aquellas en las que
-- trabajó y se le debe la plata. Con una fecha, el mismo dato responde las dos
-- preguntas: sale de las quincenas POSTERIORES a su salida y sigue entera en
-- las anteriores y en la suya. Se deja la columna donde está —quitarla es un
-- cambio destructivo que no compra nada— pero no manda sobre nada.
--
-- ── LA REGLA, TAL CUAL LA IMPLEMENTA `lib/asistencia/vigencia.ts` ────────────
--
--   Una ficha entra a la quincena [desde, hasta] salvo que:
--     · su fecha_salida  sea ANTERIOR a `desde`   → ya se había ido, y
--     · su fecha_ingreso sea POSTERIOR a `hasta`  → todavía no había entrado.
--   Vacías = "trabaja acá desde siempre y sigue".
--
-- ⚠️ `fecha_ingreso` SE GUARDA Y NO PRORRATEA NADA. Quien entra el día 20 cobra
-- el quincenal completo del cálculo hasta que alguien defina la regla de
-- proporción — eso NO está definido y hay que preguntárselo a la contable.
-- Inventar acá un "medio salario" sería inventar plata.
--
-- ── 🩸 POR QUÉ SE GUARDA EL MOTIVO SI EL CÁLCULO LO IGNORA ───────────────────
--
-- Daniel, textual (7-ago-2026): *"normalmente nadie desaparece, o renuncia o lo
-- despedimos"*. Para la quincena los tres motivos son IDÉNTICOS —lo único que
-- decide quién entra es la FECHA— y el cálculo no se ramifica por acá ni un `if`.
--
-- Se guarda por lo que viene después: LA LIQUIDACIÓN. Ahí la diferencia es de
-- plata contante — un despido injustificado paga indemnización y una renuncia
-- no. Si el motivo no se guarda HOY, el día que se construya la liquidación
-- habría que reconstruirlo de memoria, y nadie se acuerda por qué salió alguien
-- hace ocho meses. Es un campo que se llena hoy para el cálculo de mañana:
-- que a nadie se le ocurra borrarlo por "no lo usa nadie".
--
-- Aditiva e idempotente: no toca una sola fila existente.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE asistencia_personas
  ADD COLUMN IF NOT EXISTS fecha_ingreso date,
  ADD COLUMN IF NOT EXISTS fecha_salida  date,
  -- 🔑 Los tres motivos que existen en el negocio. Es una lista cerrada porque
  -- la liquidación va a preguntar EXACTAMENTE esto, y un campo de texto libre
  -- devuelve "renuncio", "RENUNCIA voluntaria" y "se fue" para la misma cosa.
  ADD COLUMN IF NOT EXISTS motivo_salida text
    CHECK (motivo_salida IN ('renuncia', 'despido', 'otro'));

-- Vacío = trabaja acá. Es lo que hace que la migración se pueda correr sin
-- tocar las 32 fichas que ya existen: todas quedan activas, como estaban.
COMMENT ON COLUMN asistencia_personas.fecha_ingreso IS
  'Primer dia de trabajo. Vacio = desde siempre. SE GUARDA PERO NO PRORRATEA EL SALARIO: la regla de proporcion no esta definida.';
COMMENT ON COLUMN asistencia_personas.fecha_salida IS
  'Ultimo dia de trabajo. Vacio = sigue trabajando. La persona sale de las quincenas POSTERIORES a esta fecha y sigue entera en la suya y en las anteriores. Reactivar = volver a dejarla vacia.';
COMMENT ON COLUMN asistencia_personas.motivo_salida IS
  'renuncia | despido | otro. EL CALCULO DE LA QUINCENA LO IGNORA A PROPOSITO: para la planilla solo cuenta la fecha. Se guarda para la LIQUIDACION, donde un despido injustificado paga indemnizacion y una renuncia no. No es un campo muerto: es un dato que despues no se puede reconstruir de memoria.';
COMMENT ON COLUMN asistencia_personas.activo IS
  'NO LA LEE NADIE. La baja se maneja con fecha_salida, que si tiene memoria: un booleano borraria a la persona tambien de las quincenas en las que trabajo.';

-- Una salida ANTES del ingreso no es una persona: es una fecha tecleada al
-- revés, y produciría una ficha que no entra en ninguna quincena de la historia.
DO $ddl$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'asistencia_personas_salida_no_antes_del_ingreso'
  ) THEN
    ALTER TABLE asistencia_personas
      ADD CONSTRAINT asistencia_personas_salida_no_antes_del_ingreso
      CHECK (
        fecha_salida IS NULL
        OR fecha_ingreso IS NULL
        OR fecha_salida >= fecha_ingreso
      );
  END IF;

  -- La fecha y el motivo VIAJAN JUNTOS: una baja sin motivo es la mitad del dato
  -- que la liquidación va a necesitar, y un motivo sin fecha es una persona que
  -- renunció... nunca. El CHECK obliga a que estén los dos o ninguno.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'asistencia_personas_baja_completa'
  ) THEN
    ALTER TABLE asistencia_personas
      ADD CONSTRAINT asistencia_personas_baja_completa
      CHECK ((fecha_salida IS NULL) = (motivo_salida IS NULL));
  END IF;
END
$ddl$;

-- Índice PARCIAL: las bajas son un puñado contra 32 fichas activas, y la única
-- consulta que las busca es "quiénes ya no trabajan acá".
CREATE INDEX IF NOT EXISTS asistencia_personas_fecha_salida_idx
  ON asistencia_personas (fecha_salida)
  WHERE fecha_salida IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- ⛔ LO QUE ESTA MIGRACIÓN NO HACE, A PROPÓSITO
--
--   1. NO da de baja a nadie. Ni siquiera al código 47, que tiene cero
--      marcaciones: cero marcaciones puede ser una renuncia, una incapacidad o
--      un mes de vacaciones. Lo decide una persona en la pantalla, no un UPDATE.
--   2. NO borra ni una ficha.
--   3. NO toca `asistencia_planilla_manual`: los montos escritos a mano de una
--      quincena vieja siguen ahí y se siguen leyendo igual.
-- ─────────────────────────────────────────────────────────────────────────────
