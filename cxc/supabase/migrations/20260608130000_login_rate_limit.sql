-- Rate limit de login PERSISTENTE (reemplaza el Map en-memoria del route, que es
-- inefectivo en serverless: cada instancia tiene su propio Map y el atacante rota
-- entre instancias). Cuenta intentos FALLIDOS por IP; al alcanzar p_max fallos
-- dentro de la ventana, bloquea la IP por p_lockout_secs (lockout). Un login
-- exitoso limpia el contador de esa IP.
--
-- Aditivo: tabla nueva + 2 funciones. No toca auth existente.

create table if not exists login_attempts (
  ip            text primary key,
  fail_count    integer     not null default 0,
  first_fail_at timestamptz,
  locked_until  timestamptz,
  updated_at    timestamptz not null default now()
);

alter table login_attempts enable row level security;
-- Sin policies: solo el service_role (server) accede; nadie mas.

-- Registra un intento fallido de forma ATOMICA (select ... for update) y devuelve
-- si la IP queda bloqueada y cuantos segundos faltan. Ventana deslizante: si el
-- primer fallo es mas viejo que p_window_secs, reinicia el contador.
create or replace function register_login_failure(
  p_ip           text,
  p_max          integer,
  p_window_secs  integer,
  p_lockout_secs integer
) returns table (locked boolean, retry_after integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now   timestamptz := now();
  v_count integer;
  v_first timestamptz;
  v_locked timestamptz;
begin
  select fail_count, first_fail_at, locked_until
    into v_count, v_first, v_locked
  from login_attempts where ip = p_ip for update;

  if not found then
    insert into login_attempts (ip, fail_count, first_fail_at, updated_at)
    values (p_ip, 1, v_now, v_now);
    return query select false, 0;
    return;
  end if;

  -- Ya bloqueada: no incrementamos, solo informamos el tiempo restante.
  if v_locked is not null and v_locked > v_now then
    return query select true, ceil(extract(epoch from (v_locked - v_now)))::integer;
    return;
  end if;

  -- Ventana expirada -> reiniciar contador.
  if v_first is null or v_first < v_now - make_interval(secs => p_window_secs) then
    v_count := 0;
    v_first := v_now;
  end if;

  v_count := v_count + 1;

  if v_count >= p_max then
    v_locked := v_now + make_interval(secs => p_lockout_secs);
    update login_attempts
       set fail_count = v_count, first_fail_at = v_first,
           locked_until = v_locked, updated_at = v_now
     where ip = p_ip;
    return query select true, p_lockout_secs;
  else
    update login_attempts
       set fail_count = v_count, first_fail_at = v_first,
           locked_until = null, updated_at = v_now
     where ip = p_ip;
    return query select false, 0;
  end if;
end;
$$;

-- Limpia el contador de una IP (tras un login exitoso).
create or replace function clear_login_attempts(p_ip text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from login_attempts where ip = p_ip;
$$;

grant execute on function register_login_failure(text, integer, integer, integer) to service_role;
grant execute on function clear_login_attempts(text) to service_role;
