-- D11: monthly spend cap. Every paid call reserves here first; money is integer micro-dollars.

create function public.mes_de(p_ahora timestamptz) returns date
language sql stable set search_path = '' as $$
  -- The cap resets at midnight Chile time on the first of the month.
  select date_trunc('month', p_ahora at time zone 'America/Santiago')::date
$$;

-- «From this month on, this scope's cap is X». marca_id null is the global cap; a brand row with a null amount removes
-- that brand's sub-cap.
create table public.topes (
  id bigint generated always as identity primary key,
  marca_id uuid references public.marcas (id) on delete cascade,
  desde_mes date not null check (extract(day from desde_mes) = 1),
  monto_micro bigint check (monto_micro is null or monto_micro between 1000000 and 1000000000),
  puesto_por uuid references auth.users (id) on delete set null,
  puesto_en timestamptz not null default now(),
  constraint global_con_monto check (marca_id is not null or monto_micro is not null)
);
create unique index topes_uno_por_mes
  on public.topes (coalesce(marca_id, '00000000-0000-0000-0000-000000000000'::uuid), desde_mes);

-- US$40 from the start, until an owner changes it in Ajustes.
insert into public.topes (marca_id, desde_mes, monto_micro) values (null, '2000-01-01', 40000000);

create table public.gastos (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique check (length(clave) between 1 and 200),
  -- A deleted brand's spend still counts this month: it moves to «General».
  marca_id uuid references public.marcas (id) on delete set null,
  proveedor text not null check (proveedor in ('anthropic', 'voyage', 'gemini')),
  paso text not null check (length(btrim(paso)) between 1 and 60),
  mes date not null,
  -- US$1,000 per call at most: no sum of a month's rows can come near the bigint limit.
  estimado_micro bigint not null check (estimado_micro between 1 and 1000000000),
  real_micro bigint check (real_micro between 0 and 1000000000),
  estado text not null default 'reservado' check (estado in ('reservado', 'confirmado', 'sin_cobro', 'vencido')),
  creado_en timestamptz not null default now(),
  cerrado_en timestamptz,
  constraint real_al_confirmar check ((estado = 'confirmado') = (real_micro is not null))
);
create index gastos_que_cuentan on public.gastos (mes, marca_id) where estado in ('reservado', 'confirmado');
create index on public.gastos (marca_id);
create index on public.topes (marca_id);

-- One row per month, scope ('global' or a brand id) and threshold: each push goes out once.
create table public.avisos_de_tope (
  mes date not null,
  alcance text not null,
  umbral smallint not null check (umbral in (80, 100)),
  creado_en timestamptz not null default now(),
  primary key (mes, alcance, umbral)
);

create function public.tope_vigente(p_marca uuid, p_mes date) returns bigint
language sql stable set search_path = '' as $$
  select monto_micro from public.topes
  where marca_id is not distinct from p_marca and desde_mes <= p_mes
  order by desde_mes desc
  limit 1
$$;

-- A reservation counts at its estimate until confirmed; released and expired ones do not count.
create function public.gastado(p_mes date, p_marca uuid default null) returns bigint
language sql stable set search_path = '' as $$
  select coalesce(sum(coalesce(real_micro, estimado_micro)), 0)::bigint
  from public.gastos
  where mes = p_mes and estado in ('reservado', 'confirmado') and (p_marca is null or marca_id = p_marca)
$$;

-- Inserts the thresholds this scope crossed for the first time this month and returns them.
create function public.umbrales_de(p_mes date, p_marca uuid, p_frenado boolean) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_tope bigint := public.tope_vigente(p_marca, p_mes);
  v_gastado bigint := public.gastado(p_mes, p_marca);
  v_alcance text := coalesce(p_marca::text, 'global');
  v_avisos jsonb := '[]'::jsonb;
  v_umbral smallint;
begin
  if v_tope is null then
    return v_avisos;
  end if;
  foreach v_umbral in array array[80, 100]::smallint[] loop
    if v_gastado * 100 >= v_tope * v_umbral or (v_umbral = 100 and p_frenado) then
      insert into public.avisos_de_tope (mes, alcance, umbral) values (p_mes, v_alcance, v_umbral)
      on conflict do nothing;
      if found then
        v_avisos := v_avisos || jsonb_build_object(
          'alcance', v_alcance, 'umbral', v_umbral, 'gastado_micro', v_gastado, 'tope_micro', v_tope
        );
      end if;
    end if;
  end loop;
  return v_avisos;
end $$;

-- Optional parameters go last with `default null`, so the generated types make them optional (C1 pattern).
create function public.reservar_gasto(
  p_clave text, p_proveedor text, p_paso text, p_estimado_micro bigint,
  p_marca uuid default null, p_ahora timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_mes date := public.mes_de(p_ahora);
  v_estado text;
  v_tope bigint;
begin
  if p_estimado_micro is null or p_estimado_micro not between 1 and 1000000000 then
    raise exception using errcode = '22023', message = 'estimado_invalido';
  end if;
  -- One reservation at a time per month: two steps racing at the edge of the cap cannot both pass.
  perform pg_advisory_xact_lock(hashtextextended('gastos:' || v_mes::text, 0));
  select estado into v_estado from public.gastos where clave = p_clave;
  if found then
    return jsonb_build_object('estado', 'ya_existe', 'gasto', v_estado, 'avisos', '[]'::jsonb);
  end if;
  v_tope := public.tope_vigente(null, v_mes);
  if v_tope is null then
    raise exception using errcode = '22023', message = 'sin_tope';
  end if;
  if public.gastado(v_mes) + p_estimado_micro > v_tope then
    -- A returned state, not an exception: the «cap reached» notice row must commit.
    return jsonb_build_object('estado', 'tope_alcanzado', 'alcance', 'global',
      'avisos', public.umbrales_de(v_mes, null, true));
  end if;
  if p_marca is not null then
    v_tope := public.tope_vigente(p_marca, v_mes);
    if v_tope is not null and public.gastado(v_mes, p_marca) + p_estimado_micro > v_tope then
      return jsonb_build_object('estado', 'tope_alcanzado', 'alcance', p_marca::text,
        'avisos', public.umbrales_de(v_mes, p_marca, true));
    end if;
  end if;
  insert into public.gastos (clave, marca_id, proveedor, paso, mes, estimado_micro, creado_en)
  values (p_clave, p_marca, p_proveedor, p_paso, v_mes, p_estimado_micro, p_ahora);
  return jsonb_build_object('estado', 'reservado', 'avisos',
    public.umbrales_de(v_mes, null, false)
      || case when p_marca is null then '[]'::jsonb else public.umbrales_de(v_mes, p_marca, false) end);
end $$;

create function public.confirmar_gasto(p_clave text, p_real_micro bigint, p_ahora timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_gasto public.gastos;
begin
  select * into v_gasto from public.gastos where clave = p_clave;
  if not found then
    raise exception using errcode = '22023', message = 'gasto_desconocido';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('gastos:' || v_gasto.mes::text, 0));
  -- A paid call can finish after the nightly sweep expired its reservation: it is confirmed and counts again.
  update public.gastos set estado = 'confirmado', real_micro = p_real_micro, cerrado_en = p_ahora
  where clave = p_clave and estado in ('reservado', 'vencido');
  if not found then
    select * into v_gasto from public.gastos where clave = p_clave;
    if v_gasto.estado = 'confirmado' and v_gasto.real_micro = p_real_micro then
      return jsonb_build_object('estado', 'ya_confirmado', 'avisos', '[]'::jsonb);
    end if;
    raise exception using errcode = '22023', message = 'gasto_cerrado';
  end if;
  -- The real cost can be above the estimate only by rounding; it can still cross a threshold.
  return jsonb_build_object('estado', 'confirmado', 'avisos',
    public.umbrales_de(v_gasto.mes, null, false)
      || case when v_gasto.marca_id is null then '[]'::jsonb
              else public.umbrales_de(v_gasto.mes, v_gasto.marca_id, false) end);
end $$;

-- Only for a proven 4xx: the provider refused before doing any work, so nothing was charged.
create function public.liberar_gasto(p_clave text, p_ahora timestamptz default now()) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_estado text;
begin
  update public.gastos set estado = 'sin_cobro', cerrado_en = p_ahora where clave = p_clave and estado = 'reservado';
  if found then
    return 'liberado';
  end if;
  select estado into v_estado from public.gastos where clave = p_clave;
  if not found then
    raise exception using errcode = '22023', message = 'gasto_desconocido';
  end if;
  if v_estado = 'sin_cobro' then
    return 'ya_liberado';
  end if;
  raise exception using errcode = '22023', message = 'gasto_cerrado';
end $$;

-- Plano «Mantenimiento»: a reservation nobody confirmed or released in a day stops counting.
create function public.barrer_gastos(p_ahora timestamptz default now()) returns integer
language sql security definer set search_path = '' as $$
  with vencidos as (
    update public.gastos set estado = 'vencido', cerrado_en = p_ahora
    where estado = 'reservado' and creado_en < p_ahora - interval '24 hours'
    returning 1
  )
  select count(*)::integer from vencidos
$$;

-- Ajustes «Gasto del mes»: the global total and cap, «General», and each brand the person owns.
create function public.resumen_de_gasto() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_mes date := public.mes_de(now());
begin
  if not public.es_dueno_de_alguna() then
    raise exception using errcode = '42501', message = 'solo_el_dueno_ve_el_gasto';
  end if;
  return jsonb_build_object(
    'mes', v_mes,
    'tope_micro', public.tope_vigente(null, v_mes),
    'gastado_micro', public.gastado(v_mes),
    'filas', jsonb_build_array(jsonb_build_object(
        'marca_id', null, 'nombre', 'General', 'tope_micro', null,
        'gastado_micro', (select coalesce(sum(coalesce(real_micro, estimado_micro)), 0)::bigint from public.gastos
                          where mes = v_mes and estado in ('reservado', 'confirmado') and marca_id is null)
      )) || coalesce((
        select jsonb_agg(jsonb_build_object(
          'marca_id', m.id, 'nombre', m.nombre, 'tope_micro', public.tope_vigente(m.id, v_mes),
          'gastado_micro', public.gastado(v_mes, m.id)
        ) order by m.nombre)
        from public.marcas m
        where public.es_dueno(m.id)
      ), '[]'::jsonb)
  );
end $$;

create function public.guardar_tope(p_monto_micro bigint default null, p_marca uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_marca is null and not public.es_dueno_de_alguna() then
    raise exception using errcode = '42501', message = 'solo_el_dueno_cambia_el_tope';
  end if;
  if p_marca is not null and not public.es_dueno(p_marca) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_cambia_el_tope';
  end if;
  if (p_marca is null and p_monto_micro is null)
     or (p_monto_micro is not null and p_monto_micro not between 1000000 and 1000000000) then
    raise exception using errcode = '22023', message = 'tope_invalido';
  end if;
  insert into public.topes (marca_id, desde_mes, monto_micro, puesto_por)
  values (p_marca, public.mes_de(now()), p_monto_micro, auth.uid())
  on conflict (coalesce(marca_id, '00000000-0000-0000-0000-000000000000'::uuid), desde_mes)
  do update set monto_micro = excluded.monto_micro, puesto_por = excluded.puesto_por, puesto_en = now();
end $$;

alter table public.topes enable row level security;
alter table public.gastos enable row level security;
alter table public.avisos_de_tope enable row level security;
-- No policies: people read spend only through resumen_de_gasto; the ledger is written only by the service role.
revoke all on public.topes, public.gastos, public.avisos_de_tope from anon, authenticated;

revoke execute on function public.mes_de(timestamptz), public.tope_vigente(uuid, date), public.gastado(date, uuid),
  public.umbrales_de(date, uuid, boolean),
  public.reservar_gasto(text, text, text, bigint, uuid, timestamptz),
  public.confirmar_gasto(text, bigint, timestamptz), public.liberar_gasto(text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.reservar_gasto(text, text, text, bigint, uuid, timestamptz),
  public.confirmar_gasto(text, bigint, timestamptz), public.liberar_gasto(text, timestamptz) to service_role;
revoke execute on function public.barrer_gastos(timestamptz), public.resumen_de_gasto(),
  public.guardar_tope(bigint, uuid) from public, anon, authenticated;
grant execute on function public.barrer_gastos(timestamptz) to service_role;
grant execute on function public.resumen_de_gasto(), public.guardar_tope(bigint, uuid) to authenticated;
