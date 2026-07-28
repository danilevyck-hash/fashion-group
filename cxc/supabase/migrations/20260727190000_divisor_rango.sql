-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK del rango del DIVISOR en las 4 tablas de fórmulas de precio.
--
-- El precio del Depurador es TECHO(Costo CIF ÷ divisor) + extra. El divisor NO
-- es un porcentaje: es la fracción del precio que representa el costo. Para 30%
-- de margen se escribe 0.70.
--
-- 🩸 POR QUÉ (27-jul-2026): "TH Tommy Jeans" tenía divisor = 70 en vez de 0.70
-- desde el 29-jun. Los precios de esa marca salían 100 VECES MÁS BARATOS
-- (costo CIF $42 → $4 en vez de $63) y se descargaron 3 plantillas con ese
-- divisor (3-jul, 21-jul y 22-jul, 10 estilos / 828 unidades / $16.177,92 de
-- costo). La validación de las rutas solo pedía `divisor >= 0`.
--
-- EL RANGO (idéntico a src/lib/depurador/divisor.ts — si uno cambia, cambian
-- los dos; el test src/__tests__/lib/divisor-rango.test.ts compara ambos):
--   · 0            = SIN FÓRMULA. Válido y frecuente: es el default de la
--                    columna y el centinela que deja el precio vacío para que
--                    la secretaria lo ponga a mano, o que lo manda a
--                    `precio_fijo`. Hay filas reales apoyadas en esto.
--   · 0.10 … 1.00  = con fórmula. Techo 1.00 (arriba, el precio queda por
--                    debajo del costo). Piso 0.10 (abajo, el precio se dispara:
--                    0.07 en vez de 0.7 daría 10× el costo). El margen más
--                    agresivo que el negocio usó nunca es 0.63, así que el piso
--                    deja 6× de aire y no bloquea ninguna decisión real.
--
-- El código YA valida esto en el servidor y funciona con o sin esta migración.
-- El CHECK es el último freno: cubre cualquier escritura futura que no pase por
-- las rutas (script, consola de Supabase, SQL a mano).
--
-- Migración ADITIVA e IDEMPOTENTE. No borra datos.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Paso 1: corregir el dato malo ANTES de poner el CHECK ────────────────────
-- Si no, ALTER TABLE ... ADD CONSTRAINT falla con la fila de 70 adentro.
-- Un divisor > 1 es SIEMPRE un punto decimal olvidado: 70 → 0.70, 75 → 0.75.
-- Aprobado por Daniel para "TH Tommy Jeans" ("divisor deberia de ser 0.7").
-- El WHERE es defensivo: si la fila ya se corrigió a mano, esto no toca nada.
update marca_formulas
set divisor = divisor / 100,
    updated_at = now()
where divisor > 1
  and divisor / 100 between 0.1 and 1;

-- ── Paso 2: el CHECK, tabla por tabla ────────────────────────────────────────
-- `not valid` NO se usa a propósito: las 4 tablas tienen decenas de filas, no
-- millones, así que validar el histórico es instantáneo y deja el candado
-- cerrado de verdad desde el minuto uno.

alter table marca_formulas
  drop constraint if exists marca_formulas_divisor_rango;
alter table marca_formulas
  add constraint marca_formulas_divisor_rango
  check (divisor = 0 or (divisor >= 0.1 and divisor <= 1));

alter table marca_rubro_formulas
  drop constraint if exists marca_rubro_formulas_divisor_rango;
alter table marca_rubro_formulas
  add constraint marca_rubro_formulas_divisor_rango
  check (divisor = 0 or (divisor >= 0.1 and divisor <= 1));

alter table tienda_marca_formulas
  drop constraint if exists tienda_marca_formulas_divisor_rango;
alter table tienda_marca_formulas
  add constraint tienda_marca_formulas_divisor_rango
  check (divisor = 0 or (divisor >= 0.1 and divisor <= 1));

alter table tienda_rubro_formulas
  drop constraint if exists tienda_rubro_formulas_divisor_rango;
alter table tienda_rubro_formulas
  add constraint tienda_rubro_formulas_divisor_rango
  check (divisor = 0 or (divisor >= 0.1 and divisor <= 1));
