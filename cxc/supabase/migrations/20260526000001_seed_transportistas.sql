-- Sprint 1 Guías: seed de los 6 transportistas canónicos detectados en la
-- auditoría del texto libre actual (RedNblue, Transporte Sol, Mojica, Edwin,
-- Sanjur, Boston). El resto del texto libre (City Moda, Sporting Shoes,
-- Luty Lui, Nuñez Global Solutions, DHL Test, etc.) se considera entrega
-- directa, no transportista, y no entra en este seed.

INSERT INTO public.transportistas (nombre) VALUES
  ('RedNblue'),
  ('Transporte Sol'),
  ('Mojica'),
  ('Edwin'),
  ('Sanjur'),
  ('Boston')
ON CONFLICT (nombre) DO NOTHING;
