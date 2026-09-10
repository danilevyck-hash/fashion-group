-- ─────────────────────────────────────────────────────────────────────────────
-- LA FOTO DE LA CÉDULA — el bucket (10-sep-2026)
--
-- Daniel, textual: *«cédula que se pueda ver o descargar la foto»*.
--
-- 🔴 LA COLUMNA YA EXISTE Y NO SE TOCA. `asistencia_personas.cedula_foto_path`
-- nació el 28-oct-2026 con la Planilla Unida (`20261028120000`) y desde
-- entonces se lee y viaja en el GET — lo que faltaba era el LUGAR donde poner
-- el archivo. Esta migración es SOLO el bucket: ni una fila cambia de valor, ni
-- una columna se agrega.
--
-- 🔴 PRIVADO, como los otros cuatro de la casa (`caja-recibos`,
-- `reclamo-facturas`, `depurador-plantillas`, `marketing`): una cédula es un
-- documento de identidad y un bucket público la deja abierta a quien adivine la
-- dirección. Todo el acceso es del lado del servidor, con service role y URL
-- firmada de una hora — nunca `getPublicUrl`.
--
-- ⚠️ SIN POLICIES para `anon` ni `authenticated`, a propósito: la única puerta
-- es `/api/asistencia/cedula-foto`, que exige el rol.
-- ─────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('asistencia-cedulas', 'asistencia-cedulas', false)
on conflict (id) do nothing;

comment on column asistencia_personas.cedula_foto_path is
  'La ruta en el bucket PRIVADO `asistencia-cedulas`. Se carga UNA vez en la ficha y de ahí se usa siempre. Nunca una URL: la URL se firma al leer y vence en una hora.';
