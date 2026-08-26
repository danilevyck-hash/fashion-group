-- ─────────────────────────────────────────────────────────────────────────────
-- ASISTENCIA — EL SALDO DE VACACIONES ADMITE MEDIOS DIAS
--
-- ── 🔴 POR QUE AHORA Y NO DESPUES ───────────────────────────────────────────
--
-- Porque hoy la columna esta VACIA: la migracion 20260826040000 corrio limpia
-- sobre 38 fichas y NINGUNA tiene saldo cargado. Cambiar el tipo hoy no toca un
-- solo dato. Si se espera a que contabilidad cargue las 36 y recien ahi aparece
-- un 12,5, la misma migracion pasa a ser sobre datos vivos de una planilla — un
-- riesgo que no hace falta correr por algo que hoy sale gratis.
--
-- Y que haya medios dias es MAS probable que lo contrario: la contadora lleva
-- la planilla a mano en Excel.
--
-- ── 🔴 MEDIOS SI, CUARTOS NO ────────────────────────────────────────────────
--
-- `numeric(4,1)` deja un decimal, o sea que .25 no entra ni por el tipo. Pero
-- .1, .3, .7 si entrarian, y un CHECK que solo admite multiplos de 0,5 es lo
-- que atrapa el dedo pesado: un cuarto de dia de vacaciones no existe en la
-- practica, asi que un 12,3 no es un dato, es un error de tipeo.
--
-- ── ⚠️ LO QUE NO CAMBIA: LO GANADO SIGUE DANDO ENTEROS ──────────────────────
--
-- El prorrateo del periodo en curso se sigue TRUNCANDO a dia entero (ver
-- `src/lib/asistencia/saldo-vacaciones.ts`). Es una regla de plata, ya medida,
-- y no se toca: mostrar medio dia de mas es habilitar a alguien a irse medio
-- dia que todavia no gano. El medio dia entra SOLO por el arranque que escribe
-- contabilidad, y de ahi se arrastra a la resta.
--
-- Aditiva sobre una columna vacia e idempotente: se puede correr dos veces.
--
-- ⚠️ La app FUNCIONA SIN ESTA MIGRACION: con la columna en `integer` un 12,5
-- lo rechaza la base y el guardado avisa; el validador de TypeScript ya lo
-- frena antes con un mensaje en español.
-- ─────────────────────────────────────────────────────────────────────────────

DO $do$
BEGIN
  -- Guardas por si el archivo se corre en una base donde la columna todavia no
  -- existe: sin esto el ADD CONSTRAINT de abajo reventaria.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'asistencia_personas'
      AND column_name = 'saldo_vacaciones_dias'
  ) THEN
    RAISE NOTICE 'saldo_vacaciones_dias no existe todavia: corre antes 20260826040000';
    RETURN;
  END IF;

  -- ── EL TIPO ───────────────────────────────────────────────────────────────
  -- Solo se toca si todavia es `integer`. Correrlo dos veces no hace nada.
  --
  -- 🔑 numeric(4,1): de -999,9 a 999,9. El rango util es el mismo que ya
  -- cuidaba el CHECK de -999 a 999, asi que el tope de cordura no cambia.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'asistencia_personas'
      AND column_name = 'saldo_vacaciones_dias'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE asistencia_personas
      ALTER COLUMN saldo_vacaciones_dias TYPE numeric(4,1)
      USING saldo_vacaciones_dias::numeric(4,1);
  END IF;

  -- ── EL CANDADO DEL MEDIO DIA ──────────────────────────────────────────────
  -- Multiplos de 0,5 y nada mas. `x * 2 = trunc(x * 2)` es cierto para 12 y
  -- para 12,5, y falso para 12,3 — sin depender de ninguna funcion de redondeo.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'asistencia_personas_saldo_vac_medio'
  ) THEN
    ALTER TABLE asistencia_personas
      ADD CONSTRAINT asistencia_personas_saldo_vac_medio
      CHECK (saldo_vacaciones_dias IS NULL
             OR saldo_vacaciones_dias * 2 = trunc(saldo_vacaciones_dias * 2));
  END IF;
END
$do$;

COMMENT ON COLUMN asistencia_personas.saldo_vacaciones_dias IS
  'Dias de vacaciones que le quedan A LA FECHA DE saldo_vacaciones_corte. Lo carga contabilidad de sus registros: es el SALDO, no los dias tomados. Admite MEDIOS dias (12,5) y nada mas fino: un cuarto de dia no existe en la practica y el CHECK lo rechaza. NULL = todavia no se cargo, y entonces la pantalla dice "Falta el saldo" y NO muestra ningun numero. Puede ser negativo: adelantar vacaciones existe.';

-- ── COMPROBACION (no escribe nada) ──────────────────────────────────────────
-- Tiene que devolver: tipo = numeric, escala = 1, con_saldo = 0.
SELECT
  (SELECT data_type FROM information_schema.columns
    WHERE table_name = 'asistencia_personas'
      AND column_name = 'saldo_vacaciones_dias')                      AS tipo,
  (SELECT numeric_scale FROM information_schema.columns
    WHERE table_name = 'asistencia_personas'
      AND column_name = 'saldo_vacaciones_dias')                      AS escala,
  count(*)                                                            AS fichas,
  count(*) FILTER (WHERE saldo_vacaciones_dias IS NOT NULL)           AS con_saldo
FROM asistencia_personas;

-- ─────────────────────────────────────────────────────────────────────────────
-- ⛔ LO QUE ESTA MIGRACION NO HACE, A PROPOSITO
--
--   1. NO le pone un saldo a NADIE. Las fichas siguen todas en NULL.
--   2. NO toca `saldo_vacaciones_corte` ni los dos CHECK que ya existian (que
--      los dos campos vayan juntos, y el tope de -999 a 999). Los tres candados
--      viejos siguen valiendo; este agrega el cuarto.
--   3. NO cambia el prorrateo de lo GANADO, que se sigue truncando a dia entero.
--   4. NO mueve un centavo de ninguna planilla.
-- ─────────────────────────────────────────────────────────────────────────────
