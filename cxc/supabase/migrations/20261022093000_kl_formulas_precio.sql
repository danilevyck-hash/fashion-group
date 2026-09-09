-- ─────────────────────────────────────────────────────────────────────────────
-- Fórmula de precio para las 9 marcas de Karl Lagerfeld (Active Wear).
-- Módulo: Plantilla Switch › Configuración › Fórmulas.
--
-- 🩸 EL PROBLEMA. `marca_formulas` tiene 22 filas y el catálogo de marcas tiene
-- 33 (`MARCAS_CATALOGO`, src/lib/depurador/logic.ts). Las 11 que faltan salen
-- SIN PRECIO en el Excel que se sube a Switch: el precio es
-- TECHO(Costo CIF ÷ divisor) + extra, y sin fila no hay divisor. Medido contra
-- producción el 8-sep-2026, las 11 son las 9 de Karl Lagerfeld más
-- `TH License` y `TH Display & Promo`.
--
-- LA DECISIÓN (Daniel, 8-sep-2026): opción «c» — `/0.8` SOLO a las 9 de Karl
-- Lagerfeld. `TH License` y `TH Display & Promo` se dejan para después, a
-- propósito: `TH License` lleva $158.464,45 facturados y su margen no está
-- decidido. Esta migración NO las toca.
--
-- LA FORMA sale de las 22 filas que ya existen: divisor `0.8`, `extra = 0`,
-- `redondeo = 'int'` (el CHECK de la tabla admite 'int' y 'half'; 'par' es de
-- Reebok, que no vive en esta tabla). El divisor NO es un porcentaje: es la
-- fracción del precio que representa el costo (0.8 = 20% de margen), y cae
-- dentro del CHECK `divisor = 0 or (divisor between 0.1 and 1)` de
-- `20260727190000_divisor_rango.sql`.
--
-- ⚠️ ANTES DE APLICARLA, DANIEL TIENE QUE MIRAR ESTO. Barrido del 8-sep-2026
-- contra `switch_articulo_info`: el inventario CON EXISTENCIA de Active Wear
-- son **21 artículos · 65 piezas**, y **10 de sus 13 descripciones son nombres
-- de modelo de REEBOK** («WOMEN BIG LOGO TEE», «RBK AFLEX CAP 2.0»,
-- «ID TRAIN SS TECH TEE», «basketball ball»…), no categorías de Karl Lagerfeld.
-- Solo 3 tienen forma de categoría CK/TH/KL (Women-Bags, Men-Socks Sport,
-- Women-Small Leather). O sea: puede que lo que de verdad falte en Active Wear
-- no sea la fórmula de KL. Poner el 0.8 no rompe nada de lo que hoy funciona
-- —hoy esas 9 marcas no tienen precio— pero tampoco es obvio que sea la
-- pregunta correcta.
--
-- Migración ADITIVA e IDEMPOTENTE: `on conflict do nothing` no pisa ninguna
-- fila existente. No borra ni cambia un solo dato de las 22 que ya están.
-- ─────────────────────────────────────────────────────────────────────────────

insert into marca_formulas (marca, empresa, divisor, extra, redondeo) values
  ('KL Accessories',     'Active Wear', 0.8, 0, 'int'),
  ('KL Display & Promo', 'Active Wear', 0.8, 0, 'int'),
  ('KL Footwear',        'Active Wear', 0.8, 0, 'int'),
  ('KL Jeans',           'Active Wear', 0.8, 0, 'int'),
  ('KL Legwear',         'Active Wear', 0.8, 0, 'int'),
  ('KL Menswear',        'Active Wear', 0.8, 0, 'int'),
  ('KL Other',           'Active Wear', 0.8, 0, 'int'),
  ('KL Underwear',       'Active Wear', 0.8, 0, 'int'),
  ('KL Womenswear',      'Active Wear', 0.8, 0, 'int')
on conflict do nothing;
