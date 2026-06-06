-- Drop de RPCs huerfanas confirmadas (25 nombres / 27 firmas, incl. 2 overloads).
-- IF EXISTS = idempotente: las ya dropeadas en migraciones previas son no-op.
-- NO se tocan trigger functions (set_updated_at, mk_*, refresh_wholesale_flag_*)
-- ni _empresa_nombre (dependencia viva de ventas). Sin CASCADE a proposito: si
-- alguna tuviera un dependiente inesperado preferimos que el DROP falle y revisar.
-- Correr ANTES las queries de verificacion: supabase/diagnostics/verify_orphan_rpcs_before_drop.sql

-- comisiones B2B (legacy v1..v3; la viva es comision_b2b_v4 + comision_b2b_detalle)
DROP FUNCTION IF EXISTS public.comision_b2b(text, integer, integer);
DROP FUNCTION IF EXISTS public.comision_b2b_v2(text, integer, integer);
DROP FUNCTION IF EXISTS public.comision_b2b_v3(text, integer, integer);

-- ventas ultima compra (RPC retirada)
DROP FUNCTION IF EXISTS public.get_ultima_compra();

-- multifashion bonos (v1, v2 legacy; la viva es v3)
DROP FUNCTION IF EXISTS public.multifashion_bonos_v1(integer, integer);
DROP FUNCTION IF EXISTS public.multifashion_bonos_v2(integer, integer);

-- multifashion detalle mensual (v1 legacy; la viva es v2)
DROP FUNCTION IF EXISTS public.multifashion_detalle_mensual_v1(integer, integer);

-- multifashion dia a dia (base legacy; v4 huerfana)
DROP FUNCTION IF EXISTS public.multifashion_dia_a_dia(integer, integer);
DROP FUNCTION IF EXISTS public.multifashion_dia_a_dia_v4(integer, integer);

-- multifashion mensual (base..v5 legacy; la viva es v6)
DROP FUNCTION IF EXISTS public.multifashion_mensual(integer, integer);
DROP FUNCTION IF EXISTS public.multifashion_mensual_v2(integer, integer);
DROP FUNCTION IF EXISTS public.multifashion_mensual_v3(integer, integer);
DROP FUNCTION IF EXISTS public.multifashion_mensual_v4(integer, integer);
DROP FUNCTION IF EXISTS public.multifashion_mensual_v5(integer, integer);

-- multifashion retail recurrentes -- OVERLOAD (2 firmas)
DROP FUNCTION IF EXISTS public.multifashion_retail_recurrentes(integer, integer);
DROP FUNCTION IF EXISTS public.multifashion_retail_recurrentes(date, date, integer);

-- multifashion vendedoras (v1, v2 legacy; la viva es v3)
DROP FUNCTION IF EXISTS public.multifashion_vendedoras(integer, text, integer, integer);
DROP FUNCTION IF EXISTS public.multifashion_vendedoras_v2(integer, text, integer, integer);

-- multifashion wholesale clientes -- OVERLOAD (2 firmas); la viva es v2
DROP FUNCTION IF EXISTS public.multifashion_wholesale_clientes(integer);
DROP FUNCTION IF EXISTS public.multifashion_wholesale_clientes(date, date);

-- cxc upload (RPC retirada)
DROP FUNCTION IF EXISTS public.save_cxc_upload(text, text, jsonb);

-- switch top articulos (se usa switch_top_descripciones, no esta)
DROP FUNCTION IF EXISTS public.switch_top_articulos(text, date, date, integer);

-- ventas meta sugerida (v1 legacy; la viva es v2)
DROP FUNCTION IF EXISTS public.ventas_meta_sugerida_v1(integer);

-- ventas proyeccion cierre (v1..v4 legacy; las vivas son v5/v6)
DROP FUNCTION IF EXISTS public.ventas_proyeccion_cierre_v1(integer);
DROP FUNCTION IF EXISTS public.ventas_proyeccion_cierre_v2(integer);
DROP FUNCTION IF EXISTS public.ventas_proyeccion_cierre_v3(integer);
DROP FUNCTION IF EXISTS public.ventas_proyeccion_cierre_v4(integer);
