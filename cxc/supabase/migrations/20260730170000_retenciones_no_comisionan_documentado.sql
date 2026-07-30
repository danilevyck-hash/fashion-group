-- ═════════════════════════════════════════════════════════════════════════════
-- Retenciones de ITBMS: bajan la deuda, NO pagan comisión — REGLA DOCUMENTADA
-- ═════════════════════════════════════════════════════════════════════════════
-- Decisión de Daniel (30-jul-2026), cerrada:
--   Una retención BAJA LA DEUDA del cliente pero NO PAGA COMISIÓN. Es plata que
--   el cliente le entrega al Estado en nombre nuestro; a nuestra cuenta no entró
--   nada, así que no hay cobro que comisionar.
--   Magnitud medida: ~4.211 USD en julio 2026 sólo en Fashion Wear.
--   (Sin signo de moneda a propósito: el SQL Editor de Supabase empareja un
--    dolar suelto de los comentarios con el de apertura del bloque dollar-quoted
--    y revienta con "syntax error at or near DECLARE".)
--
-- ⚠️ ESTA MIGRACIÓN NO CAMBIA NINGÚN NÚMERO. Es documentación pura.
--
-- La auditoría del 30-jul-2026 buscó las bases de cobro que había que corregir y
-- encontró que YA ESTABAN TODAS CORRECTAS: el filtro `AND r.es_retencion = false`
-- vive en el CTE de cobros de comision_b2b_v3/v4/v5 y de comision_b2b_detalle
-- (las dos versiones) desde que cada una nació — 20260604010000 en adelante, o
-- sea desde el mismo día en que se creó el flag (20260604000000). No hay ninguna
-- función de comisión, viva ni legacy, que sume retenciones a la base de cobro.
-- Bajo cualquier escenario de deriva entre este repo y la base (por ejemplo si
-- la DDL 20260724130000 nunca corrió y sigue viva la v1 del detalle) el filtro
-- está igual, porque las dos versiones lo tienen.
--
-- Por eso NO se recrean los cuerpos de las funciones: reescribir 100 líneas de
-- plpgsql que ya hacen lo correcto es todo riesgo y ningún beneficio. Lo que sí
-- faltaba es que la regla estuviera ESCRITA donde la ve el próximo que toque una
-- de estas funciones. Eso es lo que hace esta migración:
--   1. COMMENT ON COLUMN switch_recibos.es_retencion — la mitad de la regla que
--      se olvida (que el CXC SÍ tiene que ver la retención).
--   2. COMMENT ON FUNCTION sobre cada RPC de comisión que exista.
--
-- El candado que se pone rojo si alguien borra el filtro NO está acá (un COMMENT
-- no lo puede impedir): está en
--   src/__tests__/lib/comision-cobro-sin-retenciones.test.ts
--
-- LA OTRA MITAD DE LA REGLA — el CXC / aging / estado de cuenta NO se tocan.
-- La deuda del cliente SÍ baja con la retención; si el estado de cuenta la
-- ignorara le estaríamos cobrando dos veces al cliente. Sólo se excluye en la
-- base de COBRO de la comisión y en el "último pago" del CXC (que responde otra
-- pregunta: cuándo fue el último cobro REAL, ver switch_ultimo_pago_cliente_v2).
--
-- IDEMPOTENTE y sin cambios de firma: sólo COMMENT, y cada uno detrás de un
-- guard `to_regprocedure`/`to_regclass`, así que correrla dos veces —o correrla
-- en una base donde v3/v4 ya se dropearon— no falla ni cambia nada.
-- ═════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_regla_cobro constant text :=
    'BASE DE COBRO: excluye retenciones de ITBMS (switch_recibos.es_retencion = false). '
    'Regla de Daniel 30-jul-2026: la retención baja la deuda del cliente pero NO paga '
    'comisión — esa plata se la lleva el Estado, a nuestra cuenta no entró nada. '
    'También excluye el pseudo-cliente de mostrador (cliente_codigo = ''TCKCTA'') y la '
    'intercompañía (Multi Fashion Holding). NO quitar ninguno de los tres filtros: '
    'candado en src/__tests__/lib/comision-cobro-sin-retenciones.test.ts';
  v_firma text;
BEGIN
  IF to_regclass('public.switch_recibos') IS NOT NULL THEN
    COMMENT ON COLUMN switch_recibos.es_retencion IS
      'true = el recibo es una retención de ITBMS, no un cobro real (heurística determinista '
      'del sync: total ≈ impuesto/2 de una factura del mismo cliente dentro de ±35 días, con el '
      'mostrador TCKCTA excluido — ver src/lib/switch-api/sync-recibos.ts). '
      'DOS USOS OPUESTOS, no confundirlos: la BASE DE COBRO de la comisión y el "último pago" '
      'del CXC lo excluyen (no es plata que entró); el ESTADO DE CUENTA / aging NO lo usan, '
      'porque la deuda del cliente SÍ baja con la retención.';
  END IF;

  FOREACH v_firma IN ARRAY ARRAY[
    'comision_b2b_v5(text, int, int)',
    'comision_b2b_v4(text, int, int)',
    'comision_b2b_v3(text, int, int)',
    'comision_b2b_detalle(text, int, int, text)'
  ] LOOP
    IF to_regprocedure(v_firma) IS NOT NULL THEN
      EXECUTE format('COMMENT ON FUNCTION %s IS %L', v_firma, v_regla_cobro);
    END IF;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
