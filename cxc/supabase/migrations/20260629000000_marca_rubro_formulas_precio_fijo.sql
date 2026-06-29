-- Precio fijo por descripción.
-- Si `precio_fijo` está lleno, es el precio en dólares asignado directo a la
-- descripción y GANA a la fórmula (ignora costo/divisor/extra/redondeo).
-- Jerarquía de precio: precio fijo > fórmula propia (divisor/extra) > fórmula de la marca.
-- Aditivo y nullable → compatible con las filas existentes (precio_fijo = NULL = usa fórmula).

alter table marca_rubro_formulas
  add column if not exists precio_fijo numeric;
