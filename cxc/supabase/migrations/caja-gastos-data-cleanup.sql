-- One-shot cleanup of data that accumulated before the newer guards
-- existed. Runs once; safe to re-run (all operations are idempotent).

-- 1. Round itbms/total to 2 decimals. ~4 rows predated the Fix 3
--    server-side rounding (Globos, Fiesta, Platos, etc. with itbms
--    of 3+ decimal places: 1.085, 0.1575, ...).
UPDATE caja_gastos
   SET itbms = ROUND(itbms::numeric, 2),
       total = ROUND(total::numeric, 2)
 WHERE itbms IS NOT NULL AND (
         itbms <> ROUND(itbms::numeric, 2)
      OR total <> ROUND(total::numeric, 2)
       );

-- 2. Trim leading/trailing whitespace from proveedor. Original casing
--    is preserved on purpose — "REDNBLUES" stays uppercase, "super 99"
--    stays lowercase. If deduplication is desired later, that is a
--    separate normalization pass.
UPDATE caja_gastos
   SET proveedor = trim(proveedor)
 WHERE proveedor IS NOT NULL
   AND proveedor <> ''
   AND proveedor <> trim(proveedor);
