-- ─────────────────────────────────────────────────────────────────────────────
-- ASISTENCIA — UNA PERSONA, DOS EMPRESAS: el reparto de un sueldo
--
-- La contadora, textual (27-ago-2026): *"El salario de Julio es 1000 y estan
-- divididos en dos empresas. 800 en Vistana, sobre los cuales se aplican seguro
-- social y educativo. Los otros 200 estan en Fashion Wear. Aqui es servicios
-- profesionales y es aqui donde se le pagan las horas extras. En ambas empresas
-- su rata por hora es 5.77"*.
--
-- ── 🔴 POR QUE NO SE TOCA LA LLAVE DE `asistencia_personas` ──────────────────
--
-- Esa tabla tiene PRIMARY KEY (empleado_codigo) y 37 fichas, y el modulo entero
-- —el directorio, las justificaciones, las vacaciones, las correcciones, las
-- aprobaciones— asume UNA ficha por codigo. Partirla en dos filas para una
-- persona romperia esa suposicion en veinte lugares a la vez, y diecinueve de
-- ellos no tienen nada que ver con el sueldo. El reparto CUELGA de la ficha: la
-- ficha sigue siendo una, y lo que se parte es el PAGO.
--
-- ── 🔴 LA RATA SALE DEL SUELDO COMPLETO ──────────────────────────────────────
--
-- `1000 x 12 / 52 / 40 = 5,769...` -> $5,77, la misma en las dos empresas. Por
-- eso `asistencia_personas.salario_mensual` SIGUE SIENDO EL TOTAL ($1.000) y
-- esta tabla guarda lo que paga CADA empresa. Si la rata de Fashion Wear saliera
-- de sus $200, su hora valdria $1,15 y sus horas extra —que se pagan justamente
-- ahi— se pagarian CINCO VECES MENOS.
--
-- 🔴 Y POR ESO LOS MONTOS TIENEN QUE SUMAR EL SALARIO DE LA FICHA. Esa regla NO
-- se puede escribir como un CHECK (mira varias filas y otra tabla): la aplica
-- `validarReparto` en `src/lib/asistencia/reparto.ts`, y un reparto que no suma
-- se RECHAZA ENTERO -> la persona cobra en una sola planilla, como antes, y la
-- pantalla lo dice en ambar con el motivo.
--
-- ── ADITIVA, y la app FUNCIONA SIN ELLA ──────────────────────────────────────
--
-- Patron `cols-opcionales`, el mismo de `20260826080000_asistencia_no_marca_reloj`:
-- sin esta tabla `leerRepartos()` devuelve cero filas y `faltaTabla: true`, NADIE
-- reparte su sueldo, la planilla da EXACTAMENTE lo de ayer hasta el centavo, y
-- las dos pantallas dicen en AMBAR que archivo hay que correr.
--
-- ⚠️ La degradacion solo ocurre cuando el error NOMBRA la tabla. Tragarse
-- cualquier error convertiria un permiso, un timeout o un RLS en "nadie reparte
-- su sueldo" — la peor forma de fallar: la pantalla se ve normal y Julio vuelve
-- a pagar el 11 % de seguros sobre sus horas extra sin que nadie se entere.
--
-- NO toca `asistencia_personas`, ni salarios, ni `asistencia_planilla_manual`,
-- ni una quincena vieja. Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS asistencia_reparto_empresa (
  empleado_codigo text   NOT NULL
    REFERENCES asistencia_personas (empleado_codigo) ON DELETE CASCADE,
  empresa         text   NOT NULL,
  -- Lo que ESTA empresa le paga al mes. NO es de donde sale la rata.
  salario_mensual numeric(10,2) NOT NULL CHECK (salario_mensual > 0),
  -- ¿Esta parte descuenta seguro social y educativo? Los DOS juntos, igual que
  -- `asistencia_personas.paga_seguros`. El interruptor de la FICHA manda: con
  -- los seguros apagados ahi, esta columna no puede encenderlos.
  paga_seguros      boolean NOT NULL DEFAULT true,
  -- 🔴 Aca se pagan las horas extra. EXACTAMENTE UNA parte por persona (lo
  -- garantiza el indice de abajo). Ninguna las perderia en silencio; dos las
  -- pagarian dos veces.
  paga_horas_extra  boolean NOT NULL DEFAULT false,
  -- La PRIMERA (orden mas bajo) es la parte PRINCIPAL: ahi cae todo el resto del
  -- reloj (domingos, feriados, tardanzas, ausencias, vacaciones ya pagadas) y
  -- los montos escritos a mano. Empate -> desempata la empresa, para que dos
  -- lecturas no den cuadros distintos.
  orden           smallint NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empleado_codigo, empresa)
);

-- 🔴 EXACTAMENTE UNA parte con las horas extra, por persona. Es la unica de las
-- cinco reglas de `validarReparto` que la base puede sostener sola, y sostenerla
-- aca vale: es la que decide donde cae la plata de las extras.
CREATE UNIQUE INDEX IF NOT EXISTS asistencia_reparto_una_extra
  ON asistencia_reparto_empresa (empleado_codigo)
  WHERE paga_horas_extra;

-- La empresa tiene que ser una de las tres del reloj. La misma lista que
-- `EMPRESAS_ASISTENCIA` en `src/lib/asistencia/config.ts`; el codigo la vuelve a
-- exigir en `validarReparto` (la base es el ultimo freno, no el unico).
DO $rep$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'asistencia_reparto_empresa_valida'
  ) THEN
    ALTER TABLE asistencia_reparto_empresa
      ADD CONSTRAINT asistencia_reparto_empresa_valida
      CHECK (empresa IN ('confecciones_boston', 'vistana', 'fashion_wear'));
  END IF;
END
$rep$;

ALTER TABLE asistencia_reparto_empresa ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE asistencia_reparto_empresa IS
  'El sueldo de una persona repartido entre dos empresas. La ficha sigue siendo UNA (asistencia_personas.salario_mensual = el TOTAL, y de ahi sale la rata por hora); esta tabla dice cuanto paga cada empresa. Los montos TIENEN que sumar el salario de la ficha: lo exige validarReparto (src/lib/asistencia/reparto.ts), no un CHECK, porque la regla mira varias filas y otra tabla. Un reparto que no cuadra se rechaza ENTERO y la persona cobra en una sola planilla, como antes.';

COMMENT ON COLUMN asistencia_reparto_empresa.salario_mensual IS
  'Lo que ESTA empresa le paga al mes. NO es de donde sale la rata por hora: la rata sale SIEMPRE del salario completo de la ficha, porque es lo que vale la hora de esa persona (contadora, textual: "en ambas empresas su rata por hora es 5.77").';

COMMENT ON COLUMN asistencia_reparto_empresa.paga_horas_extra IS
  'true = las horas extra de esa persona se pagan en ESTA empresa. Exactamente una parte por persona (indice unico parcial asistencia_reparto_una_extra). Todo el resto del reloj —domingos, feriados, tardanzas, ausencias, vacaciones ya pagadas— y los montos escritos a mano van a la parte PRINCIPAL (la de orden mas bajo), nunca a las dos.';

-- ─────────────────────────────────────────────────────────────────────────────
-- LA REGLA DE LA CONTADORA PARA JULIO GARAY (codigo 11)
--
-- Se siembra en la MISMA migracion a proposito: sin filas, la tabla vacia se
-- comporta igual que no tenerla, y correr el archivo se leeria como "no paso
-- nada". Con estas dos filas, la planilla siguiente ya sale bien.
--
-- ⚠️ NO se toca su ficha: `asistencia_personas` sigue con empresa = 'vistana',
-- salario_mensual = 1000, servicio_profesional = false y paga_seguros = true.
-- Ese $1.000 es de donde sale su rata de $5,77 y por eso NO se baja a $800.
--
-- 🔴 `paga_seguros = false` en Fashion Wear es lo que la contadora describe como
-- "servicios profesionales", y es lo UNICO que significa: esa parte SI se paga
-- (es plata que Julio cobra), lo que no lleva es el 9,75 % + 1,25 %. Marcar la
-- ficha entera como `servicio_profesional` seria otra cosa: dejaria de pagarle.
--
-- Impacto medido contra produccion, quincena del 1 al 15 de agosto de 2026, con
-- las horas extra aprobadas:
--   ANTES  una linea en Vistana: bruto $596,97 - seguros $65,66 = neto $521,31
--   AHORA  Vistana      $400,00 - $44,00 = $356,00
--          Fashion Wear $100,00 + $96,97 de extras, sin seguros = $196,97
--   El bruto total NO se mueve ($596,97): lo unico que cambia es que los $196,97
--   de Fashion Wear dejan de pagar el 11 % de seguros.
--
-- Idempotente: correrlo dos veces deja lo mismo.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO asistencia_reparto_empresa
  (empleado_codigo, empresa, salario_mensual, paga_seguros, paga_horas_extra, orden)
SELECT '11', 'vistana', 800.00, true, false, 0
WHERE EXISTS (SELECT 1 FROM asistencia_personas WHERE empleado_codigo = '11')
ON CONFLICT (empleado_codigo, empresa) DO UPDATE
  SET salario_mensual  = EXCLUDED.salario_mensual,
      paga_seguros     = EXCLUDED.paga_seguros,
      paga_horas_extra = EXCLUDED.paga_horas_extra,
      orden            = EXCLUDED.orden,
      updated_at       = now();

INSERT INTO asistencia_reparto_empresa
  (empleado_codigo, empresa, salario_mensual, paga_seguros, paga_horas_extra, orden)
SELECT '11', 'fashion_wear', 200.00, false, true, 1
WHERE EXISTS (SELECT 1 FROM asistencia_personas WHERE empleado_codigo = '11')
ON CONFLICT (empleado_codigo, empresa) DO UPDATE
  SET salario_mensual  = EXCLUDED.salario_mensual,
      paga_seguros     = EXCLUDED.paga_seguros,
      paga_horas_extra = EXCLUDED.paga_horas_extra,
      orden            = EXCLUDED.orden,
      updated_at       = now();

-- ─────────────────────────────────────────────────────────────────────────────
-- ⛔ LO QUE ESTA MIGRACION NO HACE, A PROPOSITO
--
--   1. NO le cambia el salario a nadie. El $1.000 de Julio SE QUEDA en su ficha:
--      es de donde sale su rata de $5,77, la misma en las dos empresas.
--   2. NO marca a nadie como `servicio_profesional`. Esa bandera deja a la
--      persona SIN pago; lo de Fashion Wear es un pago sin seguros.
--   3. NO reparte a nadie mas. Es UNA persona y una regla de la contadora.
--   4. NO toca `asistencia_planilla_manual`: los montos escritos a mano de una
--      quincena vieja siguen ahi y se siguen aplicando a la parte PRINCIPAL.
--   5. NO borra ni reescribe una quincena ya cerrada. La planilla se recalcula
--      al pedirla, asi que reimprimir julio con esto corrido lo muestra con el
--      reparto — eso es lo que la contadora quiere, y es su decision.
-- ─────────────────────────────────────────────────────────────────────────────
