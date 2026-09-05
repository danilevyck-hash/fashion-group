-- ─────────────────────────────────────────────────────────────────────────────
-- PRÉSTAMOS: DOS CUENTAS, EL TOPE DE UN SUELDO, Y LA PERSONA SALE DE ASISTENCIA.
--
-- Daniel definió el módulo entero el 5-sep-2026. Esta migración prepara la base
-- para eso, y su regla más importante es la que NO se ve:
--
--   🔴 NINGÚN SALDO CAMBIA. Medido contra producción ANTES de escribir una sola
--      línea: 14 personas con saldo, **$5.062,01** en total ($4.962,01 en 13
--      fichas activas más $100 de BRICEIDA MONTERO, archivada). Después de
--      correr esto tiene que dar exactamente lo mismo, persona por persona.
--
-- Lo que hace, en orden:
--   1. la segunda cuota (`deduccion_dano`) y la cuenta de cada movimiento;
--   2. de dónde salió la plata de un pago (`origen_pago`) — que además pasa a
--      ser la llave del freno de duplicados, en vez de un texto;
--   3. los DOS amarres que faltaban (MARTHA 43 · YERITZA 51) — $400 de deuda
--      viva que la planilla no puede descontar hoy;
--   4. el nombre, que pasa a salir de Asistencia;
--   5. las dos fichas de RAMON MIRANDA, que se juntan en una;
--   6. la RPC de la quincena, que ahora reparte en las dos cuentas y pregunta
--      por la persona en Asistencia en vez de por la bandera `activo`.
--
-- Aditiva: no borra una sola fila de plata (la ficha sobrante de Ramón se marca
-- `deleted`, sus movimientos se mudan) y no renombra ningún concepto.
--
-- 🔴 NO SE RENOMBRA NINGÚN CONCEPTO. La pantalla pasa a ofrecer tres —Préstamo,
-- Daño de mercancía, Pago— pero `Responsabilidad por daño` se sigue guardando
-- así, y `Abono extra` / `Pago de responsabilidad` conservan su nombre en las
-- 432 filas vivas. Un concepto renombrado no revienta ningún cálculo: **deja de
-- contarse en silencio**, que es exactamente el modo de fallo que este módulo
-- ya tiene documentado.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · DOS CUENTAS
--
-- Cada persona pasa a tener DOS deudas con su propia cuota quincenal: lo que se
-- le prestó y lo que se le cobra por mercancía dañada. El TOTAL no cambia: es
-- la misma suma de siempre, partida en dos.
--
-- `cuenta` queda NULL en los 443 movimientos que ya existen y se DERIVA del
-- concepto al leer (`cuentaDeMovimiento`, src/lib/prestamos-saldo.ts):
-- `Responsabilidad por daño` y `Pago de responsabilidad` son daño; todo lo
-- demás es préstamo. Se deja en NULL a propósito en vez de rellenarla: un
-- backfill sería una segunda definición de la misma regla, y el día que las dos
-- se separen nadie sabría cuál se le está cobrando a la gente.
--
-- ⚠️ Medido: con esa derivación, 13 de las 14 personas con saldo quedan con
-- TODA su deuda en «Préstamo» y cero en «Daño». El único caso cruzado es
-- STEPHANY MORALES (ficha archivada, saldo neto $0), que tiene sus pagos de
-- daño registrados como `Pago`: su cuenta Préstamo da −$254,50 y su cuenta Daño
-- +$254,50. **No se reasigna**: se respeta lo que alguien registró y la ficha lo
-- muestra como está.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE prestamos_empleados
  ADD COLUMN IF NOT EXISTS deduccion_dano numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN prestamos_empleados.deduccion_dano IS
  'La cuota quincenal de la cuenta DAÑO DE MERCANCÍA. La de préstamo sigue siendo deduccion_quincenal. Son dos cuentas separadas con su propia cuota; la planilla propone la SUMA de las dos en una sola casilla.';

ALTER TABLE prestamos_movimientos
  ADD COLUMN IF NOT EXISTS cuenta text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'prestamos_movimientos_cuenta_chk'
  ) THEN
    ALTER TABLE prestamos_movimientos
      ADD CONSTRAINT prestamos_movimientos_cuenta_chk
      CHECK (cuenta IS NULL OR cuenta IN ('prestamo', 'dano'));
  END IF;
END $$;

COMMENT ON COLUMN prestamos_movimientos.cuenta IS
  'A cuál de las dos cuentas pertenece este movimiento: prestamo | dano. NULL en todo lo anterior al 5-sep-2026: se deriva del concepto al leer (Responsabilidad por daño y Pago de responsabilidad son daño; el resto, préstamo). Un Pago SIEMPRE la trae escrita: baja UNA cuenta y hay que saber cuál.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · DE DÓNDE SALIÓ LA PLATA — Y EL FRENO DE DUPLICADOS DEJA DE LEER TEXTO
--
-- 🩸 El freno que impide registrar dos veces la deducción de la misma quincena
-- miraba si la NOTA empezaba con «Deducción quincenal». Medido el 5-sep-2026:
-- hay **18 filas vivas** escritas de otra forma —`DEDUCCION QUINCENAL ` ×8,
-- `DEDUCCION QUINCENAL` ×4, `DEDUCCION DE QUINCENA` ×3, `DESCUENTO QUINCENAL `,
-- `Pago quincenal`, `Descontar 25 por quincena `— y con ninguna de ellas ese
-- freno funciona: `ilike` no ignora los acentos, así que «DEDUCCION» no cruza
-- con «Deducción». El candado estaba apagado y nadie lo sabía.
--
-- Desde acá el freno mira `origen_pago` + la fecha. Y de paso se gana un dato
-- que hoy solo existe si alguien lo escribió a mano: **9 pagos reales salieron
-- de una liquidación, del décimo o de vacaciones**.
--
-- 🔑 NULL = «no se dijo», y se lee como Quincena (`esPagoDeQuincena`). Es lo
-- conservador: en la duda se omite, nunca se cobra dos veces.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE prestamos_movimientos
  ADD COLUMN IF NOT EXISTS origen_pago text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'prestamos_movimientos_origen_pago_chk'
  ) THEN
    ALTER TABLE prestamos_movimientos
      ADD CONSTRAINT prestamos_movimientos_origen_pago_chk
      CHECK (origen_pago IS NULL OR origen_pago IN ('Quincena', 'Décimo', 'Vacaciones', 'Liquidación', 'Efectivo'));
  END IF;
END $$;

COMMENT ON COLUMN prestamos_movimientos.origen_pago IS
  'De dónde salió la plata de un Pago: Quincena | Décimo | Vacaciones | Liquidación | Efectivo. NULL en lo anterior al 5-sep-2026 y se lee como Quincena. Es la llave del freno de duplicados de la deducción quincenal: antes era el TEXTO de la nota y 18 filas lo burlaban.';

CREATE INDEX IF NOT EXISTS prestamos_movimientos_dedup_idx
  ON prestamos_movimientos (empleado_id, fecha)
  WHERE concepto = 'Pago' AND estado = 'aprobado' AND coalesce(deleted, false) = false;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2b · LA BANDERA `activo` DE LA FICHA SE QUEDA SIN LECTORES (no se borra)
--
-- 🩸 Nunca significó «trabaja acá», aunque su nombre lo diga: significaba
-- «tiene algo abierto». Medido — a ESMER CRUZ le archivaron la ficha al
-- terminar de pagar sus $600 y **sigue trabajando**; a KENNER HERNANDEZ igual
-- tras pagar $3,13; a ELOYN, a JORMAN y a ROXANA HERNANDEZ lo mismo. El saldo
-- ya dice lo que la bandera intentaba decir, así que la lista muestra solo a
-- quien debe y quien llega a cero sale solo.
--
-- La columna NO se borra (patrón de la casa: una columna que se dropea se lleva
-- la historia con ella). Queda documentada y sin un solo lector, y hay un test
-- que pone el build ROJO si una migración futura la dropea.
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON COLUMN prestamos_empleados.activo IS
  'RETIRADA el 5-sep-2026: sin lectores. Nunca significó «trabaja acá» sino «tiene algo abierto» (a ESMER le archivaron la ficha al terminar de pagar y sigue trabajando). Quién trabaja lo dice asistencia_personas; quién debe lo dice el saldo. No se borra: la historia de quién archivó a quién vive en activity_logs y esta columna es su testigo.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · LOS DOS AMARRES QUE FALTABAN
--
-- 🔴 NADA SE ATA POR PARECIDO. NI ACÁ NI NUNCA. Es la misma regla —y el mismo
-- candado— de `20260902120000_prestamos_amarre_codigo.sql`: lista ESCRITA A
-- MANO, cada renglón con el nombre de Préstamos, la empresa, el código y el
-- nombre que ese código tiene que tener en Asistencia. Si el nombre del código
-- no es el esperado, la fila NO se escribe. El guard es de CONDUCTA, no un
-- comentario.
--
-- Los dos nacieron el 2 y el 4 de septiembre, DESPUÉS de aquella migración, y
-- son **$400 de deuda viva que la planilla no puede descontar hoy**:
--   MARTHA AZUCENA CHAVARRIA → 43 (MARTHA ASUCENA CHAVARRIA Z.)   $300
--   YERITZA Y. SOLIS CASTRO  → 51 (YERITZA YANETH SOLIS CASTRO)   $100
-- Confirmados por Daniel uno por uno. AZUCENA con Z y ASUCENA con S no cruzan
-- solas, y así tiene que ser.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE prestamos_empleados e
   SET empleado_codigo = l.codigo
  FROM (VALUES
    -- nombre en Préstamos          empresa                código  nombre en Asistencia
    ('MARTHA AZUCENA CHAVARRIA',    'Confecciones Boston', '43',  'MARTHA ASUCENA CHAVARRIA Z.'),
    ('YERITZA Y. SOLIS CASTRO',     'Confecciones Boston', '51',  'YERITZA YANETH SOLIS CASTRO')
  ) AS l(nombre, empresa, codigo, nombre_planilla)
 WHERE e.empleado_codigo IS NULL
   AND upper(btrim(e.nombre)) = l.nombre
   AND e.empresa              = l.empresa
   AND EXISTS (
     SELECT 1 FROM asistencia_personas p
      WHERE p.empleado_codigo = l.codigo
        AND upper(btrim(p.nombre)) = l.nombre_planilla
   );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4 · EL NOMBRE SALE DE ASISTENCIA
--
-- Daniel, textual: *«deberías de usar el nombre de asistencia para que todo
-- tenga coherencia»*. `prestamos_empleados.nombre` es texto libre que alguien
-- tecleó; `asistencia_personas.nombre` es la ficha del reloj, la que se imprime
-- en la planilla. Dos nombres para la misma persona son dos personas para
-- cualquiera que mire dos pantallas.
--
-- 🔑 SOLO donde el código ya ata a alguien: una ficha sin código no tiene de
-- dónde sacar el nombre y se queda con el suyo. Y solo se toca la columna
-- `nombre`, nunca otra.
--
-- Medido: cambian CINCO fichas — cuatro de contenido
--   LAURA CASIANI            → Laura Lismari Casiano Vega   (38)
--   MARIA BETHANCOURTH       → MARIA V. BETHANCOURTH G.     (49)
--   GABRIELA A. JARAMILLO P. → GABRIELA JARAMILLO           (53)
--   LUIS ADRIAN ARROYO       → LUIS ARROYO                  (9)
-- y una de mayúsculas: ROXANA HERNANDEZ → Roxana Hernandez  (1). Ninguna mueve
-- un centavo: el saldo cuelga del `id` de la ficha, no del nombre.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE prestamos_empleados e
   SET nombre = p.nombre
  FROM asistencia_personas p
 WHERE e.empleado_codigo IS NOT NULL
   AND p.empleado_codigo = e.empleado_codigo
   AND btrim(p.nombre) <> ''
   AND e.nombre IS DISTINCT FROM p.nombre;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5 · RAMON MIRANDA VUELVE A SER UNA SOLA PERSONA
--
-- Tiene DOS fichas con el mismo código 21 — la única duplicada del módulo — y
-- la archivada existe **solo porque le crearon una segunda ficha para poder
-- cobrarle un daño de $3,13**. Es exactamente el problema que las dos cuentas
-- vienen a resolver: ya no hace falta una ficha nueva para cobrar un daño.
--
-- 🔴 EL NÚMERO NO CAMBIA: $220,00 + $0,00 = **$220,00**. Los 2 movimientos de
-- la ficha vieja (un daño de $3,13 y su pago) se MUDAN a la ficha viva —no se
-- borran— y la ficha sobrante queda marcada `deleted`. Después de esto Ramón
-- tiene 36 movimientos en una sola ficha.
--
-- El guard: los ids van escritos, pero la migración solo escribe si las dos
-- fichas siguen siendo las que se midieron —mismo código 21, mismo nombre, y la
-- que se retira con saldo CERO—. Mover movimientos a la ficha equivocada movería
-- plata de una persona a otra sin dejar rastro.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_vieja uuid := '53dc4a3b-404b-4624-ac47-92bdaf85ef9d';
  v_viva  uuid := 'a8c69283-d44c-46cc-8337-b09ff9abac12';
  v_saldo_vieja numeric;
  v_ok boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM prestamos_empleados a, prestamos_empleados b
     WHERE a.id = v_vieja AND b.id = v_viva
       AND a.empleado_codigo = '21' AND b.empleado_codigo = '21'
       AND upper(btrim(a.nombre)) = upper(btrim(b.nombre))
       AND coalesce(b.deleted, false) = false
  ) INTO v_ok;

  SELECT coalesce(sum(
           CASE
             WHEN concepto IN ('Préstamo', 'Responsabilidad por daño') THEN monto
             WHEN concepto IN ('Pago', 'Abono extra', 'Pago de responsabilidad') THEN -monto
             ELSE 0
           END), 0)
    INTO v_saldo_vieja
    FROM prestamos_movimientos
   WHERE empleado_id = v_vieja
     AND estado = 'aprobado'
     AND coalesce(deleted, false) = false;

  IF v_ok AND v_saldo_vieja = 0 THEN
    UPDATE prestamos_movimientos SET empleado_id = v_viva WHERE empleado_id = v_vieja;
    UPDATE prestamos_empleados SET deleted = true WHERE id = v_vieja;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6 · LA QUINCENA, CON DOS CUENTAS Y PREGUNTÁNDOLE A ASISTENCIA QUIÉN TRABAJA
--
-- Qué cambia respecto de la versión del 4-sep-2026:
--
--   a) Aplica DOS descuentos cuando la persona debe las dos cuentas, cada uno
--      con su cuota y capeado a SU saldo. **Primero la cuenta más vieja**: la
--      deuda que se abrió antes se cobra antes.
--   b) Deja de mirar `prestamos_empleados.activo` —la bandera retirada— y
--      pregunta en `asistencia_personas` si la persona TRABAJA. Quien ya no
--      trabaja aparece en la lista con su saldo, marcado, pero **no se le
--      descuenta**: no hay sueldo del que descontar.
--   c) Una ficha SIN código no recibe descuento: no se sabe a quién pertenece.
--      Se dice en pantalla («préstamo sin persona atada»), no se adivina.
--   d) El dedup ya no mira `Abono extra` (plata de bolsillo, no del sueldo) y
--      distingue las dos cuentas: cobrarle el daño no puede tapar el préstamo.
--
-- Se conserva TAL CUAL: la ventana asimétrica `[inicio, fin + 3]` (sin
-- tolerancia al inicio: el pago del 15 no puede bloquear la quincena 16-fin), el
-- capeo al saldo en la última cuota, y que aplicar dos veces no cobre dos veces.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION prestamos_aplicar_quincena(
  p_quincena_start date,
  p_quincena_end   date,
  p_fecha          date
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
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
  v_saldo_prestamo numeric;
  v_saldo_dano numeric;
  v_desde_prestamo date;
  v_desde_dano date;
  v_monto numeric;
  v_ajustado boolean;
  v_ya_deducido boolean;
  v_trabaja boolean;
  v_hecho boolean;
  v_orden text[];
  v_cuenta text;
begin
  for r in
    select id, nombre, empleado_codigo,
           coalesce(deduccion_quincenal, 0) as cuota_prestamo,
           coalesce(deduccion_dano, 0)      as cuota_dano
    from prestamos_empleados
    where coalesce(deleted, false) = false
    order by nombre
  loop
    -- Las DOS cuentas, con la MISMA derivacion que usa la app
    -- (`cuentaDeMovimiento`, src/lib/prestamos-saldo.ts): la columna `cuenta`
    -- manda cuando esta escrita; si no, el concepto la decide.
    --
    -- 🔑 EL SIGNO Y LA CUENTA SE CALCULAN UNA VEZ, en la subconsulta, y cada
    -- movimiento cae en EXACTAMENTE UNA de las dos cuentas. Escribir las dos
    -- sumas por separado con sus propios `case` deja la puerta abierta a que un
    -- movimiento entre en las dos (y se cuente doble) o en ninguna.
    select
      coalesce(sum(case when c = 'prestamo' then s else 0 end), 0),
      coalesce(sum(case when c = 'dano'     then s else 0 end), 0),
      min(case when c = 'prestamo' and s > 0 then f end),
      min(case when c = 'dano'     and s > 0 then f end)
      into v_saldo_prestamo, v_saldo_dano, v_desde_prestamo, v_desde_dano
    from (
      select
        coalesce(
          cuenta,
          case when concepto in ('Responsabilidad por daño', 'Pago de responsabilidad')
               then 'dano' else 'prestamo' end
        ) as c,
        case when concepto in ('Préstamo', 'Responsabilidad por daño') then monto
             when concepto in ('Pago', 'Abono extra', 'Pago de responsabilidad') then -monto
             else 0 end as s,
        fecha::date as f
      from prestamos_movimientos
      where empleado_id = r.id
        and estado = 'aprobado'
        and coalesce(deleted, false) = false
    ) t;

    if coalesce(v_saldo_prestamo, 0) <= 0 and coalesce(v_saldo_dano, 0) <= 0 then
      v_omitidos := v_omitidos || jsonb_build_object('empleado_id', r.id, 'nombre', r.nombre, 'razon', 'saldo 0');
      v_count_omitidos := v_count_omitidos + 1;
      continue;
    end if;

    -- ¿Trabaja? Lo dice Asistencia, nunca la bandera de la ficha. Sin código no
    -- se sabe de quién es el préstamo: tampoco se le descuenta a nadie.
    if r.empleado_codigo is null or btrim(r.empleado_codigo) = '' then
      v_omitidos := v_omitidos || jsonb_build_object('empleado_id', r.id, 'nombre', r.nombre, 'razon', 'sin persona atada');
      v_count_omitidos := v_count_omitidos + 1;
      continue;
    end if;

    select exists(
      select 1 from asistencia_personas p
       where p.empleado_codigo = r.empleado_codigo
         and coalesce(p.activo, true) = true
         and (p.fecha_salida is null or p.fecha_salida >= p_fecha)
    ) into v_trabaja;

    if not v_trabaja then
      v_omitidos := v_omitidos || jsonb_build_object('empleado_id', r.id, 'nombre', r.nombre, 'razon', 'ya no trabaja');
      v_count_omitidos := v_count_omitidos + 1;
      continue;
    end if;

    -- Dedup: ya tiene un Pago de QUINCENA aprobado dentro de la ventana.
    -- 🔴 Se mira el ORIGEN, nunca el texto de la nota (18 filas lo burlaban).
    -- `Abono extra` queda fuera: es plata del bolsillo, no del sueldo.
    select exists(
      select 1
      from prestamos_movimientos
      where empleado_id = r.id
        and estado = 'aprobado'
        and coalesce(deleted, false) = false
        and concepto = 'Pago'
        and coalesce(origen_pago, 'Quincena') = 'Quincena'
        and (fecha::date) >= v_tol_start
        and (fecha::date) <= v_tol_end
    ) into v_ya_deducido;

    if v_ya_deducido then
      v_omitidos := v_omitidos || jsonb_build_object('empleado_id', r.id, 'nombre', r.nombre, 'razon', 'ya deducido');
      v_count_omitidos := v_count_omitidos + 1;
      continue;
    end if;

    -- Primero la cuenta MÁS VIEJA. Sin fechas, préstamo primero (desempate
    -- estable: nunca el azar del orden en que salieron las filas).
    if v_desde_dano is not null
       and (v_desde_prestamo is null or v_desde_dano < v_desde_prestamo) then
      v_orden := array['dano', 'prestamo'];
    else
      v_orden := array['prestamo', 'dano'];
    end if;

    v_hecho := false;
    foreach v_cuenta in array v_orden loop
      if v_cuenta = 'prestamo' then
        if coalesce(v_saldo_prestamo, 0) <= 0 or r.cuota_prestamo <= 0 then continue; end if;
        v_ajustado := r.cuota_prestamo > v_saldo_prestamo;
        v_monto := least(r.cuota_prestamo, v_saldo_prestamo);
      else
        if coalesce(v_saldo_dano, 0) <= 0 or r.cuota_dano <= 0 then continue; end if;
        v_ajustado := r.cuota_dano > v_saldo_dano;
        v_monto := least(r.cuota_dano, v_saldo_dano);
      end if;

      insert into prestamos_movimientos (empleado_id, fecha, concepto, monto, notas, estado, cuenta, origen_pago)
      values (
        r.id,
        p_fecha,
        'Pago',
        v_monto,
        case when v_ajustado then 'Deducción quincenal (ajustada al saldo)' else 'Deducción quincenal' end,
        'aprobado',
        v_cuenta,
        'Quincena'
      );

      v_aplicados := v_aplicados || jsonb_build_object(
        'empleado_id', r.id, 'nombre', r.nombre, 'monto', v_monto,
        'ajustado', v_ajustado, 'cuenta', v_cuenta
      );
      v_total := v_total + v_monto;
      v_hecho := true;
    end loop;

    if v_hecho then
      v_count_aplicados := v_count_aplicados + 1;
    else
      v_omitidos := v_omitidos || jsonb_build_object('empleado_id', r.id, 'nombre', r.nombre, 'razon', 'sin cuota');
      v_count_omitidos := v_count_omitidos + 1;
    end if;
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
