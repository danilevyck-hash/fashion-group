-- ─────────────────────────────────────────────────────────────────────────────
-- QUIEN APRUEBA HORAS EXTRA, Y DE QUE EMPRESA
--
-- Hasta hoy, quien podia aprobar aprobaba a las 40 personas de las TRES
-- empresas. No existia ningun concepto de aprobador por empresa: el POST de
-- /api/asistencia/aprobaciones recibia {codigo, fecha} y no miraba de donde era
-- esa persona, y la lectura de la planilla aceptaba la empresa del query.
--
-- 🩸 Y NO ES TEORICO, esta medido en produccion (31-ago-2026): Julio —empleado
-- de VISTANA, que entra con el usuario compartido `Bodega`— aprobo 57 dias de
-- CONFECCIONES BOSTON, que no le corresponden.
--
-- El reparto lo decidio Daniel:
--     david        (gerente_boston) -> confecciones_boston
--     Bodega       (Julio)          -> fashion_wear, vistana
--     admin                         -> las tres
--
-- ── 🔴 LA LLAVE ES EL NOMBRE DE USUARIO, NO EL uuid ──────────────────────────
--
-- `fg_users.name` es lo que viaja en la sesion (`auth.userName`) y lo que queda
-- escrito en `asistencia_horas_extra_aprobadas.marcado_por`. Con el uuid habria
-- que cruzar una tabla mas para leer una fila de auditoria, y el aprobador de
-- `Bodega` es una CUENTA COMPARTIDA —no una persona— asi que el id no aporta
-- identidad que el nombre no tenga.
--
-- ⚠️ El precio: renombrar un usuario deja su fila huerfana. El modo de fallo es
-- FAIL-CLOSED —esa persona deja de poder aprobar y lo ve en pantalla— nunca
-- «aprueba de mas». Se compara sin distinguir mayusculas (`lower()`), asi que
-- `Bodega` y `bodega` son el mismo.
--
-- ── ADITIVA, y la app FUNCIONA SIN ELLA ──────────────────────────────────────
--
-- Patron `cols-opcionales`. SIN esta tabla nadie queda segmentado y todo se
-- comporta EXACTAMENTE como hoy —Julio incluido— y la pantalla lo dice en
-- ambar con el nombre de este archivo. Se eligio asi y no fail-closed porque lo
-- contrario dejaria a Julio y a Contabilidad sin poder aprobar el dia del
-- deploy, por una migracion que este repo tarda dias en correr.
--
-- ⛔ NO TOCA `asistencia_horas_extra_aprobadas`. Las 521 aprobaciones que hay
-- hoy (Bodega 101, Contabilidad 122, daniel 298) quedan como estan: son un
-- hecho firmado, no una configuracion.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS asistencia_aprobador_empresa (
  -- `fg_users.name`, tal cual. Se compara con lower() desde el codigo.
  usuario    text NOT NULL CHECK (btrim(usuario) <> ''),
  empresa    text NOT NULL,
  creado_en  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario, empresa)
);

-- La misma lista de `EMPRESAS_ASISTENCIA` (src/lib/asistencia/config.ts). El
-- codigo la vuelve a exigir: la base es el ultimo freno, no el unico.
DO $ape$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'asistencia_aprobador_empresa_valida'
  ) THEN
    ALTER TABLE asistencia_aprobador_empresa
      ADD CONSTRAINT asistencia_aprobador_empresa_valida
      CHECK (empresa IN ('confecciones_boston', 'vistana', 'fashion_wear'));
  END IF;
END
$ape$;

ALTER TABLE asistencia_aprobador_empresa ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE asistencia_aprobador_empresa IS
  'De que empresas puede aprobar horas extra cada usuario. Una fila por (usuario, empresa). `admin` NO necesita filas: pasa siempre, igual que en requireRole y en getVisibleModules. Sin filas para un usuario que puede aprobar, no aprueba nada (fail-closed) — salvo que la TABLA no exista, y ahi nadie queda segmentado.';

-- ─────────────────────────────────────────────────────────────────────────────
-- EL REPARTO
--
-- Se siembra en la MISMA migracion a proposito: con la tabla vacia el sistema se
-- comporta igual que no tenerla, y correr el archivo se leeria como «no paso
-- nada».
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO asistencia_aprobador_empresa (usuario, empresa) VALUES
  -- David: su empresa, y solo la suya. Es el espejo de la regla que ya rige su
  -- modulo — el servidor le fuerza Boston y no la lee de la URL.
  ('david',   'confecciones_boston'),
  -- Julio entra con la cuenta compartida `Bodega`. Es empleado de VISTANA.
  ('Bodega',  'fashion_wear'),
  ('Bodega',  'vistana'),
  -- 🔴 CONTABILIDAD NO ESTABA EN EL REPARTO QUE DANIEL ESCRIBIO, y estas tres
  -- filas son una DECISION que hay que mirar. El motivo de ponerlas: es quien
  -- arma la planilla, entro a `APROBACIONES_ROLES` el 27-ago por pedido suyo
  -- («que contabilidad tambien pueda aprobar») y lleva 122 dias aprobados en
  -- las tres empresas. Dejarla afuera la habria dejado sin poder aprobar NADA
  -- el dia que se corra esto, en silencio.
  --
  -- ⚠️ SI DANIEL QUIERE ACOTARLA, SE BORRAN FILAS — no hace falta tocar codigo:
  --     DELETE FROM asistencia_aprobador_empresa
  --      WHERE usuario = 'Contabilidad' AND empresa = 'confecciones_boston';
  ('Contabilidad', 'confecciones_boston'),
  ('Contabilidad', 'fashion_wear'),
  ('Contabilidad', 'vistana')
ON CONFLICT (usuario, empresa) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- Y EL MODULO PARA DAVID
--
-- Sin `asistencia` en su lista, la ficha no se le pinta en el menu y no puede
-- llegar a la pantalla de aprobar. Se agrega con `array_append` y NO escribiendo
-- la lista entera: eso le borraria un modulo futuro.
--
-- ⚠️ NO le abre el modulo: las otras 11 rutas de /api/asistencia/* siguen
-- exigiendo `asistenciaRoles()` y le contestan 403, y `vePestana` le muestra
-- UNA sola pestaña (Aprobaciones). Lo unico que esta key compra es la puerta.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE role_permissions
   SET modulos = modulos || ARRAY['asistencia']
 WHERE role = 'gerente_boston'
   AND NOT ('asistencia' = ANY(modulos));
