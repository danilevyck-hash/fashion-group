-- Verificacion previa al drop de RPCs huerfanas.
-- Correr ESTAS 3 queries en el SQL Editor ANTES de aplicar
-- supabase/migrations/20260606110000_drop_orphan_rpcs.sql
-- NO modifican nada (solo SELECT).

-- =====================================================================
-- B1 -- Que existe realmente y con que firma.
-- Compara cada fila contra los DROP de la migracion: lo que aparezca debe
-- matchear una firma del drop; lo que NO aparezca ya estaba dropeado (no-op).
-- =====================================================================
SELECT p.proname AS funcion,
       pg_get_function_identity_arguments(p.oid) AS args,
       pg_get_function_result(p.oid) AS retorna
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'comision_b2b','comision_b2b_v2','comision_b2b_v3','get_ultima_compra',
    'multifashion_bonos_v1','multifashion_bonos_v2','multifashion_detalle_mensual_v1',
    'multifashion_dia_a_dia','multifashion_dia_a_dia_v4',
    'multifashion_mensual','multifashion_mensual_v2','multifashion_mensual_v3',
    'multifashion_mensual_v4','multifashion_mensual_v5',
    'multifashion_retail_recurrentes','multifashion_vendedoras','multifashion_vendedoras_v2',
    'multifashion_wholesale_clientes','save_cxc_upload','switch_top_articulos',
    'ventas_meta_sugerida_v1','ventas_proyeccion_cierre_v1','ventas_proyeccion_cierre_v2',
    'ventas_proyeccion_cierre_v3','ventas_proyeccion_cierre_v4'
  )
ORDER BY p.proname, args;

-- =====================================================================
-- B2 -- Red de seguridad: ninguna debe estar atada a un trigger.
-- DEBE devolver 0 filas. Si devuelve algo, NO dropear esa funcion.
-- =====================================================================
SELECT p.proname AS funcion, t.tgname AS trigger, c.relname AS tabla
FROM pg_trigger t
JOIN pg_proc p ON p.oid = t.tgfoid
JOIN pg_class c ON c.oid = t.tgrelid
WHERE NOT t.tgisinternal
  AND p.proname IN (
    'comision_b2b','comision_b2b_v2','comision_b2b_v3','get_ultima_compra',
    'multifashion_bonos_v1','multifashion_bonos_v2','multifashion_detalle_mensual_v1',
    'multifashion_dia_a_dia','multifashion_dia_a_dia_v4',
    'multifashion_mensual','multifashion_mensual_v2','multifashion_mensual_v3',
    'multifashion_mensual_v4','multifashion_mensual_v5',
    'multifashion_retail_recurrentes','multifashion_vendedoras','multifashion_vendedoras_v2',
    'multifashion_wholesale_clientes','save_cxc_upload','switch_top_articulos',
    'ventas_meta_sugerida_v1','ventas_proyeccion_cierre_v1','ventas_proyeccion_cierre_v2',
    'ventas_proyeccion_cierre_v3','ventas_proyeccion_cierre_v4'
  );

-- =====================================================================
-- B3 -- Red de seguridad: ninguna funcion VIVA las invoca en su cuerpo.
-- Idealmente 0 filas. Revisa manualmente cualquier fila que salga antes
-- de dropear (un llamador vivo significa que NO es huerfana real).
-- =====================================================================
SELECT p.proname AS llamador, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname NOT IN (
    'comision_b2b','comision_b2b_v2','comision_b2b_v3','get_ultima_compra',
    'multifashion_bonos_v1','multifashion_bonos_v2','multifashion_detalle_mensual_v1',
    'multifashion_dia_a_dia','multifashion_dia_a_dia_v4',
    'multifashion_mensual','multifashion_mensual_v2','multifashion_mensual_v3',
    'multifashion_mensual_v4','multifashion_mensual_v5',
    'multifashion_retail_recurrentes','multifashion_vendedoras','multifashion_vendedoras_v2',
    'multifashion_wholesale_clientes','save_cxc_upload','switch_top_articulos',
    'ventas_meta_sugerida_v1','ventas_proyeccion_cierre_v1','ventas_proyeccion_cierre_v2',
    'ventas_proyeccion_cierre_v3','ventas_proyeccion_cierre_v4'
  )
  AND p.prosrc ~* '\m(comision_b2b|comision_b2b_v2|comision_b2b_v3|get_ultima_compra|multifashion_dia_a_dia|multifashion_dia_a_dia_v4|multifashion_mensual|multifashion_mensual_v2|multifashion_mensual_v3|multifashion_mensual_v4|multifashion_mensual_v5|multifashion_bonos_v1|multifashion_bonos_v2|multifashion_detalle_mensual_v1|multifashion_retail_recurrentes|multifashion_vendedoras|multifashion_vendedoras_v2|multifashion_wholesale_clientes|save_cxc_upload|switch_top_articulos|ventas_meta_sugerida_v1|ventas_proyeccion_cierre_v1|ventas_proyeccion_cierre_v2|ventas_proyeccion_cierre_v3|ventas_proyeccion_cierre_v4)\M'
ORDER BY 1;
