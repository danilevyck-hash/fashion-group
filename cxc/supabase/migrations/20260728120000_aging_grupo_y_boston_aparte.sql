-- ─────────────────────────────────────────────────────────────────────────────
-- switch_estadocuenta_aging = CARTERA DEL GRUPO (excluye confecciones_boston)
-- switch_estadocuenta_aging_boston = la cartera de Boston, aparte
--
-- ─── POR QUÉ ────────────────────────────────────────────────────────────────
-- Desde hoy `confecciones_boston` sincroniza su estado de cuenta a
-- `switch_estadocuenta` (capability `estadoCuenta: true`) para que Daniel pueda
-- VER su cartera. Pero su plata NO es del grupo (`cxc: false`): se lleva por
-- fuera, en Brand It. Regla de Daniel, textual:
--   "si un cliente esta en el grupo de 6 empresas y mismo cliente en conf
--    boston, quiero q no se toque"
-- Si le debe $10.000 al grupo y $4.000 a Boston, en ningún lado puede salir
-- $14.000: $10.000 en la pestaña del grupo y $4.000 en la de Boston.
--
-- ─── POR QUÉ ACÁ Y NO EN CADA PANTALLA ──────────────────────────────────────
-- Unas 20 rutas leen esta vista (o su MV): el CXC consolidado, la búsqueda
-- global, Vista General, la ficha de cliente, cxc-summary, cxc-rows, los
-- correos de estado de cuenta, /api/clients... Blindar 20 sitios uno por uno
-- deja la garantía a cargo de que nadie se olvide, y la pantalla 21 que alguien
-- escriba mañana nace insegura. Acá se cierra UNA vez, por construcción: la
-- vista ES la definición de "cartera del grupo", así que todo lo que la lea
-- queda separado sin tener que enterarse.
--
-- El peligro concreto NO es teórico y NO se ve mirando códigos de cliente:
-- Boston usa ids numéricos de Switch (1, 112, 132060) y las 6 B2B el esquema
-- D-XXX, así que por código el cruce es CERO. Pero esta vista agrupa por
-- `nombre_normalized` y el CXC consolida por NOMBRE. Medido el 27-jul-2026
-- cruzando los 1.940 clientes de Boston contra los 127 con saldo del grupo:
-- **10 clientes existen en los dos lados** — CITY MALL DAVID, CITY MALL PASO
-- CANOA, LA FRONTERA DUTY FREE, JERUSALEM DUTY FREE, WOLF MALL CENTER INT,
-- GOLDEN MALL, EL MACHETAZO-CALIDONIA, ALADDIN, CENTRO DOLLAR 123 RIFAT y
-- VENTAS. Malls y duty-free: los que le compran a varias empresas a la vez.
--
-- ─── LA LISTA DE EXCLUIDAS ──────────────────────────────────────────────────
-- Una vista SQL no puede importar TypeScript, así que las keys se repiten acá.
-- Eso es exactamente el patrón que causó el agujero de joystep (listas paralelas
-- que se contradicen en silencio), así que NO queda suelto:
-- `boston-no-se-mezcla.test.ts` lee ESTE archivo, extrae la lista y la compara
-- contra `empresasCarteraAparte()`. Agregar una empresa de un lado y no del otro
-- pone el build ROJO.
--
-- ─── LO QUE NO CAMBIA ───────────────────────────────────────────────────────
-- El cuerpo de la vista del grupo es IDÉNTICO a 20260530000300 (signo defensivo,
-- buckets, JOIN clientes_master, HAVING). Lo único que se agrega es el WHERE de
-- empresa. Las 6 empresas del grupo no mueven un centavo: hoy Boston tiene 0
-- filas en switch_estadocuenta, así que el total sigue siendo $3.583.051,22
-- (medido 27-jul-2026, 219 filas cliente-empresa) ANTES y DESPUÉS de esta
-- migración. La verificación de abajo lo comprueba.
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══ 1. CARTERA DEL GRUPO ════════════════════════════════════════════════════
CREATE OR REPLACE VIEW switch_estadocuenta_aging AS
WITH sec AS (
  SELECT
    s.empresa_key,
    s.cliente_codigo,
    s.cliente_switch_id,
    s.dias,
    s.tipo_comprobante,
    CASE
      WHEN s.tipo_comprobante IN ('Nota de Crédito', 'Recibo', 'Recibo Saldo Anterior')
        THEN -COALESCE(s.saldo, 0)
      WHEN s.tipo_comprobante IN ('Factura', 'Nota de Débito', 'Saldo Anterior', 'Transacción', 'Tiquete')
        THEN  COALESCE(s.saldo, 0)
      ELSE 0
    END AS saldo_signed
  FROM switch_estadocuenta s
  WHERE COALESCE(s.saldo, 0) <> 0
    -- ⛔ CARTERA APARTE — no es del grupo, no se suma acá. Ver el encabezado.
    AND s.empresa_key NOT IN ('confecciones_boston')
)
SELECT
  md5(sec.empresa_key || '|' || COALESCE(sec.cliente_codigo, ''))::uuid AS id,
  NULL::uuid                                AS upload_id,
  sec.empresa_key                           AS company_key,
  sec.cliente_codigo                        AS codigo,
  m.id                                      AS cliente_id,
  COALESCE(m.nombre, sec.cliente_codigo)    AS nombre,
  COALESCE(m.nombre_normalized,
           upper(regexp_replace(regexp_replace(COALESCE(sec.cliente_codigo, ''), '[.,]', '', 'g'), '\s+', ' ', 'g')))
                                            AS nombre_normalized,
  COALESCE(m.email, '')                     AS correo,
  COALESCE(m.telefono, '')                  AS telefono,
  COALESCE(m.celular, '')                   AS celular,
  ''::text                                  AS contacto,
  'Panamá'::text                            AS pais,
  COALESCE(m.provincia, '')                 AS provincia,
  ''::text                                  AS distrito,
  ''::text                                  AS corregimiento,
  0::numeric                                AS limite_credito,
  0::numeric                                AS limite_morosidad,
  COALESCE(SUM(sec.saldo_signed) FILTER (WHERE sec.dias BETWEEN   0 AND  30), 0) AS d0_30,
  COALESCE(SUM(sec.saldo_signed) FILTER (WHERE sec.dias BETWEEN  31 AND  60), 0) AS d31_60,
  COALESCE(SUM(sec.saldo_signed) FILTER (WHERE sec.dias BETWEEN  61 AND  90), 0) AS d61_90,
  COALESCE(SUM(sec.saldo_signed) FILTER (WHERE sec.dias BETWEEN  91 AND 120), 0) AS d91_120,
  COALESCE(SUM(sec.saldo_signed) FILTER (WHERE sec.dias BETWEEN 121 AND 180), 0) AS d121_180,
  COALESCE(SUM(sec.saldo_signed) FILTER (WHERE sec.dias BETWEEN 181 AND 270), 0) AS d181_270,
  COALESCE(SUM(sec.saldo_signed) FILTER (WHERE sec.dias BETWEEN 271 AND 365), 0) AS d271_365,
  COALESCE(SUM(sec.saldo_signed) FILTER (WHERE sec.dias > 365), 0)               AS mas_365,
  COALESCE(SUM(sec.saldo_signed), 0)                                             AS total
FROM sec
LEFT JOIN clientes_master m
  ON m.codigo = sec.cliente_codigo
 AND m.deleted = false
GROUP BY
  sec.empresa_key,
  sec.cliente_codigo,
  sec.cliente_switch_id,
  m.id, m.nombre, m.nombre_normalized,
  m.email, m.telefono, m.celular, m.provincia
HAVING ABS(COALESCE(SUM(sec.saldo_signed), 0)) >= 0.01;

GRANT SELECT ON switch_estadocuenta_aging TO service_role;
GRANT SELECT ON switch_estadocuenta_aging TO authenticated;
GRANT SELECT ON switch_estadocuenta_aging TO anon;

-- ═══ 2. CARTERA DE BOSTON, APARTE ════════════════════════════════════════════
-- MISMA forma de fila que la del grupo (mismas columnas, mismos buckets, mismo
-- signo defensivo) para que la pestaña de Boston reuse los componentes del CXC
-- sin una segunda implementación del aging. La ÚNICA diferencia es qué empresa
-- entra — que es justamente lo que las mantiene separadas.
--
-- Ojo con el JOIN a clientes_master: los clientes de Boston NO están ahí
-- (`clientes_master` se puebla desde las empresas del grupo). El COALESCE cae
-- al `cliente_codigo`, que para Boston es el id numérico de Switch — ilegible.
-- Por eso esta vista usa `cliente_nombre`, que switch_estadocuenta SÍ guarda por
-- fila y para Boston es el nombre real del cliente.
CREATE OR REPLACE VIEW switch_estadocuenta_aging_boston AS
WITH sec AS (
  SELECT
    s.empresa_key,
    s.cliente_codigo,
    s.cliente_switch_id,
    s.cliente_nombre,
    s.dias,
    CASE
      WHEN s.tipo_comprobante IN ('Nota de Crédito', 'Recibo', 'Recibo Saldo Anterior')
        THEN -COALESCE(s.saldo, 0)
      WHEN s.tipo_comprobante IN ('Factura', 'Nota de Débito', 'Saldo Anterior', 'Transacción', 'Tiquete')
        THEN  COALESCE(s.saldo, 0)
      ELSE 0
    END AS saldo_signed
  FROM switch_estadocuenta s
  WHERE COALESCE(s.saldo, 0) <> 0
    AND s.empresa_key = 'confecciones_boston'
)
SELECT
  md5(sec.empresa_key || '|' || COALESCE(sec.cliente_codigo, ''))::uuid AS id,
  sec.empresa_key                        AS company_key,
  sec.cliente_codigo                     AS codigo,
  sec.cliente_switch_id                  AS cliente_switch_id,
  COALESCE(sec.cliente_nombre, sec.cliente_codigo, '') AS nombre,
  upper(regexp_replace(regexp_replace(COALESCE(sec.cliente_nombre, sec.cliente_codigo, ''), '[.,]', '', 'g'), '\s+', ' ', 'g'))
                                         AS nombre_normalized,
  COALESCE(SUM(sec.saldo_signed) FILTER (WHERE sec.dias BETWEEN   0 AND  90), 0) AS d0_90,
  COALESCE(SUM(sec.saldo_signed) FILTER (WHERE sec.dias BETWEEN  91 AND 120), 0) AS d91_120,
  COALESCE(SUM(sec.saldo_signed) FILTER (WHERE sec.dias > 120), 0)               AS d121_plus,
  COALESCE(SUM(sec.saldo_signed), 0)                                             AS total
FROM sec
GROUP BY
  sec.empresa_key, sec.cliente_codigo, sec.cliente_switch_id, sec.cliente_nombre
HAVING ABS(COALESCE(SUM(sec.saldo_signed), 0)) >= 0.01;

GRANT SELECT ON switch_estadocuenta_aging_boston TO service_role;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- Verificación post-aplicación:
--
--   -- 1. El grupo NO cambió (esperado 3583051.22, 219 filas — línea base
--   --    27-jul-2026, misma cifra de certificacion-switch-2026-07-27.md):
--   SELECT ROUND(SUM(total)::numeric, 2) AS total, COUNT(*) AS filas
--   FROM switch_estadocuenta_aging;
--
--   -- 2. Boston NO aparece en la del grupo (esperado 0):
--   SELECT COUNT(*) FROM switch_estadocuenta_aging
--   WHERE company_key = 'confecciones_boston';
--
--   -- 3. Boston en la suya (0 hasta que corra la carga inicial;
--   --    esperado después: 381 clientes / 399817.62):
--   SELECT COUNT(*) AS clientes, ROUND(SUM(total)::numeric, 2) AS total
--   FROM switch_estadocuenta_aging_boston;
--
--   -- 4. Ningún cliente compartido suma los dos lados. Esperado: cada fila
--   --    muestra los saldos SEPARADOS, y grupo + boston nunca en una sola cifra.
--   SELECT g.nombre_normalized,
--          ROUND(SUM(g.total)::numeric, 2) AS debe_al_grupo,
--          (SELECT ROUND(SUM(b.total)::numeric, 2)
--             FROM switch_estadocuenta_aging_boston b
--            WHERE b.nombre_normalized = g.nombre_normalized) AS debe_a_boston
--   FROM switch_estadocuenta_aging g
--   GROUP BY g.nombre_normalized
--   HAVING (SELECT COUNT(*) FROM switch_estadocuenta_aging_boston b
--            WHERE b.nombre_normalized = g.nombre_normalized) > 0;
-- ─────────────────────────────────────────────────────────────────────────────
