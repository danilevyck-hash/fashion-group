-- prestamos_aplicar_quincena
-- Aplica la deduccion quincenal a TODOS los empleados elegibles en una sola
-- transaccion (atomica): un Pago por empleado, idempotente por quincena.
--
-- Elegibilidad: activo, deduccion_quincenal > 0, saldo > 0, y SIN una deduccion
-- ya registrada en la quincena vigente (dedup server-side con tolerancia de 3
-- dias, igual que hasDeduccionEnQuincena del cliente).
--
-- Tope ultima cuota: si la deduccion supera el saldo, se capea al saldo y se
-- marca la nota como "ajustada al saldo" (cierra el prestamo limpio).
--
-- Devuelve un resumen jsonb: aplicados[], omitidos[{razon}], total y conteos.
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
  v_tol_start date := p_quincena_start - 3;
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

    -- Dedup: ya tiene Pago/Abono extra aprobado dentro de la ventana de quincena (con tolerancia).
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
