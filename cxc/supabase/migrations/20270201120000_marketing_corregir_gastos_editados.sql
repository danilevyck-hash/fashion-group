-- Marketing › corregir los DOS gastos que dañó el bug de «Editar factura» (27-nov-2026).
--
-- Por qué: hasta el PR #904, el lector de la factura (mapFactura) no traía la
-- tienda, la nota ni el «Se cobra». Editar un gasto abría el formulario vacío
-- y al guardar pisaba lo guardado: nota en blanco y el % en 100.
-- Medido en activity_logs (solo lectura) el 27-nov-2026: solo dos facturas.
--   · Javier Agustín Miranda Miranda, $4.023,47 (D-170): perdió la nota
--     «Apertura» y el «Se cobra» pasó de 50 % a 100 %.
--   · Impresora Comercial S.A., 0000065973, $48,15 (D-139): el «Se cobra»
--     pasó de 50 % a 100 %.
-- La tienda de las dos ya se había repuesto a mano.
--
-- Daniel, 27-nov-2026, ante las opciones de corrección: «b» (corregir las dos).
--
-- Cada UPDATE solo corre si la fila sigue como la dejó el bug: repetirlo no
-- toca nada. Son 3 cambios en 2 facturas.

UPDATE mk_facturas SET nota='Apertura' WHERE id='5b06bbd4-aadb-4dbe-86fc-ac36615b3035' AND nota IS NULL;
UPDATE mk_facturas SET pct_a_la_marca=50 WHERE id='5b06bbd4-aadb-4dbe-86fc-ac36615b3035' AND pct_a_la_marca=100;
UPDATE mk_facturas SET pct_a_la_marca=50 WHERE id='df20f29a-60a7-48e6-acaa-3acf6ccbed04' AND pct_a_la_marca=100;
