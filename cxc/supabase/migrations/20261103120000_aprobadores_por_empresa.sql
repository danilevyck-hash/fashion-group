-- QUIÉN APRUEBA HORAS EXTRA DE CADA EMPRESA (10-sep-2026).
--
-- Daniel, textual: «quién aprueba horas extra de cada empresa: daniel y
-- contabilidad en todas las empresas incluyendo boston, david solo boston» y,
-- corrigiendo: «bodega también aprueba fashion wear y vistana». Bodega se
-- queda como está; david ya está solo en Boston.
--
-- Aditiva e idempotente: INSERT … ON CONFLICT DO NOTHING. Sin DELETE de nada.

INSERT INTO asistencia_aprobador_empresa (usuario, empresa) VALUES
  ('daniel',       'vistana'),
  ('daniel',       'fashion_wear'),
  ('daniel',       'confecciones_boston'),
  ('daniel',       'american_classic'),
  ('Contabilidad', 'american_classic')
ON CONFLICT (usuario, empresa) DO NOTHING;
