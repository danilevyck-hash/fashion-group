-- ─────────────────────────────────────────────────────────────────────────────
-- RECORDATORIOS — el módulo de Cheques pasa a llamarse "Recordatorios", y
-- adentro conviven los cheques por depositar (intactos) y recordatorios sueltos.
--
-- Daniel, textual (24-ago-2026): *"en el módulo de cheques, quisiera cambiarlo a
-- recordatorios, ya que quisiera poner ahí en el calendario «recordar cobrar» y
-- pongo la fecha así telegram me recuerda"*.
--
-- Y a las tres preguntas del diseño:
--   1. ¿se puede atar a un cliente?  → *"sí, pero no debería de ser obligatorio"*
--   2. ¿se repite?                   → *"puede ser, no siempre"*
--   3. ¿quién lo ve?                 → *"admin y secre"*
--
-- ── 🔴 ADITIVA, Y LA APP FUNCIONA ANTES DE QUE ESTO CORRA ────────────────────
--
-- No toca `cheques` ni ninguna otra tabla: solo CREA. En este proyecto los DDL
-- los corre Daniel a mano y varios se quedaron pendientes semanas, así que la
-- pantalla degrada limpio (patrón `cols-opcionales`): sin esta tabla se ven los
-- cheques **exactamente igual que hoy** y un aviso en ÁMBAR dice qué archivo
-- falta. Ámbar y no rojo: rojo se lee como "algo se rompió", y no se rompió
-- nada — todavía no está encendido.
--
-- ⚠️ **LOS 19 CHEQUES VIVOS NO SE TOCAN.** Ni una columna, ni el flujo de
-- depositar / rebotar / re-depositar. Medido en producción antes y después:
-- 19 filas · $279.396,12 · 13 depositado + 6 pendiente.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS recordatorios (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- El día que Daniel eligió. Con repetición, es el PRIMERO: de ahí en adelante
  -- vuelve cada semana o cada mes, nunca antes.
  fecha           date NOT NULL,

  -- Qué hay que recordar ("recordar cobrar"). 🔴 El CHECK exige texto de verdad:
  -- `NOT NULL` a secas deja pasar la cadena vacía y los espacios, que es
  -- exactamente lo que teclea quien quiere saltarse el campo — y un
  -- recordatorio sin texto es una notificación que no dice nada.
  texto           text NOT NULL CHECK (btrim(texto) <> ''),

  -- ── EL CLIENTE ES OPCIONAL (decisión de Daniel) ──────────────────────────
  -- Mismo patrón que `cheques.cliente_codigo`, `guia_items.cliente_codigo` y
  -- `mk_proyectos.tienda` + `tienda_codigo`: el NOMBRE se conserva como display
  -- y el CÓDIGO D-XXX es la plomería invisible que ata al directorio.
  -- Los dos NULL = recordatorio sin cliente, que es un estado legítimo.
  cliente         text,
  cliente_codigo  text,

  -- ── LA REPETICIÓN ES OPCIONAL ────────────────────────────────────────────
  -- Daniel: *"puede ser, no siempre"*. Por eso el DEFAULT es `una_vez`, que es
  -- el caso común. El CHECK es una lista CERRADA: un valor inventado dejaría un
  -- recordatorio que nunca vuelve a sonar y nadie se enteraría.
  repeticion      text NOT NULL DEFAULT 'una_vez'
                  CHECK (repeticion IN ('una_vez', 'semanal', 'mensual')),

  -- Soft delete, como el resto del módulo (cheques, reclamos, guías, caja).
  -- Borrar un recordatorio no borra la fila.
  deleted         boolean NOT NULL DEFAULT false,

  creado_por      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- La lectura típica: los vivos, en orden de fecha. El módulo NO filtra por
-- rango de fechas a propósito — un mensual puesto en enero tiene que poder
-- sonar en agosto, y filtrarlo por fecha lo volvería invisible.
CREATE INDEX IF NOT EXISTS recordatorios_vivos_idx
  ON recordatorios (fecha, id)
  WHERE deleted = false;

-- RLS encendida SIN políticas: nadie entra con la llave pública. Todo el acceso
-- pasa por el servidor con service_role, igual que el resto del módulo.
ALTER TABLE recordatorios ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE recordatorios IS
  'Recordatorios sueltos del módulo Recordatorios (antes Cheques). Fecha + texto, con cliente y repetición OPCIONALES. El aviso sale por el cron cheques-alert (14:15 UTC = 9:15 a.m. Panamá), canal Telegram de NEGOCIO, con la misma ventana de día hábil que los cheques. Soft delete.';

COMMENT ON COLUMN recordatorios.fecha IS
  'El día elegido. Con repetición semanal o mensual, es el PRIMERO: nunca suena antes.';
COMMENT ON COLUMN recordatorios.cliente_codigo IS
  'Código D-XXX del directorio. NULL = sin cliente, que es un estado legítimo (Daniel: "no debería de ser obligatorio").';
COMMENT ON COLUMN recordatorios.repeticion IS
  'una_vez (default) | semanal | mensual. Un mensual puesto el 31 cae en el ÚLTIMO día de los meses que no lo tienen, si no se saltearía 5 meses del año en silencio.';
