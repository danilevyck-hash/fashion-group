-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: EL CENTINELA DE TIPOS DE COMPROBANTE DE VENTA
--
-- ── QUE PROBLEMA CIERRA ─────────────────────────────────────────────────────
-- En mayo de 2025 Switch estreno el tipo «Transaccion» (reemplazo a «Tiquete»).
-- Alguien lo agrego a tiempo y no se perdio una sola venta -- POR SUERTE. Si
-- manana Switch inventa otro tipo, esa venta cae al `ELSE 0` de las 19 copias
-- del CASE que hay en las vistas de ventas y DESAPARECE DEL TABLERO sin una
-- sola alerta: no hay error, no suena nada, el total sale mas bajo y nadie se
-- entera.
--
-- En la CARTERA ese guard ya existia: `switch_estadocuenta_tipos_sin_clasificar`
-- (migracion 20260530000300) + el check diario `aging_tipos_sin_clasificar`.
-- En VENTAS no habia equivalente. Estas dos vistas son ese equivalente, calcadas
-- de aquella a proposito: mismo mecanismo, misma forma, mismo consumidor.
--
-- ── LAS DOS VISTAS VIGILAN RIESGOS OPUESTOS ─────────────────────────────────
-- 1. switch_facturas_tipos_sin_clasificar -- el `ELSE 0`: un tipo nuevo hace que
--    la venta valga CERO en los reportes. La plata DESAPARECE.
-- 2. switch_articulo_diario_tipos_sin_clasificar -- el caso contrario: ahi las
--    vistas hacen `CASE WHEN tipo = 'NC' THEN -x ELSE x END`, o sea que un
--    codigo nuevo SUMA sin permiso e infla costo y utilidad.
--    Los codigos conocidos: FA=Factura, TQ=Tiquete, CNF=Transaccion,
--    ND=Nota de Debito, NC=Nota de Credito.
--
-- La lista de tipos vive en UN solo lugar del codigo
-- (`src/lib/ventas/tipos-comprobante.ts`) y el test
-- `src/__tests__/lib/ventas-centinela-tipos.test.ts` lee ESTE archivo y exige
-- que digan lo mismo. Una lista paralela es la que un dia se aparta en silencio.
--
-- ── EL sync_type 'ventas_tipos' ─────────────────────────────────────────────
-- El centinela deja su propia fila en switch_sync_log por empresa y corrida
-- (success cuando esta limpio, error cuando aparece un tipo nuevo con plata).
-- Sin esa fila, la regla de "2 fallos seguidos" de alert-policy.ts no tendria
-- que medir y avisaria en la primera corrida, para siempre. Un CHECK no se
-- extiende: se reescribe entero, y por eso va en la MISMA migracion que lo
-- estrena -- que es justo lo que NO se hizo con catalogo_tommy ni con
-- articulo_marca, y por eso las dos corrieron invisibles durante meses.
--
-- ── LA APP FUNCIONA ANTES DE CORRER ESTO ────────────────────────────────────
-- Sin las vistas, el centinela lee un `42P01` (tabla ausente), lo trata como
-- "no pude medir", lo escribe en el log del cron y NO alerta ni tumba nada: el
-- sync de facturas corre exactamente igual. Sin el CHECK, `createSwitchSyncLog`
-- es degradable (devuelve logId null) y el centinela sigue midiendo.
-- No hay ventana ciega ni orden obligatorio con el deploy.
--
-- Migracion ADITIVA: crea dos vistas nuevas y reescribe un CHECK agregandole un
-- valor. NO toca una sola fila de datos.
--
-- Aplicar manual en Supabase Dashboard -> SQL Editor.
-- Evitar las ventanas de cron: 23:50-00:20 y 05:50-06:10 UTC.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. VENTAS: el tipo nuevo que valdria CERO ───────────────────────────────
CREATE OR REPLACE VIEW switch_facturas_tipos_sin_clasificar AS
SELECT
  empresa_key,
  tipo_comprobante,
  COUNT(*)                                                    AS filas,
  COUNT(*) FILTER (WHERE COALESCE(subtotal_descuento, 0) <> 0) AS filas_con_plata,
  COALESCE(SUM(subtotal_descuento), 0)                        AS suma_base,
  COALESCE(SUM(total), 0)                                     AS suma_total,
  MIN(fecha)                                                  AS primera,
  MAX(fecha)                                                  AS ultima
FROM switch_facturas
WHERE tipo_comprobante IS NULL
   OR tipo_comprobante NOT IN (
        'Factura', 'Tiquete', 'Transacción', 'Nota de Débito', 'Nota de Crédito'
      )
GROUP BY empresa_key, tipo_comprobante;

GRANT SELECT ON switch_facturas_tipos_sin_clasificar TO service_role;

-- ── 2. ARTICULOS: el codigo nuevo que sumaria sin permiso ───────────────────
CREATE OR REPLACE VIEW switch_articulo_diario_tipos_sin_clasificar AS
SELECT
  empresa_key,
  tipo,
  COUNT(*)                                              AS filas,
  COUNT(*) FILTER (WHERE COALESCE(venta_total, 0) <> 0) AS filas_con_plata,
  COALESCE(SUM(venta_total), 0)                         AS suma_venta,
  COALESCE(SUM(costo_total), 0)                         AS suma_costo,
  MIN(fecha)                                            AS primera,
  MAX(fecha)                                            AS ultima
FROM switch_articulo_diario
WHERE tipo IS NULL
   OR tipo NOT IN ('FA', 'TQ', 'CNF', 'ND', 'NC')
GROUP BY empresa_key, tipo;

GRANT SELECT ON switch_articulo_diario_tipos_sin_clasificar TO service_role;

-- ── 3. El sync_type del centinela ───────────────────────────────────────────
ALTER TABLE switch_sync_log DROP CONSTRAINT IF EXISTS switch_sync_log_sync_type_check;

ALTER TABLE switch_sync_log
  ADD CONSTRAINT switch_sync_log_sync_type_check
  CHECK (sync_type IN (
    'facturas',
    'estadocuenta',
    'costo',
    'utilidad',
    'recibos',
    'proveedores',
    'articulos',
    'articulo_marca',
    'articulo_info',
    'multifashion',
    'catalogo_reebok',
    'catalogo_joybees',
    'catalogo_tommy',
    'catalogo_calvin',
    'egresos_varios',
    'cuentas_contables',
    'factura_lineas',
    'ingresos_mercancia',
    'ventas_tipos',
    'mayor'
  ));

NOTIFY pgrst, 'reload schema';

-- ── Verificacion (correr despues) ───────────────────────────────────────────
--   -- 1. Las dos vistas VACIAS hoy (0 filas esperadas en las dos):
--   SELECT * FROM switch_facturas_tipos_sin_clasificar;
--   SELECT * FROM switch_articulo_diario_tipos_sin_clasificar;
--
--   -- 2. El centinela deja rastro (una fila por empresa por corrida):
--   SELECT empresa_key, status, started_at, records_skipped
--   FROM switch_sync_log
--   WHERE sync_type = 'ventas_tipos'
--   ORDER BY started_at DESC
--   LIMIT 20;
--
-- Si la 1 devuelve filas, hay un tipo que el tablero NO esta contando: se
-- clasifica agregandolo a src/lib/ventas/tipos-comprobante.ts, a las vistas de
-- ventas y a esta vista centinela, en una migracion nueva.
