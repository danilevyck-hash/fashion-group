-- ═════════════════════════════════════════════════════════════════════════════
-- QUIÉN ENTRA A CADA MÓDULO — `visitas_modulo` (25-sep-2026)
--
-- Daniel, textual: «quién entra a cada módulo lo debes saber tú».
--
-- EL HUECO QUE CIERRA. Hoy se sabe quién ENTRA AL SISTEMA (`user_sessions`) y
-- qué ACCIONES puntuales hizo (`activity_logs`: descargas, configuración), pero
-- nada dice qué PANTALLA abrió. Tres auditorías del 25-sep-2026 no pudieron
-- contestar si la secretaria o Contabilidad abren Comisiones, Ventas o
-- Referencia: no hay dónde mirarlo. Esta tabla es ese dónde.
--
-- QUÉ GUARDA, Y QUÉ NO. Una fila por DÍA, PERSONA, MÓDULO y APARATO, con
-- cuántas veces entró. No guarda la dirección exacta, ni el filtro, ni lo que
-- miró, ni qué tocó: solo que ese día abrió ese módulo desde el teléfono o
-- desde la computadora. Es un CONTEO, no un rastro de navegación.
--
-- BARATA A PROPÓSITO. El navegador manda como mucho UNA anotación por módulo
-- cada 10 minutos por pestaña (`src/lib/visitas/registro.ts`), sin esperar la
-- respuesta. Con 10 personas y 20 módulos son decenas de filas por día, no
-- miles: en 180 días la tabla no pasa de unas pocas decenas de miles.
--
-- ADITIVA: crea una tabla nueva y una función. No toca ni una fila de nada.
--
-- 🔴 LA APP FUNCIONA ANTES DE QUE ESTO CORRA. Sin la tabla ni la función, el
-- POST /api/visitas contesta 204 y no escribe (falla ABIERTA). Nadie ve un
-- error, ninguna pantalla se rompe; simplemente todavía no se mide nada.
--
-- 🔴 SE PODA SOLA: el cron `cleanup-sessions` (02:30 UTC) borra lo que pasa de
-- 180 días. Es `bitacora` en `src/lib/backup/tablas.ts` — se regenera sola y
-- envejece a propósito, así que NO entra al respaldo.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS visitas_modulo (
  -- El día de PANAMÁ (lo manda el servidor, nunca el navegador): a las 22:00 de
  -- Panamá el día UTC ya es mañana, y eso partiría en dos la jornada de la
  -- secretaria.
  dia         date        NOT NULL,
  -- Quién. El `id` de `fg_users`, que es la identidad; sale de la cookie
  -- FIRMADA, jamás del cuerpo de la petición.
  user_id     text        NOT NULL,
  -- El nombre y el rol AL MOMENTO de la visita, solo para que la pantalla de
  -- Daniel se lea sin cruzar nada. No son la identidad: si alguien cambia de
  -- rol, las filas viejas siguen contando lo que pasó ese día.
  user_name   text        NOT NULL DEFAULT '',
  role        text        NOT NULL DEFAULT '',
  -- La `key` del módulo de `src/lib/modules.ts` (`cxc`, `guias`, `comisiones`…).
  -- El servidor rechaza con 400 cualquier cosa que no esté en `ALL_MODULES`.
  modulo      text        NOT NULL,
  -- `celular` o `computadora`, decidido por el DEDO (`pointer: coarse`), la
  -- misma regla que usa el resto del sistema (`src/lib/aparato.ts`).
  aparato     text        NOT NULL,
  visitas     integer     NOT NULL DEFAULT 1,
  primera_en  timestamptz NOT NULL DEFAULT now(),
  ultima_en   timestamptz NOT NULL DEFAULT now(),
  -- El grano es el conteo: la misma persona, el mismo día, el mismo módulo y el
  -- mismo aparato son UNA fila que sube de a uno.
  CONSTRAINT visitas_modulo_pk PRIMARY KEY (dia, user_id, modulo, aparato),
  CONSTRAINT visitas_modulo_aparato_conocido
    CHECK (aparato IN ('celular', 'computadora')),
  CONSTRAINT visitas_modulo_no_vacio
    CHECK (user_id <> '' AND modulo <> ''),
  CONSTRAINT visitas_modulo_cuenta_positiva CHECK (visitas > 0)
);

-- La pregunta de la pantalla («los últimos 30 días») y la del cron que poda.
CREATE INDEX IF NOT EXISTS visitas_modulo_por_dia ON visitas_modulo (dia DESC);

COMMENT ON TABLE visitas_modulo IS
  'Quién abrió cada módulo, por día y aparato. Una fila = (día, persona, módulo, '
  'aparato) con cuántas veces entró. La escribe POST /api/visitas; se mira en '
  'Usuarios › Quién usa qué; el cron cleanup-sessions borra lo de más de 180 días.';

-- ─── Sumar uno, sin leer antes ───────────────────────────────────────────────
-- Un `upsert` de PostgREST REEMPLAZA la fila: no sabe sumar. Con dos pestañas
-- abiertas eso perdería visitas en silencio. El INSERT … ON CONFLICT DO UPDATE
-- de abajo suma en la base, en una sola pasada y sin carrera posible.
--
-- `p_dia` viene como parámetro (el día de Panamá) a propósito: la base corre en
-- UTC y `current_date` la partiría cinco horas antes de tiempo.
CREATE OR REPLACE FUNCTION registrar_visita_modulo(
  p_dia       date,
  p_user_id   text,
  p_user_name text,
  p_role      text,
  p_modulo    text,
  p_aparato   text
) RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO visitas_modulo (dia, user_id, user_name, role, modulo, aparato, visitas)
  VALUES (p_dia, p_user_id, p_user_name, p_role, p_modulo, p_aparato, 1)
  ON CONFLICT (dia, user_id, modulo, aparato) DO UPDATE
     SET visitas   = visitas_modulo.visitas + 1,
         ultima_en = now(),
         -- El nombre y el rol se refrescan con lo último que se vio; el
         -- `primera_en` NO se toca: es la primera vez de ese día.
         user_name = EXCLUDED.user_name,
         role      = EXCLUDED.role;
$$;

COMMENT ON FUNCTION registrar_visita_modulo(date, text, text, text, text, text) IS
  'Suma UNA visita de módulo. La llama POST /api/visitas con el día de Panamá.';

-- Solo el servidor la puede llamar: una función de escritura abierta a `anon`
-- sería una puerta para ensuciar la medición desde afuera.
REVOKE ALL ON FUNCTION registrar_visita_modulo(date, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION registrar_visita_modulo(date, text, text, text, text, text) TO service_role;

-- ─── RLS: solo el servidor (service_role), como el resto de las tablas nuevas ─
ALTER TABLE visitas_modulo ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'visitas_modulo' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON visitas_modulo
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
