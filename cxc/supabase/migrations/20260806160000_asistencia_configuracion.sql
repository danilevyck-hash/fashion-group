-- ─────────────────────────────────────────────────────────────────────────────
-- ASISTENCIA — CONFIGURACIÓN: quién es cada código del reloj, y con qué números
-- se calcula la planilla.
--
-- ── 🩸 POR QUÉ `asistencia_personas` DESBLOQUEA LA PLANILLA ───────────────────
--
-- El reloj Hikvision manda CÓDIGOS NUMÉRICOS (1, 5, 6, 7… hasta 53), no nombres:
-- medido el 6-ago-2026 sobre las 3.287 marcaciones cargadas (julio + agosto,
-- 37 personas distintas), el campo `name` viene VACÍO en TODAS. El aparato no
-- sabe cómo se llama nadie ni cuánto gana.
--
-- Y hay algo peor que los nombres: **Confecciones Boston, Vistana y Fashion Wear
-- comparten el MISMO reloj** ("reloj cboston"). De un solo aparato tienen que
-- salir TRES planillas distintas, y lo único que las separa es a qué empresa
-- pertenece cada código. Sin esta tabla, los minutos de las tres empresas salen
-- sumados en un solo montón y no hay planilla que se pueda emitir.
-- (ACS/Multifashion usa otro reloj; por eso no está en el CHECK.)
--
-- ── 🩸 POR QUÉ `asistencia_reglas` ES UNA TABLA Y NO CONSTANTES ───────────────
--
-- Daniel, textual: *"todos los calculos deben de ser configurables en caso de
-- que algo cambie"*. Los porcentajes de seguro y los recargos los fija la ley y
-- cambian; con constantes en el código, corregir una planilla exige un deploy.
-- Los valores por defecto de acá son los que CONFIRMÓ LA CONTABLE.
--
-- ⚠️ Un solo renglón (`CHECK (id = 1)`). Dos renglones de reglas serían dos
-- verdades posibles para el mismo cálculo, que es exactamente el bug que este
-- proyecto ya pagó con las listas de empresas repetidas en tres archivos.
--
-- Aditiva e idempotente: no toca ninguna tabla existente.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Personas ─────────────────────────────────────────────────────────────────
-- La llave es el CÓDIGO del reloj (`employeeNoString`), igual que en
-- `asistencia_horarios`: es lo único estable. Va APARTE de `asistencia_horarios`
-- a propósito — ahí vive el HORARIO (a qué hora sale, cuánto almuerza) y acá la
-- FICHA DE PLANILLA (cuánto gana, de qué empresa es). Mezclarlas obligaría a que
-- confirmar una hora de salida tocara la fila del salario.
CREATE TABLE IF NOT EXISTS asistencia_personas (
  empleado_codigo   text PRIMARY KEY,

  -- El nombre lo escribe una persona: el reloj no lo manda (verificado, `name`
  -- vacío en las 3.287 marcaciones).
  nombre            text NOT NULL,

  -- Salario mensual en dólares. NULL = "todavía no lo sé", que es un estado
  -- real: se puede asignar la empresa antes de saber el sueldo.
  -- 🔑 El CHECK prohíbe el 0: la rata es salario ÷ divisor, y con 0 la planilla
  -- sale en cero sin avisar de nada.
  salario_mensual   numeric(12,2)
                    CHECK (salario_mensual IS NULL
                           OR (salario_mensual > 0 AND salario_mensual <= 100000)),

  -- Solo dos jornadas en el negocio, y cada una tiene SU divisor de rata
  -- (173.33 y 208). Una jornada de 44 daría una rata inventada.
  jornada_semanal   smallint NOT NULL DEFAULT 48
                    CHECK (jornada_semanal IN (40, 48)),

  -- Lo que separa las tres planillas del mismo reloj.
  empresa           text NOT NULL
                    CHECK (empresa IN ('confecciones_boston', 'vistana', 'fashion_wear')),

  activo            boolean NOT NULL DEFAULT true,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS asistencia_personas_empresa_idx
  ON asistencia_personas (empresa);

-- RLS encendida SIN políticas: nadie entra con la llave pública. Todo pasa por
-- el servidor con service_role, igual que el resto del sistema. Acá importa más
-- que en otras tablas: esto tiene SALARIOS.
ALTER TABLE asistencia_personas ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE asistencia_personas IS
  'Quién es cada código del reloj: nombre, salario, jornada y EMPRESA. La empresa es lo que separa las tres planillas (Boston, Vistana y Fashion Wear comparten el mismo reloj).';

-- ── Reglas del cálculo ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asistencia_reglas (
  -- Un solo renglón. Dos serían dos verdades posibles para el mismo cálculo.
  id                        smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),

  -- Minutos de gracia a la entrada. 🩸 El código traía 5; la contable confirmó
  -- 10 (6-ago-2026). Con 5, quien entra 8:06 acumula 6 minutos de tardanza.
  tolerancia_tardanza_min   smallint NOT NULL DEFAULT 10
                            CHECK (tolerancia_tardanza_min BETWEEN 0 AND 60),

  -- Menos de esto no cuenta como hora extra (evita pagarle a quien se quedó
  -- conversando cinco minutos).
  extra_minimo_min          smallint NOT NULL DEFAULT 15
                            CHECK (extra_minimo_min BETWEEN 0 AND 240),

  -- Almuerzo de quien no tenga uno propio en `asistencia_horarios`.
  almuerzo_default_min      smallint NOT NULL DEFAULT 30
                            CHECK (almuerzo_default_min BETWEEN 0 AND 240),

  -- 🔑 Los recargos son FACTORES, no porcentajes: 1.25 = la hora y cuarto.
  -- El CHECK exige >= 1 porque debajo de 1 la hora extra se pagaría MÁS BARATA
  -- que la normal — eso no es una política, es el 1.25 tecleado como 0.25 o 25.
  recargo_extra_diurno      numeric(6,4) NOT NULL DEFAULT 1.25
                            CHECK (recargo_extra_diurno BETWEEN 1 AND 5),
  recargo_extra_nocturno    numeric(6,4) NOT NULL DEFAULT 1.50
                            CHECK (recargo_extra_nocturno BETWEEN 1 AND 5),
  -- LA FRONTERA DE LA TARDE, Y ES UNA SOLA COLUMNA A PROPÓSITO. Contable,
  -- textual: "1.25 es hasta las 6 de la tarde, de las 6:01 de la tarde en
  -- adelante y el excedente, 3 horas extras al día". Esta misma hora decide:
  --   · hasta las 18:00 → 1.25
  --   · desde las 18:01 → 1.50, y eso YA cuenta como jornada nocturna
  --   · desde las 18:01 Y pasado el excedente de horas → 2.625
  -- 🩸 NO se agrega una segunda columna "jornada_nocturna_desde": dos columnas
  -- para la misma frontera es la forma de que se separen —alguien mueve una y
  -- se olvida de la otra— y el 2.625 pasaría a aplicarse a una hora distinta del
  -- 1.50 sin que nadie lo note hasta el día de pago.
  hora_corte_nocturno       time NOT NULL DEFAULT '18:00',
  recargo_domingo_feriado   numeric(6,4) NOT NULL DEFAULT 1.50
                            CHECK (recargo_domingo_feriado BETWEEN 1 AND 5),

  -- Divisores de la rata: rata = salario ÷ divisor; el minuto = rata ÷ 60.
  -- 🔑 EL PISO ES LO QUE IMPORTA. Un divisor 0 no da error: da `Infinity`, y una
  -- planilla con rata infinita se paga igual que una buena. 744 = las horas de
  -- un mes de 31 días.
  divisor_40                numeric(8,4) NOT NULL DEFAULT 173.33
                            CHECK (divisor_40 BETWEEN 1 AND 744),
  divisor_48                numeric(8,4) NOT NULL DEFAULT 208
                            CHECK (divisor_48 BETWEEN 1 AND 744),

  -- En POR CIENTO (9,75 y 1,25), no en fracción. El techo de 50 atrapa el "975".
  seguro_social_pct         numeric(7,4) NOT NULL DEFAULT 9.75
                            CHECK (seguro_social_pct BETWEEN 0 AND 50),
  seguro_educativo_pct      numeric(7,4) NOT NULL DEFAULT 1.25
                            CHECK (seguro_educativo_pct BETWEEN 0 AND 50),

  -- ⏳ EL EXCEDENTE DIARIO: se guarda, NO se usa para calcular NADA todavía.
  --
  -- La contable lo confirmó el 6-ago-2026, textual: *"eso después de 3 horas
  -- extras al día, cuando sea prolongación de la jornada nocturna o mixta"*.
  -- El factor es 2.625, que es 1.5 × 1.75.
  --
  -- 🩸 SON DOS CONDICIONES A LA VEZ, NO UNA, y de acá sale el error caro:
  --    1) MÁS DE 3 horas extra en el día, **Y**
  --    2) que sean PROLONGACIÓN DE JORNADA NOCTURNA O MIXTA.
  -- Una jornada diurna con 5 horas extra NO llega a este factor.
  --
  -- ⚠️ EL EXCEL VIEJO DICE OTRA COSA. Su columna se llama "Exedente de 9 horas":
  -- eso habla de un total de horas del día y NO menciona la jornada nocturna ni
  -- la mixta. Quien implemente el cálculo leyendo esa etiqueta le va a aplicar
  -- el 2.625 a gente a la que no le toca. La regla buena es la de arriba; la
  -- columna se llama `recargo_excedente_nocturna_mixta` justamente para que el
  -- nombre no deje implementarla mal.
  excedente_horas_dia               numeric(5,2) NOT NULL DEFAULT 3
                                    CHECK (excedente_horas_dia BETWEEN 0 AND 12),
  recargo_excedente_nocturna_mixta  numeric(6,4) NOT NULL DEFAULT 2.625
                                    CHECK (recargo_excedente_nocturna_mixta BETWEEN 1 AND 5),


  updated_at                timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE asistencia_reglas ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE asistencia_reglas IS
  'Los números del cálculo de asistencia y planilla, TODOS editables. Un solo renglón (id=1). recargo_excedente_nocturna_mixta se guarda pero NADA lo usa todavía: exige >3 horas extra Y prolongación de jornada nocturna o mixta, no lo que dice la columna del Excel viejo.';

-- ─────────────────────────────────────────────────────────────────────────────
-- ⛔ LO QUE NO ES UNA COLUMNA DE ESTA TABLA, A PROPÓSITO
--
-- Estas tres NO son números sueltos: son la FORMA del cálculo. Volverlas
-- configurables sería darle a alguien una perilla para romper la planilla sin
-- querer, y el daño recién se vería el día de pago.
--
--   1. LA AUSENCIA SE DESCUENTA COMO `horas × rata`. No es un factor elegible:
--      es la definición de un día no trabajado.
--   2. LA QUINCENA VA DEL 1 AL 15 Y DEL 16 AL 30. Mover los cortes cambia qué
--      días entran en cada pago, no cuánto vale una hora.
--   3. EL DÍA 31 NO SE PAGA, PERO SÍ SE DESCUENTA SI SE FALTA. Es asimétrico a
--      propósito; ponerlo como casilla invitaría a "arreglar" la asimetría.
--
-- Si alguna cambia, se cambia EN CÓDIGO y con un test que la respalde. No se
-- agregan columnas acá para eso.
-- ─────────────────────────────────────────────────────────────────────────────

-- El renglón único, con los valores confirmados por la contable. `DO NOTHING`
-- para que correr la migración dos veces no pise lo que ya se haya editado.
INSERT INTO asistencia_reglas (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;
