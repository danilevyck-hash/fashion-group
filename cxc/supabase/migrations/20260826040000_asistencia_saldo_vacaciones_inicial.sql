-- ─────────────────────────────────────────────────────────────────────────────
-- ASISTENCIA — EL SALDO DE VACACIONES ARRANCA DE UN NUMERO QUE ALGUIEN SABE
--
-- ── 🩸 EL AGUJERO QUE TAPA, MEDIDO ──────────────────────────────────────────
--
-- Desde el PR #626 la pestaña Vacaciones calcula el saldo asi:
--     dias ganados desde que entro − lo tomado − lo ya pagado.
-- Es aritmeticamente correcto y es INUTIL: las vacaciones solo existen en el
-- sistema desde el 25-ago-2026 (medido por la puerta de la app: UNA cargada),
-- pero los dias ganados se cuentan desde el ingreso, y hay fichas de 2019.
--
-- Resultado: ANGELA GARCIA figuraba con 245 dias disponibles. Cierto, y
-- peligroso: alguien puede pararse en esa pantalla y reclamar dias que ya se
-- tomo. Un numero que no se puede usar para decidir es peor que no mostrarlo.
--
-- ── 🔴 EL CAMPO ES EL SALDO A HOY, NO LOS DIAS TOMADOS HISTORICOS ───────────
--
-- Contabilidad TIENE el numero en sus registros —"a Angela le quedan 12 dias"—
-- y ese lo escribe sin hacer cuentas. Pedirle "cuantos dias tomo desde 2019"
-- seria pedirle que reconstruya siete años, y nadie lo haria: la pantalla se
-- quedaria vacia para siempre.
--
-- ── 🔴 POR QUE SON DOS COLUMNAS Y NO UNA ────────────────────────────────────
--
-- Un saldo sin fecha no significa nada. "Le quedan 12" ¿a que dia? De la fecha
-- depende QUE se resta despues: las vacaciones anteriores al corte YA ESTAN
-- ADENTRO de ese 12, y volver a restarlas seria cobrarle dos veces los mismos
-- dias. La fecha es la linea que separa "ya contado" de "por contar", y por eso
-- viaja pegada al numero: guardarla en otro lado —o deducirla del updated_at—
-- es la forma de que un dia digan cosas distintas.
--
-- El CHECK las obliga a ir juntas: las dos, o ninguna. Un saldo huerfano se
-- leeria como un saldo valido a una fecha que nadie sabe.
--
-- ── LA CUENTA, ENTERA ───────────────────────────────────────────────────────
--
--   saldo = saldo inicial
--         − vacaciones tomadas DESPUES del corte
--         − vacaciones ya pagadas DESPUES del corte
--         + lo ganado entre el corte y hoy
--
-- El ejemplo numerico vive en `src/lib/asistencia/saldo-vacaciones.ts`, en la
-- cabecera, para poder auditarlo sin leer la funcion.
--
-- Aditiva e idempotente: no toca una sola fila existente. Las 39 fichas quedan
-- con los dos campos en NULL, o sea "todavia no se cargo el saldo", y la
-- pantalla lo DICE en vez de mostrar un numero que engaña.
--
-- ⚠️ La app FUNCIONA SIN ESTA MIGRACION: `leerPersonas` es una escalera y relee
-- sin las columnas (nadie tiene saldo inicial, la pantalla dice "Falta el
-- saldo" y no se muestra ningun numero), y Configuracion avisa que falta correr
-- este archivo en vez de romperse.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE asistencia_personas
  -- Cuantos dias de vacaciones le quedan A LA FECHA DE CORTE. Lo escribe
  -- contabilidad de sus registros; no se deduce de nada que el sistema tenga.
  --
  -- 🔑 ENTERO Y CON SIGNO. Entero porque todo el modulo cuenta dias corridos
  -- enteros —el prorrateo del periodo en curso se trunca— y un decimal suelto
  -- arrastraria coma por toda la cadena. Con signo porque adelantar vacaciones
  -- existe: recortar a cero escondería justo el caso que hay que mirar.
  ADD COLUMN IF NOT EXISTS saldo_vacaciones_dias  integer,

  -- El dia al que ese numero es cierto. TODO lo anterior a esta fecha ya esta
  -- absorbido adentro del saldo y el motor no lo vuelve a contar.
  ADD COLUMN IF NOT EXISTS saldo_vacaciones_corte date;

-- Las dos, o ninguna. Ver la nota de arriba: un saldo sin fecha es un saldo a
-- un dia que nadie sabe, y una fecha sin saldo no dice nada.
--
-- 🔑 Se agrega en un bloque condicional porque `ADD CONSTRAINT` no tiene
-- `IF NOT EXISTS` en Postgres: sin esto, correr el archivo dos veces falla.
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'asistencia_personas_saldo_vac_junto'
  ) THEN
    ALTER TABLE asistencia_personas
      ADD CONSTRAINT asistencia_personas_saldo_vac_junto
      CHECK ((saldo_vacaciones_dias IS NULL) = (saldo_vacaciones_corte IS NULL));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'asistencia_personas_saldo_vac_rango'
  ) THEN
    -- Un tope de cordura. No es una regla de negocio: es el candado contra el
    -- dedo pesado. 999 dias son mas de 30 años de vacaciones sin tomar una.
    ALTER TABLE asistencia_personas
      ADD CONSTRAINT asistencia_personas_saldo_vac_rango
      CHECK (saldo_vacaciones_dias IS NULL
             OR (saldo_vacaciones_dias >= -999 AND saldo_vacaciones_dias <= 999));
  END IF;
END
$do$;

COMMENT ON COLUMN asistencia_personas.saldo_vacaciones_dias IS
  'Dias de vacaciones que le quedan A LA FECHA DE saldo_vacaciones_corte. Lo carga contabilidad de sus registros: es el SALDO, no los dias tomados. NULL = todavia no se cargo, y entonces la pantalla dice "Falta el saldo" y NO muestra ningun numero. Puede ser negativo: adelantar vacaciones existe.';
COMMENT ON COLUMN asistencia_personas.saldo_vacaciones_corte IS
  'El dia al que el saldo es cierto. Todo lo anterior ya esta absorbido adentro del numero y el motor NO lo vuelve a restar: solo cuentan las vacaciones que caen DESPUES de esta fecha, mas lo que se gana desde ella. Va siempre junto con saldo_vacaciones_dias (lo obliga el CHECK).';

-- ── COMPROBACION (no escribe nada) ──────────────────────────────────────────
-- Tiene que devolver: fichas = 39, con_saldo = 0, sin_saldo = 39.
SELECT
  count(*)                                              AS fichas,
  count(*) FILTER (WHERE saldo_vacaciones_dias IS NOT NULL) AS con_saldo,
  count(*) FILTER (WHERE saldo_vacaciones_dias IS NULL)     AS sin_saldo
FROM asistencia_personas;

-- ─────────────────────────────────────────────────────────────────────────────
-- ⛔ LO QUE ESTA MIGRACION NO HACE, A PROPOSITO
--
--   1. NO le pone un saldo a NADIE. Las 39 fichas quedan en NULL. Inventar un
--      saldo inicial es exactamente el problema que este archivo viene a
--      resolver: el numero lo sabe contabilidad, no el sistema.
--   2. NO toca `fecha_ingreso`. Sigue haciendo falta: el ciclo de 11 meses de
--      la ley esta anclado al ingreso, y de ahi sale lo que se gana desde el
--      corte. Sin ella tampoco hay saldo, y la pantalla lo dice aparte.
--   3. NO toca salarios, jornadas, seguros ni `servicio_profesional`. NO mueve
--      un centavo de ninguna planilla, vieja o nueva.
--   4. NO toca `asistencia_vacaciones`. Los rangos cargados siguen intactos,
--      incluida la vacacion de ELOYN MENDOZA (16-jul → 13-ago-2026).
-- ─────────────────────────────────────────────────────────────────────────────
