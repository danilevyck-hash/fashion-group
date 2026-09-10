-- ─────────────────────────────────────────────────────────────────────────────
-- ACS (Multifashion) ENTRA A ASISTENCIA Y PLANILLA — la CUARTA empresa.
--
-- Daniel, textual: *«Sí — ACS entra completa a Asistencia y Planilla»*.
--
-- 🔴 ADITIVA. Ni una fila cambia: los cuatro CHECK se reescriben para ACEPTAR
-- una key más, y ninguna fila existente deja de cumplirlos.
--
-- 🔑 EN EL CÓDIGO ES UNA LÍNEA: `EMPRESAS_ASISTENCIA` (src/lib/asistencia/
-- config.ts) es la fuente única del módulo y el nombre que se ve sale de
-- `EMPRESA_KEY_TO_NAME`, donde `american_classic` YA dice «Multifashion». Lo
-- único que no vivía en el código son estos CHECK.
--
-- ⚠️ LA KEY SIGUE SIENDO `american_classic`. No se renombra: es la misma key de
-- las ventas, los tickets y las comisiones de ese negocio, y renombrarla
-- rompería todo lo que ya la usa. Lo que se ve en pantalla es «Multifashion».
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE asistencia_personas DROP CONSTRAINT IF EXISTS asistencia_personas_empresa_check;
ALTER TABLE asistencia_personas
  ADD CONSTRAINT asistencia_personas_empresa_check
  CHECK (empresa = ANY (ARRAY['confecciones_boston'::text,'vistana'::text,'fashion_wear'::text,'american_classic'::text]));

ALTER TABLE asistencia_planilla_guardada DROP CONSTRAINT IF EXISTS asistencia_planilla_guardada_empresa;
ALTER TABLE asistencia_planilla_guardada
  ADD CONSTRAINT asistencia_planilla_guardada_empresa
  CHECK (empresa = ANY (ARRAY['confecciones_boston'::text,'vistana'::text,'fashion_wear'::text,'american_classic'::text]));

ALTER TABLE asistencia_reparto_empresa DROP CONSTRAINT IF EXISTS asistencia_reparto_empresa_valida;
ALTER TABLE asistencia_reparto_empresa
  ADD CONSTRAINT asistencia_reparto_empresa_valida
  CHECK (empresa = ANY (ARRAY['confecciones_boston'::text,'vistana'::text,'fashion_wear'::text,'american_classic'::text]));

ALTER TABLE asistencia_aprobador_empresa DROP CONSTRAINT IF EXISTS asistencia_aprobador_empresa_valida;
ALTER TABLE asistencia_aprobador_empresa
  ADD CONSTRAINT asistencia_aprobador_empresa_valida
  CHECK (empresa = ANY (ARRAY['confecciones_boston'::text,'vistana'::text,'fashion_wear'::text,'american_classic'::text]));

-- ── ⚠️ QUIÉN APRUEBA LAS HORAS DE ACS ───────────────────────────────────────
--
-- NO se agrega acá: lo decide `20261101120000_acs_aprueba_daniel.sql`, donde
-- Daniel dictó *«acs lo aprueba daniel»*. La contadora CIERRA las cuatro sin
-- depender de esta tabla (ver `alcanceDe`), que es otra pregunta.
