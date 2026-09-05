-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: la cartera de Boston recibe los MISMOS tramos finos que el grupo.
--
-- QUÉ SE MIDIÓ ANTES DE TOCAR NADA (5-sep-2026). La pregunta era si el dato
-- aguanta el corte: `switch_estadocuenta` de confecciones_boston tiene **985
-- documentos con saldo, los 985 con `dias` y con `fecha_creacion`**, en un
-- rango de 1 a 1.465 días. O sea: el reporte web que llena esta vista (cron
-- `boston-cartera`) SÍ trae la antigüedad documento por documento, y los tramos
-- 0-30 / 31-60 / 61-90 / 121-180 / 181-270 / 271-365 / +365 se pueden calcular
-- exactamente igual que los del grupo. No hay que inventar ningún bucket.
--
-- 🔴 LOS TRES TRAMOS QUE SE VEN NO CAMBIAN: siguen siendo 0-90 · 91-120 · 121+,
-- los mismos del grupo y las mismas cifras. Lo que se agrega es el DETALLE que
-- el grupo ya muestra al pasar el mouse por encima («0-30: $X · 31-60: $Y ·
-- 61-90: $Z»), que hasta hoy Boston no podía mostrar porque la vista no lo
-- calculaba. Ni un total se mueve: `d0_90 = d0_30 + d31_60 + d61_90` y
-- `d121_plus = d121_180 + d181_270 + d271_365 + mas_365` por construcción.
--
-- 🔴 BOSTON SIGUE APARTE. Esta vista lee SOLO `empresa_key = 'confecciones_boston'`
-- y no se toca ni una línea de `switch_estadocuenta_aging`, que es la del grupo
-- y la excluye. Las dos siguen siendo disjuntas por construcción.
--
-- ⚠️ Las columnas nuevas van AL FINAL: `CREATE OR REPLACE VIEW` exige conservar
-- el nombre, el tipo y el orden de las que ya estaban. Nada de lo que hoy lee
-- `d0_90 / d91_120 / d121_plus / total` se entera del cambio.
--
-- El código ya deployado es TOLERANTE a la ausencia de estas columnas (el
-- detalle no se dibuja y la pestaña se ve como hoy) — correr esta DDL cuando se
-- pueda, sin coordinar con el deploy.
--
-- Aplicar con: npm run migrar supabase/migrations/20260928120000_aging_boston_tramos_finos.sql
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW switch_estadocuenta_aging_boston AS
WITH sec AS (
  SELECT s.empresa_key,
         s.cliente_codigo,
         s.cliente_switch_id,
         s.cliente_nombre,
         s.dias,
         CASE
           WHEN s.tipo_comprobante = ANY (ARRAY['Nota de Crédito'::text, 'Recibo'::text, 'Recibo Saldo Anterior'::text]) THEN - COALESCE(s.saldo, 0::numeric)
           WHEN s.tipo_comprobante = ANY (ARRAY['Factura'::text, 'Nota de Débito'::text, 'Saldo Anterior'::text, 'Transacción'::text, 'Tiquete'::text]) THEN COALESCE(s.saldo, 0::numeric)
           ELSE 0::numeric
         END AS saldo_signed
    FROM switch_estadocuenta s
   WHERE COALESCE(s.saldo, 0::numeric) <> 0::numeric
     AND s.empresa_key = 'confecciones_boston'::text
)
SELECT md5((empresa_key || '|'::text) || COALESCE(cliente_codigo, ''::text))::uuid AS id,
       empresa_key AS company_key,
       cliente_codigo AS codigo,
       cliente_switch_id,
       COALESCE(cliente_nombre, cliente_codigo, ''::text) AS nombre,
       upper(regexp_replace(regexp_replace(COALESCE(cliente_nombre, cliente_codigo, ''::text), '[.,]'::text, ''::text, 'g'::text), '\s+'::text, ' '::text, 'g'::text)) AS nombre_normalized,
       COALESCE(sum(saldo_signed) FILTER (WHERE dias >= 0 AND dias <= 90), 0::numeric) AS d0_90,
       COALESCE(sum(saldo_signed) FILTER (WHERE dias >= 91 AND dias <= 120), 0::numeric) AS d91_120,
       COALESCE(sum(saldo_signed) FILTER (WHERE dias > 120), 0::numeric) AS d121_plus,
       COALESCE(sum(saldo_signed), 0::numeric) AS total,
       -- Los tramos finos, con los MISMOS cortes que `switch_estadocuenta_aging`.
       COALESCE(sum(saldo_signed) FILTER (WHERE dias >= 0 AND dias <= 30), 0::numeric) AS d0_30,
       COALESCE(sum(saldo_signed) FILTER (WHERE dias >= 31 AND dias <= 60), 0::numeric) AS d31_60,
       COALESCE(sum(saldo_signed) FILTER (WHERE dias >= 61 AND dias <= 90), 0::numeric) AS d61_90,
       COALESCE(sum(saldo_signed) FILTER (WHERE dias >= 121 AND dias <= 180), 0::numeric) AS d121_180,
       COALESCE(sum(saldo_signed) FILTER (WHERE dias >= 181 AND dias <= 270), 0::numeric) AS d181_270,
       COALESCE(sum(saldo_signed) FILTER (WHERE dias >= 271 AND dias <= 365), 0::numeric) AS d271_365,
       COALESCE(sum(saldo_signed) FILTER (WHERE dias > 365), 0::numeric) AS mas_365
  FROM sec
 GROUP BY empresa_key, cliente_codigo, cliente_switch_id, cliente_nombre
HAVING abs(COALESCE(sum(saldo_signed), 0::numeric)) >= 0.01;
