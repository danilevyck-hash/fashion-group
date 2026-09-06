-- ═════════════════════════════════════════════════════════════════════════════
-- comision_descuentos_fijos gana DESDE y HASTA — un descuento tiene fechas.
-- ═════════════════════════════════════════════════════════════════════════════
-- 🩸 Medido contra producción el 5-sep-2026: la tabla tenía OCHO columnas y
-- NINGUNA de fecha (`id · vendedor_nombre · empresa_key · concepto · monto ·
-- activo · created_at · updated_at`), así que el descuento se restaba en TODOS
-- los meses, para siempre y también hacia atrás.
--
-- Las dos únicas filas son de Reynaldo Espinosa en Fashion Shoes, creadas el
-- **8-jul-2026**:
--     «Descuento»             $1.400,00
--     «Descuento de adelanto»   $173,08
--                             ─────────
--                             $1.573,08 por mes
--
-- Se estaban restando también en enero, febrero, marzo, abril, mayo y junio de
-- 2026 — SEIS meses anteriores al día en que la fila se creó. En 2026 van
-- **$14.157,72** (9 meses × $1.573,08), y en ESTE caso está bien: Daniel
-- confirmó que se le viene descontando desde enero. Lo que estaba mal no era
-- el número: era que **la tabla no tenía forma de decirlo**, así que el próximo
-- descuento también se iba a restar hacia atrás, y ahí sí sin querer.
--
-- Daniel, 6-sep-2026: «no sé [qué era] pero hay que descontarlo así mensual» y,
-- al ver el cuadro del antes/después: **«pero el descuento es indefinido. No hay
-- hasta. Ponlo desde enero que se le descuenta esos 1500 y pico.»**
--
-- 🔴 O SEA: `desde = 2026-01-01` y `hasta` en NULL. Se le viene descontando
-- desde enero y sigue indefinido. **NINGÚN número de 2026 se mueve** — los 9
-- meses quedan exactamente como están hoy y el total del año sigue siendo
-- $67.815,75. Medido: `scripts/_medir-descuento-desde-julio.mjs`.
--
-- 🔑 ENTONCES ¿PARA QUÉ SIRVE ESTA MIGRACIÓN? Para el PRÓXIMO descuento. El
-- defecto no era el monto de Reynaldo: era que **un descuento sin fechas se
-- aplica hacia atrás a meses en los que no existía**. Estas dos filas se
-- crearon el 8-jul-2026 y ya se estaban restando en enero–junio; da la
-- casualidad de que ahí sí correspondía. El que Daniel cargue en octubre no
-- puede aparecer restado en marzo, y para eso está `desde`. `hasta` es
-- OPCIONAL y lo normal es dejarlo vacío: un descuento indefinido es la regla,
-- no la excepción.
--
-- LA REGLA (módulo puro `src/lib/comisiones/vigencia.ts`, un solo lugar):
--   · `desde` = primer mes que lo lleva. NULL = desde siempre, que es la
--     conducta de hasta hoy: una fila sin fecha no cambia de comportamiento.
--   · `hasta` = último mes que lo lleva, **INCLUSIVE** — mismo criterio que el
--     «Hasta…» de Recordatorios, para no tener dos formas de leer una fecha
--     final en el mismo sistema. NULL = no termina.
--   · El grano es el MES: una fecha a mitad de mes cuenta por su mes.
--
-- ADITIVA: no borra ni cambia un solo monto, y sin ella el código sigue
-- funcionando exactamente como antes (`select("*")` y los campos ausentes se
-- leen como «sin límite»).
--
-- Candados: comisiones-descuentos-vigencia.test.ts
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE comision_descuentos_fijos ADD COLUMN IF NOT EXISTS desde date;
ALTER TABLE comision_descuentos_fijos ADD COLUMN IF NOT EXISTS hasta date;

-- «Hasta» antes que «Desde» no es una fila a medias: no existe.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'comision_descuentos_fijos_vigencia'
      AND conrelid = 'comision_descuentos_fijos'::regclass
  ) THEN
    ALTER TABLE comision_descuentos_fijos
      ADD CONSTRAINT comision_descuentos_fijos_vigencia
      CHECK (desde IS NULL OR hasta IS NULL OR hasta >= desde);
  END IF;
END $$;

COMMENT ON COLUMN comision_descuentos_fijos.desde IS
  'Primer mes que lleva el descuento (el día no importa: el grano es el mes). '
  'NULL = desde siempre, que es como se comportaban las filas antes del 6-sep-2026.';
COMMENT ON COLUMN comision_descuentos_fijos.hasta IS
  'Último mes que lleva el descuento, INCLUSIVE (mismo criterio que el «Hasta…» '
  'de Recordatorios). NULL = no termina, y es lo NORMAL: un descuento indefinido '
  'es la regla, no la excepción (Daniel, 6-sep-2026: «el descuento es indefinido. '
  'No hay hasta.»).';

-- Las dos filas vivas arrancan en ENERO 2026 y NO terminan (Daniel, 6-sep-2026:
-- «el descuento es indefinido. No hay hasta. Ponlo desde enero»). Se escribe por
-- (vendedor, empresa, concepto) y no por id: es la llave única de la tabla y no
-- depende de un uuid copiado a mano. Solo toca las que todavía no tienen fecha,
-- para que repetir la migración no pise una decisión posterior. `hasta` se deja
-- como está (NULL): no se escribe, para no inventarle un fin a lo que no lo tiene.
UPDATE comision_descuentos_fijos
SET desde = DATE '2026-01-01', updated_at = now()
WHERE desde IS NULL
  AND empresa_key = 'fashion_shoes'
  AND vendedor_nombre = 'REYNALDO ESPINOSA'
  AND concepto IN ('Descuento', 'Descuento de adelanto');

NOTIFY pgrst, 'reload schema';
