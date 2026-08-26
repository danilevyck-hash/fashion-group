-- ============================================================================
-- RLS en las 4 tablas que el Advisor de Supabase marcó CRÍTICAS (30-jul-2026)
--
-- Estaban en el esquema `public` SIN row level security, o sea legibles por
-- cualquiera que tenga la URL del proyecto y la clave anon — y la clave anon
-- viaja DENTRO del navegador: se ve abriendo las herramientas de desarrollador
-- en cualquier página pública (el catálogo de Tommy, un link de pedido). No
-- hace falta sesión ni contraseña.
--
-- Lo que quedaba a la vista:
--   switch_factura_utilidad ... costo, subtotal y UTILIDAD de cada factura
--   comision_vendedor_tasa ..... la tasa de comisión de cada vendedor
--   vendedores ................. el maestro de vendedores por empresa
--   mk_factura_marcas .......... marcas por factura (Marketing)
--
-- Daniel dio el OK el 30-jul-2026 tras verificar que no rompe nada.
--
-- ── POR QUÉ NO ROMPE NADA, medido antes de escribir esto ────────────────────
-- `service_role` SALTEA RLS por diseño de Postgres, así que una tabla con RLS
-- encendida y CERO políticas queda: invisible para anon, intacta para el
-- servidor. Se auditaron los 18 archivos que nombran estas 4 tablas:
--
--   * NINGUNO las lee desde el navegador. Los dos componentes de Comisiones
--     que dicen "vendedores" (ComisionesPorEmpresaView, ComisionesConsolidadoView)
--     usan ese nombre como CAMPO del JSON que les manda la API — cero llamadas
--     a Supabase en esos archivos.
--   * Los 16 del servidor van todos por `supabaseServer` (o por `mainDb`, que
--     en `lib/catalogo/marcas.ts:89` ES `supabaseServer`), o sea service role.
--
-- ⚠️ La trampa que hay que tener presente si algún día esto se toca:
-- `supabase-server.ts` cae al ANON si `SUPABASE_SERVICE_ROLE_KEY` falta en el
-- entorno. Con RLS encendida y sin esa variable, estas tablas devolverían
-- **[] EN SILENCIO** en vez de dar error — el mismo modo de fallo que ya está
-- documentado para `marca_formulas` y `carga_history`. Por eso existe
-- `HAS_SERVICE_ROLE`: los routes nuevos que lean estas tablas deberían
-- chequearlo y fallar ruidosamente en vez de mostrar la pantalla vacía.
--
-- ── POR QUÉ CERO POLÍTICAS Y NO UNA POLÍTICA `to service_role` ──────────────
-- Una política `USING (true) TO service_role` sería decorativa: service_role
-- ya saltea RLS antes de evaluarla. Escribirla daría la impresión falsa de que
-- el acceso del servidor DEPENDE de ella, y alguien podría "limpiarla" un día
-- creyendo que sobra. Cero políticas dice exactamente lo que pasa: nadie más
-- que el servidor entra.
--
-- Idempotente: ENABLE ROW LEVEL SECURITY sobre una tabla que ya la tiene no
-- da error. Cada ALTER va detrás de un guard de existencia para que la
-- migración no reviente si alguna tabla se retira en el futuro.
-- ============================================================================

DO $mig$
DECLARE
  t text;
  faltantes text[] := ARRAY[]::text[];
  tablas text[] := ARRAY[
    'switch_factura_utilidad',
    'comision_vendedor_tasa',
    'vendedores',
    'mk_factura_marcas'
  ];
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    IF to_regclass('public.' || quote_ident(t)) IS NULL THEN
      faltantes := faltantes || t;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    RAISE NOTICE 'RLS encendida en public.%', t;
  END LOOP;

  IF array_length(faltantes, 1) > 0 THEN
    RAISE NOTICE 'No existen (se omiten): %', array_to_string(faltantes, ', ');
  END IF;
END
$mig$;

-- Verificación: las 4 tienen que salir con rls_activa = true y politicas = 0.
SELECT
  c.relname                                        AS tabla,
  c.relrowsecurity                                 AS rls_activa,
  (SELECT count(*) FROM pg_policies p
     WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS politicas
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('switch_factura_utilidad','comision_vendedor_tasa','vendedores','mk_factura_marcas')
ORDER BY c.relname;
