-- ─────────────────────────────────────────────────────────────────────────────
-- ASISTENCIA — QUIEN COBRA FIJO Y NO PASA POR EL RELOJ
--
-- ── 🩸 EL AGUJERO QUE TAPA ───────────────────────────────────────────────────
--
-- Daniel, textual (25-ago-2026): *"Edwin -> crearle ficha con $700/mes marcado
-- como no marca el reloj"*. EDWIN GOMEZ vende en la calle y no pasa por el
-- aparato ni un dia, pero cobra su quincena completa con seguros y todo.
--
-- El modulo no sabia decir eso. Ante CERO marcaciones el motor SE ABSTIENE
-- (`FALTA.sinMarcaciones` en `lib/asistencia/planilla.ts`) porque no puede
-- distinguir a quien renuncio de quien estuvo de vacaciones. Para Edwin esa
-- abstencion esta mal: lo dejaria en la lista de pendientes TODAS las
-- quincenas, y el riesgo real es que una quincena nadie lo mire y no cobre.
--
-- El Excel de la contadora ya lo decia sin una palabra: de las seis filas de
-- Vistana, la de Edwin es la UNICA que **no tiene formula** en horas extra,
-- ausencias, tardanzas, domingos ni feriados. Solo `=C10/2`. Ella tampoco le
-- calcula nada del reloj. Medido celda por celda, no deducido.
--
-- ── 🔴 POR QUE NO SE PUEDE DEDUCIR DE NINGUN DATO QUE YA TENGAMOS ────────────
--
-- No es `servicio_profesional`: eso es lo CONTRARIO -mide asistencia y no
-- calcula pago-, y a Edwin hay que pagarle. No es "no tiene marcaciones": eso
-- es justo la ambiguedad que hace que el motor se abstenga. Un codigo sin
-- marcas puede ser alguien que renuncio, alguien de vacaciones, o alguien a
-- quien no le toca marcar. Por eso es una bandera explicita y no una regla
-- derivada que se equivocaria sola.
--
-- ── 🔴 EL DEFAULT ES `false`, Y ESO NO ES UN DETALLE ─────────────────────────
--
-- `DEFAULT false NOT NULL` deja a las 39 fichas EXACTAMENTE como estaban: a
-- todas se les miden las marcaciones, que es lo que la planilla hacia ayer. El
-- dia que esta migracion corre NO SE MUEVE UN CENTAVO, y nada cambia hasta que
-- una persona prenda el interruptor a conciencia en la pantalla.
--
-- La asimetria va para ese lado por una razon: prender la bandera por accidente
-- le pagaria la quincena entera a alguien que falto dos semanas, y eso no se ve
-- en ninguna pantalla hasta que ya se pago. Dejarla apagada de mas, en cambio,
-- solo hace que la persona aparezca como pendiente y alguien la mire.
--
-- Aditiva e idempotente: no toca una sola fila existente.
-- ⚠️ La app FUNCIONA SIN ESTA MIGRACION: `leerPersonas` es una escalera y relee
-- sin la columna (todo el mundo marca el reloj, como hoy), y la pantalla dice
-- que falta correr este archivo en vez de romperse.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE asistencia_personas
  ADD COLUMN IF NOT EXISTS no_marca_reloj boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN asistencia_personas.no_marca_reloj IS
  'true = cobra su quincena completa SIN pasar por el reloj (EDWIN GOMEZ vende en la calle). Dos efectos y ninguno mas: (1) no cae en «no marco ni un dia» ni se le busca justificacion, o sea que produce su neto solo todas las quincenas; (2) el reloj se IGNORA SIEMPRE, no solo cuando no hay marcas -si alguien usa su codigo, no le aparecen ausencias, tardanzas ni horas extra inventadas que le muevan el pago sin que nadie lo vea-. NO es servicio_profesional: a esta persona SI se le calcula pago, con seguros y todo. El DEFAULT false es el comportamiento que la planilla tenia para las 39 fichas.';

-- ─────────────────────────────────────────────────────────────────────────────
-- ⛔ LO QUE ESTA MIGRACION NO HACE, A PROPOSITO
--
--   1. NO le prende la bandera a NADIE, ni siquiera a Edwin. La ficha de Edwin
--      se crea por la pantalla (o por el PUT de /api/asistencia/configuracion),
--      que es el mismo camino que usa la contadora. Prender un sueldo fijo es
--      plata: se hace a conciencia, no como efecto secundario de un archivo.
--   2. NO toca salarios, ni jornadas, ni `activo`, ni `servicio_profesional`,
--      ni `paga_seguros`.
--   3. NO toca `asistencia_marcaciones`: las marcaciones que existan se siguen
--      guardando y se siguen viendo en el reporte de asistencia. Lo que cambia
--      es que NO valuan la planilla de quien tiene la bandera.
--   4. NO toca `asistencia_reglas` ni la formula de horas, el redondeo o los
--      divisores.
-- ─────────────────────────────────────────────────────────────────────────────
