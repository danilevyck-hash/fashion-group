-- ─────────────────────────────────────────────────────────────────────────────
-- LA PLANILLA QUE SE CIERRA — «Congelados, con boton para reabrir»
--
-- Daniel, textual, preguntado que pasa al guardar: *«Congelados, con boton para
-- reabrir»*. Y el flujo que aprobo:
--
--     elegir periodo -> [Generar] -> BORRADOR -> revisar -> [Cerrar quincena]
--                                            -> CERRADA  -> [Reabrir] (con motivo)
--
-- ⚠️ BORRADOR NO ES UNA FILA. Un periodo sin cierre ES el borrador; «Generar»
-- es pedirle el cuadro a /api/asistencia/planilla, que es lo que la pantalla ya
-- hace hoy. Lo que se ESCRIBE acá es el cierre.
--
-- 🩸 EL AGUJERO, MEDIDO: hoy la planilla NO SE GUARDA EN NINGUN LADO. Las 14
-- tablas `asistencia_*` que existen guardan INSUMOS (marcaciones, correcciones,
-- justificaciones, montos a mano, aprobaciones) y el cuadro se RECALCULA entero
-- cada vez que alguien lo pide. O sea que la planilla del 1 al 15 de agosto que
-- la contadora imprimio y pago NO EXISTE en ningun lugar: si manana alguien
-- corrige una marcacion de esa quincena —y corregir es un boton que TODOS los
-- roles de Asistencia tienen desde el 13-ago— el cuadro cambia solo, y no queda
-- rastro de lo que de verdad se pago.
--
-- ── 🔴 POR ESO SE CONGELA CADA MONTO, Y NO UNA REFERENCIA ────────────────────
--
-- Se guarda el RESULTADO, no la receta. Guardar «la quincena 2026-08-1 quedo
-- cerrada» y recalcularla al abrirla NO es congelar: es exactamente el sistema de hoy con una fecha al lado. Lo que se
-- escribe acá son LOS NUMEROS, uno por uno, tal como salieron el dia que se
-- pago. Es la misma leccion que ya pago este modulo con las marcaciones: el
-- dato que prueba un pago no se recalcula, se guarda.
--
-- ⚠️ Y se guardan TAMBIEN LAS HORAS, no solo la plata. Sin los minutos de
-- tardanza, las ausencias y las extras, un neto congelado es un numero que
-- nadie puede volver a explicar — y explicarlo es justo lo que le piden a la
-- contadora tres meses despues.
--
-- ── DOS TABLAS ──────────────────────────────────────────────────────────────
--
--   `asistencia_planilla_guardada`        una fila por CIERRE (empresa+rango+version)
--   `asistencia_planilla_guardada_linea`  una fila por PERSONA de ese cierre
--
-- ── 🔴 VERSIONES, NO EDICIONES ──────────────────────────────────────────────
--
-- Reabrir NO borra ni edita: la v1 se queda entera —con sus montos y su firma— y
-- el proximo cierre del mismo periodo nace como v2. Nunca se pierde lo que se
-- pago.
--
-- La cabecera es la que se reabre y la que lleva la firma; los renglones son la
-- plata. Meter todo en una sola tabla obligaria a repetir el estado y el firmante
-- en cada renglon, y dos copias del mismo hecho es como se separan.
--
-- ── ADITIVA, IDEMPOTENTE, Y LA APP FUNCIONA SIN ELLA ────────────────────────
--
-- Patron `cols-opcionales`. SIN estas tablas la planilla se calcula EXACTAMENTE
-- como hoy y lo unico que no se puede es guardar — y se dice en pantalla, con el
-- nombre de este archivo. En este repo los DDL los corre Daniel a mano y varios
-- se quedaron pendientes semanas: que la pantalla entera se caiga por eso seria
-- cambiar un aviso por «Asistencia esta rota».
--
-- ⛔ NO TOCA NINGUNA TABLA EXISTENTE. Ni `asistencia_marcaciones`, ni
-- `asistencia_planilla_manual`, ni `asistencia_personas`. Nada de lo que ya hay
-- cambia de forma ni de contenido.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- LA CABECERA
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS asistencia_planilla_guardada (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 🔴 LA EMPRESA IMPORTA Y NO SE DEDUCE. Boston, Vistana y Fashion Wear
  -- comparten UN SOLO RELOJ: de ese aparato salen TRES planillas distintas y lo
  -- unico que las separa es a que empresa pertenece cada codigo. Un cuadro
  -- guardado sin empresa no se sabria a cual pertenece.
  empresa       text NOT NULL,

  -- El rango, ambos dias INCLUIDOS. Es el mismo par que ya acepta
  -- /api/asistencia/planilla (`?desde=&hasta=`), y una quincena es el caso
  -- particular en que coincide con sus cortes.
  desde         date NOT NULL,
  hasta         date NOT NULL,

  -- La clave de la quincena (`2026-08-1`) cuando el rango ES una quincena, NULL
  -- cuando es un rango libre. Es la misma clave con la que
  -- `asistencia_planilla_manual` guarda el ISR y el prestamo, asi que sirve para
  -- ir del cuadro congelado a los montos que se tecleaton.
  quincena      text,

  -- 🔴 LA VERSION DE ESE PERIODO. v1 es el primer cierre; despues de reabrir, el
  -- siguiente cierre del MISMO rango es la v2 y la v1 queda intacta. Reusar el
  -- numero haria que dos cuadros distintos se llamen igual.
  version       integer NOT NULL DEFAULT 1 CHECK (version >= 1),

  -- Cuanto del sueldo quincenal se pago (1 = una quincena entera). Se guarda
  -- para que el numero sea REPRODUCIBLE sin volver a correr `factorBaseDeRango`.
  factor_base   numeric(10,6) NOT NULL DEFAULT 1,

  -- cerrando -> cerrada -> reabierta. ⚠️ NO existe un estado «pagada» (decision
  -- de Daniel) ni una fila para el borrador. Ver el bloque de estados mas abajo.
  estado        text NOT NULL DEFAULT 'cerrando',

  -- 🔴 LA FIRMA SALE DE LA SESION, NUNCA DEL CUERPO DEL PEDIDO. Es la misma
  -- regla que las correcciones de marcacion: si «todos pueden», sin firma se
  -- vuelve «nadie sabe quien fue».
  cerrada_por   text NOT NULL CHECK (btrim(cerrada_por) <> ''),
  cerrada_en    timestamptz NOT NULL DEFAULT now(),

  -- ── REABRIR NO BORRA ──────────────────────────────────────────────────────
  -- La fila se queda con TODOS sus renglones y solo cambia de estado. El rastro
  -- de quien la reabrio y cuando vive acá; el cuadro viejo se puede seguir
  -- leyendo entero. Un boton que hace desaparecer lo que se pago no es un boton,
  -- es una perdida de prueba.
  --
  -- 🔴 `motivo_reabrir` es OBLIGATORIO cuando se reabre (ver el CHECK de abajo),
  -- igual que el motivo de una correccion de marcacion: reabrir un cierre es
  -- tocar un pago ya firmado, y sin el porque escrito nadie puede reconstruir
  -- dentro de un mes por que los numeros de esa quincena cambiaron.
  -- ⚠️ `NOT NULL` a secas deja pasar `""` y `"   "`, que es justo lo que teclea
  -- quien quiere saltarse el campo. Por eso el CHECK usa `btrim`.
  reabierta_por text,
  reabierta_en  timestamptz,
  motivo_reabrir text CHECK (motivo_reabrir IS NULL OR btrim(motivo_reabrir) <> ''),

  -- ── EL TESTIGO ────────────────────────────────────────────────────────────
  -- El total y la cantidad de personas TAL COMO se guardaron. No son una segunda
  -- cuenta: se escriben de los MISMOS renglones que se acaban de escribir, en la
  -- misma operacion. Existen para que un renglon perdido se pueda DENUNCIAR
  -- (sumar los renglones y no dar el total guardado es una alarma), no para
  -- ahorrarse la suma.
  personas      integer NOT NULL DEFAULT 0,
  total_bruto   numeric(14,2) NOT NULL DEFAULT 0,
  total_deducciones numeric(14,2) NOT NULL DEFAULT 0,
  total_neto    numeric(14,2) NOT NULL DEFAULT 0,

  CONSTRAINT asistencia_planilla_guardada_rango CHECK (hasta >= desde)
);

-- La MISMA lista de `EMPRESAS_ASISTENCIA` (src/lib/asistencia/config.ts). El
-- codigo la vuelve a exigir: la base es el ultimo freno, no el unico.
DO $apg$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'asistencia_planilla_guardada_empresa') THEN
    ALTER TABLE asistencia_planilla_guardada
      ADD CONSTRAINT asistencia_planilla_guardada_empresa
      CHECK (empresa IN ('confecciones_boston', 'vistana', 'fashion_wear'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'asistencia_planilla_guardada_estado') THEN
    ALTER TABLE asistencia_planilla_guardada
      ADD CONSTRAINT asistencia_planilla_guardada_estado
      CHECK (estado IN ('cerrando', 'cerrada', 'reabierta'));
  END IF;

  -- Reabierta sin quien la reabrio, o sin el motivo, seria un rastro que no
  -- dice nada. Es la tercera capa del mismo candado (pantalla, ruta, base).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'asistencia_planilla_guardada_reabrir') THEN
    ALTER TABLE asistencia_planilla_guardada
      ADD CONSTRAINT asistencia_planilla_guardada_reabrir
      CHECK (
        estado <> 'reabierta'
        OR (reabierta_por IS NOT NULL AND btrim(reabierta_por) <> ''
            AND reabierta_en IS NOT NULL
            AND motivo_reabrir IS NOT NULL AND btrim(motivo_reabrir) <> '')
      );
  END IF;
END
$apg$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 🔴 EL SOLAPAMIENTO — UNA PERSONA NO PUEDE QUEDAR PAGADA DOS VECES POR EL
--    MISMO DIA
--
-- El caso: alguien cierra «1 al 15» y despues «10 al 20». Los dias 10 a 15
-- estarian pagados DOS VECES, con dos cuadros congelados que los dos dicen ser
-- «lo que se pago». Y no hay forma de descubrirlo mirando un cuadro: los dos se
-- ven perfectos por separado.
--
-- LA DECISION: se RECHAZA el segundo cierre, se NOMBRA la quincena que estorba
-- (con sus fechas, quien la cerro y cuando) y se ofrece REABRIR aquella.
-- No se recorta el rango, no se fusiona y no se cierra «igual pero avisando»:
-- cualquiera de esas tres inventa una decision de pago que le toca a una persona.
--
-- ⚠️ EL ALCANCE ES POR EMPRESA, y es deliberado. Dos cuadros de EMPRESAS
-- distintas con dias en comun son correctos —son otras personas y otra planilla—.
-- La unica persona que aparece en dos empresas a la vez es la del sueldo
-- REPARTIDO (Julio Garay, Vistana + Fashion Wear), y ahi cada empresa paga SU
-- parte: son montos disjuntos, no el mismo dia cobrado dos veces.
--
-- La `WHERE estado = 'cerrada'` es lo que hace que REABRIR libere el rango: un
-- cuadro reabierto ya no es «lo que se pago», asi que dejar de estorbar es
-- exactamente lo que tiene que hacer. Y por eso mismo el historial puede tener
-- muchas filas del mismo rango: la v_n viva y todas las versiones reabiertas.
-- ─────────────────────────────────────────────────────────────────────────────

-- `btree_gist` es lo que permite mezclar la igualdad de `empresa` con el `&&` del
-- rango en un mismo EXCLUDE. Si el proyecto no deja crearla, la migracion NO se
-- cae: el freno queda en el codigo, que ya lo comprueba antes de escribir.
DO $apgx$
BEGIN
  CREATE EXTENSION IF NOT EXISTS btree_gist;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'btree_gist no se pudo crear (%): el freno del solapamiento queda SOLO en el codigo', SQLERRM;
END
$apgx$;

DO $apgs$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'btree_gist')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'asistencia_planilla_guardada_sin_solape')
  THEN
    ALTER TABLE asistencia_planilla_guardada
      ADD CONSTRAINT asistencia_planilla_guardada_sin_solape
      EXCLUDE USING gist (
        empresa WITH =,
        daterange(desde, hasta, '[]') WITH &&
      ) WHERE (estado = 'cerrada');
  END IF;
END
$apgs$;

CREATE INDEX IF NOT EXISTS asistencia_planilla_guardada_busca
  ON asistencia_planilla_guardada (empresa, desde, hasta);

-- Dos filas del mismo periodo no pueden ser la MISMA version.
CREATE UNIQUE INDEX IF NOT EXISTS asistencia_planilla_guardada_version
  ON asistencia_planilla_guardada (empresa, desde, hasta, version);

ALTER TABLE asistencia_planilla_guardada ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE asistencia_planilla_guardada IS
  'Una quincena CERRADA: empresa + rango de fechas + version + quien la cerro. Los montos viven en asistencia_planilla_guardada_linea y NO se recalculan nunca. Reabrir cambia el estado, exige motivo y deja rastro; no borra ni una fila, y el proximo cierre del mismo periodo nace como v2. Dos cuadros `cerrada` de la misma empresa no pueden compartir un dia.';

-- ─────────────────────────────────────────────────────────────────────────────
-- LOS RENGLONES — una fila por persona, con TODO lo que se pago
--
-- 🔴 Se guardan las 24 cifras de `DineroLinea` (src/lib/asistencia/planilla.ts)
-- y las 20 de `HorasPersona`, con el MISMO nombre en camelCase → snake_case. No
-- se guarda «lo importante»: guardar el neto y tirar el desglose deja un numero
-- que nadie puede volver a explicar, y explicarlo es lo que le van a pedir.
--
-- ⚠️ `rata_hora` y `valor_minuto` llevan 6 decimales a proposito: `valorMinuto`
-- es `rataHora / 60` SIN redondear (planilla.ts), y es por lo que se multiplican
-- los minutos de tardanza. Guardarlo a 2 decimales cambiaria el numero.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS asistencia_planilla_guardada_linea (
  id             bigserial PRIMARY KEY,

  -- ⛔ RESTRICT y NO CASCADE, la misma decision que `asistencia_correcciones`:
  -- borrar una cabecera no puede llevarse la plata por delante en silencio.
  planilla_id    uuid NOT NULL
                 REFERENCES asistencia_planilla_guardada(id) ON DELETE RESTRICT,

  empleado_codigo text NOT NULL,

  -- 🔴 EL NOMBRE VA CONGELADO, no leido de `asistencia_personas`. Si manana la
  -- contadora corrige un nombre mal escrito, el cuadro que se pago tiene que
  -- seguir diciendo a quien se le pago ese dia.
  nombre         text,
  empresa        text NOT NULL,
  salario_mensual numeric(14,2),
  jornada_semanal integer,

  -- ── POR QUE ESTA PERSONA NO TIENE NUMERO ──────────────────────────────────
  -- `grupoDeLinea`: pagada | fuera | decidir | falta. Sin esto, un renglon en
  -- blanco tres meses despues es indistinguible de un error de calculo, y el
  -- modulo entero se construyo sobre no confundir «decidilo vos» con «falta un
  -- dato» (el color es la mitad del mensaje).
  grupo          text NOT NULL DEFAULT 'pagada',
  falta_configurar text[] NOT NULL DEFAULT '{}',
  decidir_a_mano text,
  fuera_de_planilla boolean NOT NULL DEFAULT false,
  paga_seguros   boolean NOT NULL DEFAULT true,
  no_marca_reloj boolean NOT NULL DEFAULT false,
  quincenal_referencia numeric(14,2),

  -- El sueldo repartido en dos empresas (Julio Garay). NULL = cobra entero acá.
  parte_salario_mensual numeric(14,2),
  parte_paga_horas_extra boolean,

  -- Las horas extra que MIDIO el reloj, esten aprobadas o no, y si se pagaron.
  -- Es lo unico que permite leer un cuadro viejo y entender por que un monto de
  -- extras es 0 con minutos marcados.
  extra_medido_min numeric(14,4),
  extra_aprobada boolean NOT NULL DEFAULT true,

  -- ── LAS 20 COLUMNAS DE `HorasPersona`, en minutos ─────────────────────────
  -- 4 decimales: desde el 13-ago las marcaciones se miden AL SEGUNDO, asi que
  -- un minuto tiene fraccion y redondearlo acá seria deshacer ese trabajo.
  extra_diurno_min        numeric(14,4) NOT NULL DEFAULT 0,
  extra_nocturno_min      numeric(14,4) NOT NULL DEFAULT 0,
  extra_no_aprobada_min   numeric(14,4) NOT NULL DEFAULT 0,
  excedente_min           numeric(14,4) NOT NULL DEFAULT 0,
  domingo_min             numeric(14,4) NOT NULL DEFAULT 0,
  feriado_min             numeric(14,4) NOT NULL DEFAULT 0,
  tardanza_min            numeric(14,4) NOT NULL DEFAULT 0,
  tardanza_grave_min      numeric(14,4) NOT NULL DEFAULT 0,
  tardanza_grave_dias     numeric(10,2) NOT NULL DEFAULT 0,
  ausencia_min            numeric(14,4) NOT NULL DEFAULT 0,
  ausencia_dias           numeric(10,2) NOT NULL DEFAULT 0,
  ausencia_justificada_dias numeric(10,2) NOT NULL DEFAULT 0,
  vacaciones_ya_pagadas_min numeric(14,4) NOT NULL DEFAULT 0,
  vacaciones_ya_pagadas_dias numeric(10,2) NOT NULL DEFAULT 0,
  vacaciones_dias         numeric(10,2) NOT NULL DEFAULT 0,
  sabado_min              numeric(14,4) NOT NULL DEFAULT 0,
  dias_trabajados         numeric(10,2) NOT NULL DEFAULT 0,
  dias_a_revisar          numeric(10,2) NOT NULL DEFAULT 0,
  tardanza_de_dias_a_revisar_min numeric(14,4) NOT NULL DEFAULT 0,
  jornada_diaria_min      numeric(14,4) NOT NULL DEFAULT 0,

  -- ── LAS 24 CIFRAS DE `DineroLinea` ────────────────────────────────────────
  -- NULL en todo el bloque = a esta persona no se le calculo pago (servicio
  -- profesional, «decidilo vos», o le falta un dato). ⚠️ NULL y 0 NO son lo
  -- mismo y por eso no hay DEFAULT 0: un 0 diria «se le pago cero».
  rata_hora            numeric(16,6),
  valor_minuto         numeric(16,6),
  salario_quincenal    numeric(14,2),
  extra_diurno         numeric(14,2),
  extra_nocturno       numeric(14,2),
  excedente            numeric(14,2),
  domingos             numeric(14,2),
  feriados             numeric(14,2),
  ausencias            numeric(14,2),
  ausencia_por_tardanza numeric(14,2),
  ausencia_de_dia_completo numeric(14,2),
  vacaciones_ya_pagadas numeric(14,2),
  tardanzas            numeric(14,2),
  total_bruto          numeric(14,2),
  base_seguros         numeric(14,2),
  seguro_social        numeric(14,2),
  seguro_educativo     numeric(14,2),
  isr                  numeric(14,2),
  prestamo             numeric(14,2),
  terceros             numeric(14,2),
  mercancia            numeric(14,2),
  total_deducciones    numeric(14,2),
  otros_servicios      numeric(14,2),
  neto_pagar           numeric(14,2),

  creado_en      timestamptz NOT NULL DEFAULT now()
);

-- Una persona no puede salir dos veces en el MISMO cuadro. (En dos cuadros de
-- empresas distintas si: es el sueldo repartido.)
CREATE UNIQUE INDEX IF NOT EXISTS asistencia_planilla_guardada_linea_unica
  ON asistencia_planilla_guardada_linea (planilla_id, empleado_codigo);

CREATE INDEX IF NOT EXISTS asistencia_planilla_guardada_linea_persona
  ON asistencia_planilla_guardada_linea (empleado_codigo);

ALTER TABLE asistencia_planilla_guardada_linea ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE asistencia_planilla_guardada_linea IS
  'Lo que se le pago a cada persona en una quincena cerrada: las 24 cifras de DineroLinea y las 20 de HorasPersona, tal como salieron el dia del cierre. NO se recalculan nunca, ni cuando se corrige una marcacion de ese periodo. NULL en el bloque de dinero = a esa persona no se le calculo pago (no es un cero).';
