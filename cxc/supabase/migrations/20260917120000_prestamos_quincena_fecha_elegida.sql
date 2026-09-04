-- prestamos_aplicar_quincena — la fecha de pago la elige contabilidad (3-sep-2026)
--
-- POR QUE. El boton "Aplicar quincena (N)" existia desde junio y NUNCA se uso
-- (cero prestamo_aplicar_quincena en activity_logs): escribia la fecha de HOY,
-- y contabilidad registra 1-4 dias despues del pago (el 1-sep registro la
-- quincena del 30-ago). Ahora el endpoint manda la fecha ELEGIDA y deriva de
-- ella la quincena del dedup. Daniel aprobo: preguntar la fecha, proponiendo
-- el 15 o el fin de mes.
--
-- QUE CAMBIA AQUI (mismo nombre, misma firma; solo la ventana del dedup):
--   ANTES  [p_quincena_start - 3, p_quincena_end + 3]
--   AHORA  [p_quincena_start,     p_quincena_end + 3]
--
-- Los 3 dias de tolerancia al INICIO estaban pensados para el flujo viejo
-- (fecha = hoy, que podia caer unos dias despues del cierre de la quincena).
-- Con la fecha elegida son un agujero: el pago del 15 queda a un dia del
-- inicio de la quincena 16-fin (16 - 3 = 13), asi que aplicar la quincena del
-- 31 omitiria como "ya deducido" a TODO el que cobro el 15 — el lote no le
-- aplicaria a nadie. Medido contra produccion: las 6 quincenas jun-ago se
-- guardaron con fecha exacta de dia de pago (15 y 30), ninguna corrida
-- drifteada, asi que recortar el inicio no destapa ningun doble cobro real.
--
-- La tolerancia al FINAL se queda: un pago individual registrado con fecha de
-- hoy 1-3 dias despues del cierre (el boton rapido del bottom sheet escribe
-- hoy) tiene que seguir contando como "ya deducido" de esa quincena — ante la
-- ambiguedad se OMITE (y la pantalla lo dice), nunca se cobra dos veces.
--
-- (Sin signos de moneda en comentarios: rompen el parser del SQL Editor.)

create or replace function prestamos_aplicar_quincena(
  p_quincena_start date,
  p_quincena_end date,
  p_fecha date
)
returns jsonb
language plpgsql
as $$
declare
  -- Dedup: sin tolerancia al inicio (el pago del 15 NO bloquea la quincena
  -- 16-fin); +3 dias al final (un registro drifteado de esa quincena si).
  v_tol_start date := p_quincena_start;
  v_tol_end   date := p_quincena_end + 3;
  v_aplicados jsonb := '[]'::jsonb;
  v_omitidos  jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_count_aplicados int := 0;
  v_count_omitidos int := 0;
  r record;
  v_saldo numeric;
  v_monto numeric;
  v_ajustado boolean;
  v_ya_deducido boolean;
begin
  for r in
    select id, nombre, deduccion_quincenal
    from prestamos_empleados
    where coalesce(activo, true) = true
      and coalesce(deduccion_quincenal, 0) > 0
    order by nombre
  loop
    -- Saldo del empleado: prestamos/responsabilidades menos pagos (aprobados, no borrados).
    select coalesce(sum(
             case
               when concepto in ('Préstamo', 'Responsabilidad por daño') then monto
               when concepto in ('Pago', 'Abono extra', 'Pago de responsabilidad') then -monto
               else 0
             end), 0)
      into v_saldo
    from prestamos_movimientos
    where empleado_id = r.id
      and estado = 'aprobado'
      and coalesce(deleted, false) = false;

    if v_saldo <= 0 then
      v_omitidos := v_omitidos || jsonb_build_object('empleado_id', r.id, 'nombre', r.nombre, 'razon', 'saldo 0');
      v_count_omitidos := v_count_omitidos + 1;
      continue;
    end if;

    -- Dedup: ya tiene Pago/Abono extra aprobado dentro de la ventana de la quincena ELEGIDA.
    select exists(
      select 1
      from prestamos_movimientos
      where empleado_id = r.id
        and estado = 'aprobado'
        and coalesce(deleted, false) = false
        and concepto in ('Pago', 'Abono extra')
        and (fecha::date) >= v_tol_start
        and (fecha::date) <= v_tol_end
    ) into v_ya_deducido;

    if v_ya_deducido then
      v_omitidos := v_omitidos || jsonb_build_object('empleado_id', r.id, 'nombre', r.nombre, 'razon', 'ya deducido');
      v_count_omitidos := v_count_omitidos + 1;
      continue;
    end if;

    -- Tope: capear a saldo en la ultima cuota.
    v_ajustado := r.deduccion_quincenal > v_saldo;
    v_monto := least(r.deduccion_quincenal, v_saldo);

    insert into prestamos_movimientos (empleado_id, fecha, concepto, monto, notas, estado)
    values (
      r.id,
      p_fecha,
      'Pago',
      v_monto,
      case when v_ajustado then 'Deducción quincenal (ajustada al saldo)' else 'Deducción quincenal' end,
      'aprobado'
    );

    v_aplicados := v_aplicados || jsonb_build_object(
      'empleado_id', r.id, 'nombre', r.nombre, 'monto', v_monto, 'ajustado', v_ajustado
    );
    v_total := v_total + v_monto;
    v_count_aplicados := v_count_aplicados + 1;
  end loop;

  return jsonb_build_object(
    'aplicados', v_aplicados,
    'omitidos', v_omitidos,
    'total', v_total,
    'count_aplicados', v_count_aplicados,
    'count_omitidos', v_count_omitidos
  );
end;
$$;
