-- Rendimiento, block API (docs/superpowers/plans/2026-11-09-rendimiento-4-api.md, task 1): the owner authorizes
-- «Estudio WAV» to read the analytics of their own posts (r_member_postAnalytics, Community Management API). It is a
-- connection of its own, apart from `conexiones` (which publishes): one per profile account, with its token in Vault as
-- 'analiticas:<cuenta id>'. Owners only.

create table public.conexiones_de_analiticas (
  cuenta_id uuid primary key references public.cuentas (id) on delete cascade,
  scopes text[] not null check ('r_member_postAnalytics' = any (scopes)),
  expira_en timestamptz not null,
  conectada_en timestamptz not null default now(),
  conectada_por uuid not null references auth.users (id)
);
create index conexiones_de_analiticas_por_persona on public.conexiones_de_analiticas (conectada_por);

alter table public.conexiones_de_analiticas enable row level security;
create policy "duenos ven las analiticas de sus cuentas" on public.conexiones_de_analiticas for select to authenticated
  using (exists (select 1 from public.cuentas c
                  where c.id = conexiones_de_analiticas.cuenta_id and public.es_dueno(c.marca_id)));
-- Written only by conectar_analiticas; the token is never a column.
revoke all on public.conexiones_de_analiticas from anon, authenticated;
grant select on public.conexiones_de_analiticas to authenticated;

create function public.conectar_analiticas(p_cuenta uuid, p_token text, p_scopes text[], p_expira_en timestamptz)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_cuenta public.cuentas;
begin
  select * into v_cuenta from public.cuentas where id = p_cuenta for update;
  if not found or not public.es_dueno(v_cuenta.marca_id) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_conecta';
  end if;
  -- The page's figures come through its publishing connection; this one is the member's own posts.
  if v_cuenta.tipo <> 'persona' then
    raise exception using errcode = '22023', message = 'cuenta_no_es_perfil';
  end if;
  if p_scopes is null or not ('r_member_postAnalytics' = any (p_scopes)) then
    raise exception using errcode = '22023', message = 'permisos_analiticas';
  end if;
  if nullif(btrim(p_token), '') is null or p_expira_en is null or p_expira_en <= now() then
    raise exception using errcode = '22023', message = 'conexion_incompleta';
  end if;

  insert into public.conexiones_de_analiticas as c (cuenta_id, scopes, expira_en, conectada_por)
  values (p_cuenta, p_scopes, p_expira_en, auth.uid())
  on conflict (cuenta_id) do update
    set scopes = excluded.scopes, expira_en = excluded.expira_en, conectada_en = now(),
        conectada_por = excluded.conectada_por;
  perform public.guardar_secreto('analiticas:' || p_cuenta, btrim(p_token));
end $$;

-- The secret follows its row, also when the account is deleted and the row goes by cascade.
create function public.soltar_secreto_de_analiticas() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from vault.secrets where name = 'analiticas:' || old.cuenta_id;
  return old;
end $$;

create trigger conexiones_de_analiticas_sueltan_su_secreto
  before delete on public.conexiones_de_analiticas
  for each row execute function public.soltar_secreto_de_analiticas();

revoke execute on function public.conectar_analiticas(uuid, text, text[], timestamptz),
  public.soltar_secreto_de_analiticas() from public, anon, authenticated;
grant execute on function public.conectar_analiticas(uuid, text, text[], timestamptz) to authenticated;

-- Task 2: reading the figures. The Trigger.dev task reads LinkedIn's API for the page (share and follower statistics)
-- and the profile (own post analytics) and stores them with origen = 'api'. A person's tap and the daily schedule only
-- queue a reading (same shape as lecturas_de_rendimiento); the task takes one at a time.
-- Retention (LinkedIn Data Storage Requirements): page reporting data up to 1 year, a member's post analytics 48 hours.
-- API figures never reach Claude: the learnings reader keeps reading origen = 'importacion' only.

create table public.lecturas_de_analiticas (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'trabajando', 'lista', 'fallo')),
  -- What the owner reads: a summary when «lista», the reason when «fallo».
  motivo text check (length(motivo) <= 500),
  arrendado_hasta timestamptz,
  -- Null when the daily schedule queued it.
  pedida_por uuid references auth.users (id) on delete set null,
  creada_en timestamptz not null default now(),
  terminada_en timestamptz
);
-- At most one open reading per account: a second tap never doubles the calls against the daily limit.
create unique index lecturas_de_analiticas_una_abierta on public.lecturas_de_analiticas (cuenta_id)
  where estado in ('pendiente', 'trabajando');
create index lecturas_de_analiticas_abiertas on public.lecturas_de_analiticas (creada_en)
  where estado in ('pendiente', 'trabajando');
create index lecturas_de_analiticas_recientes on public.lecturas_de_analiticas (cuenta_id, creada_en desc);
create index lecturas_de_analiticas_por_persona on public.lecturas_de_analiticas (pedida_por) where pedida_por is not null;

alter table public.lecturas_de_analiticas enable row level security;
create policy "duenos leen lecturas de analiticas" on public.lecturas_de_analiticas for select to authenticated
  using (exists (select 1 from public.cuentas c where c.id = cuenta_id and public.es_dueno(c.marca_id)));
revoke all on public.lecturas_de_analiticas from anon, authenticated;
grant select on public.lecturas_de_analiticas to authenticated;

-- Can PostIA read this account's figures right now? A page through its publishing connection (it carries
-- rw_organization_admin), a profile through its analytics connection; an expired one does not count.
create function public.analiticas_conectadas(p_cuenta uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.cuentas c
     where c.id = p_cuenta
       and ((c.tipo = 'persona' and exists (select 1 from public.conexiones_de_analiticas a
                                             where a.cuenta_id = c.id and a.expira_en > now()))
         or (c.tipo = 'empresa' and exists (select 1 from public.conexiones x
                                             where x.id = c.conexion_id and x.expira_en > now()))))
$$;

-- Development tier: 100 calls per member per UTC day, and a profile reading costs up to 40. The page reading and the
-- page publishing use the same member's token (same «Estudio WAV» app), so a profile gets two readings a UTC day
-- (the 06:00 schedule and one tap, or two taps): up to 80 calls, leaving room for the page and its posts.
create function public.lecturas_del_dia_agotadas(p_cuenta uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.cuentas c where c.id = p_cuenta and c.tipo = 'persona')
     and (select count(*) from public.lecturas_de_analiticas l
           where l.cuenta_id = p_cuenta
             and l.creada_en >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC') >= 2
$$;

-- «Actualizar desde LinkedIn»: the owner queues one reading for the account.
create function public.pedir_lectura_de_analiticas(p_cuenta uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_marca uuid;
  v_id uuid;
begin
  select marca_id into v_marca from public.cuentas where id = p_cuenta for update;
  if v_marca is null or not public.es_dueno(v_marca) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_pide_lecturas';
  end if;
  if not public.analiticas_conectadas(p_cuenta) then
    raise exception using errcode = '55000', message = 'analiticas_sin_conexion';
  end if;
  if public.lecturas_del_dia_agotadas(p_cuenta) then
    raise exception using errcode = '55000', message = 'lecturas_del_dia_agotadas';
  end if;
  begin
    insert into public.lecturas_de_analiticas (cuenta_id, pedida_por) values (p_cuenta, auth.uid())
    returning id into v_id;
  exception when unique_violation then
    raise exception using errcode = '55000', message = 'lectura_en_curso';
  end;
  return v_id;
end $$;

-- The daily schedule (service role): one reading for every connected account that has none open.
create function public.programar_lecturas_de_analiticas() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_creadas integer;
begin
  insert into public.lecturas_de_analiticas (cuenta_id)
  select c.id from public.cuentas c
   where public.analiticas_conectadas(c.id)
     and not public.lecturas_del_dia_agotadas(c.id)
     and not exists (select 1 from public.lecturas_de_analiticas l
                      where l.cuenta_id = c.id and l.estado in ('pendiente', 'trabajando'))
  on conflict do nothing;
  get diagnostics v_creadas = row_count;
  return v_creadas;
end $$;

-- The reader (service role only). One at a time, like tomar_lecturas. The lease comes from the task
-- (lib/rendimiento/sincronizar.ts, ARRIENDO_S): its worst run (calls × request timeout) plus a margin, so a slow run
-- is never taken twice.
create function public.tomar_lecturas_de_analiticas(p_arriendo_segundos integer)
returns setof public.lecturas_de_analiticas
language plpgsql security definer set search_path = '' as $$
begin
  if p_arriendo_segundos is null or p_arriendo_segundos not between 60 and 7200 then
    raise exception using errcode = '22023', message = 'arriendo_invalido';
  end if;
  return query
  update public.lecturas_de_analiticas l
     set estado = 'trabajando', arrendado_hasta = now() + make_interval(secs => p_arriendo_segundos)
   where l.id in (
     select id from public.lecturas_de_analiticas
      where estado = 'pendiente' or (estado = 'trabajando' and arrendado_hasta < now())
      order by creada_en
      limit 1
      for update skip locked)
  returning l.*;
end $$;

create function public.terminar_lectura_de_analiticas(p_id uuid, p_estado text, p_motivo text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_estado not in ('lista', 'fallo') then
    raise exception using errcode = '22023', message = 'estado_de_lectura_invalido';
  end if;
  update public.lecturas_de_analiticas
     set estado = p_estado, motivo = left(p_motivo, 500), terminada_en = now(), arrendado_hasta = null
   where id = p_id and estado = 'trabajando';
end $$;

-- The profile's analytics token (service role only; the page's comes from credencial_de_cuenta).
create function public.credencial_de_analiticas(p_cuenta uuid) returns table (token text, expira_en timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.decrypted_secret, a.expira_en
    from public.conexiones_de_analiticas a
    join vault.decrypted_secrets s on s.name = 'analiticas:' || a.cuenta_id
   where a.cuenta_id = p_cuenta
$$;

-- p_datos: {publicaciones: [{post_urn, impresiones, interacciones, clics}], dias: [{dia, seguidores_nuevos}]}.
-- Only posts PostIA sent for that account are stored (the URN must be in publicaciones); the others are dropped.
-- The same post read again replaces its figures (a refresh, not an accumulation).
create function public.guardar_metricas_api(p_cuenta uuid, p_datos jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_publicaciones integer;
  v_dias integer;
begin
  if not exists (select 1 from public.cuentas where id = p_cuenta) then
    raise exception using errcode = 'P0002', message = 'cuenta_no_encontrada';
  end if;
  if jsonb_typeof(p_datos -> 'publicaciones') <> 'array' or jsonb_typeof(p_datos -> 'dias') <> 'array'
     or exists (select 1 from jsonb_array_elements(p_datos -> 'publicaciones') e
                 where jsonb_typeof(e) <> 'object'
                    or coalesce(e ->> 'post_urn', '') !~ '^urn:li:(share|ugcPost):[0-9]+$'
                    or jsonb_typeof(e -> 'impresiones') <> 'number' or (e ->> 'impresiones') !~ '^[0-9]+$'
                    or jsonb_typeof(e -> 'interacciones') <> 'number' or (e ->> 'interacciones') !~ '^[0-9]+$'
                    or (jsonb_typeof(e -> 'clics') not in ('number', 'null') and e ? 'clics')
                    or (jsonb_typeof(e -> 'clics') = 'number' and (e ->> 'clics') !~ '^[0-9]+$'))
     or exists (select 1 from jsonb_array_elements(p_datos -> 'dias') e
                 where jsonb_typeof(e) <> 'object' or coalesce(e ->> 'dia', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
                    or jsonb_typeof(e -> 'seguidores_nuevos') <> 'number' or (e ->> 'seguidores_nuevos') !~ '^[0-9]+$') then
    raise exception using errcode = '22023', message = 'datos_invalidos';
  end if;

  insert into public.metricas_de_publicacion (cuenta_id, post_urn, pieza_id, publicada_el, impresiones, interacciones,
                                              clics, origen, leida_en)
  select distinct on (e ->> 'post_urn')
         p_cuenta, e ->> 'post_urn', pu.pieza_id, (pu.enviado_en at time zone 'America/Santiago')::date,
         (e ->> 'impresiones')::integer, (e ->> 'interacciones')::integer, (e ->> 'clics')::integer, 'api', now()
    from jsonb_array_elements(p_datos -> 'publicaciones') e
    join public.publicaciones pu on pu.post_urn = e ->> 'post_urn'
    join public.piezas pz on pz.id = pu.pieza_id and pz.cuenta_id = p_cuenta
   order by e ->> 'post_urn', pu.enviado_en desc
  on conflict (cuenta_id, post_urn, origen) do update
     set pieza_id = excluded.pieza_id, publicada_el = excluded.publicada_el, impresiones = excluded.impresiones,
         interacciones = excluded.interacciones, clics = excluded.clics, leida_en = excluded.leida_en;
  get diagnostics v_publicaciones = row_count;

  insert into public.metricas_diarias (cuenta_id, dia, seguidores_nuevos, origen)
  select p_cuenta, (e ->> 'dia')::date, (e ->> 'seguidores_nuevos')::integer, 'api'
    from jsonb_array_elements(p_datos -> 'dias') e
  on conflict (cuenta_id, dia, origen) do update set seguidores_nuevos = excluded.seguidores_nuevos;
  get diagnostics v_dias = row_count;

  return jsonb_build_object('publicaciones', v_publicaciones, 'dias', v_dias);
exception
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or check_violation
       or not_null_violation then
    raise exception using errcode = '22023', message = 'datos_invalidos';
end $$;

-- Nightly (service role): API figures past their retention, and readings older than a month. Returns rows removed.
-- Bound: a profile's figures are member activity, kept at most 48 hours. This sweep runs once a day (03:00, trigger/
-- limpieza.ts), so a row can outlive its threshold by up to 24 hours: the threshold is 24 hours (24 + 24 <= 48).
-- The 06:00 reading refreshes them daily, so a current row is 21 hours old at 03:00 and stays.
create function public.barrer_analiticas() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_borradas integer := 0;
  v_n integer;
begin
  delete from public.metricas_de_publicacion m using public.cuentas c
   where c.id = m.cuenta_id and m.origen = 'api'
     and ((c.tipo = 'persona' and m.leida_en < now() - interval '24 hours')
       or (c.tipo = 'empresa' and m.leida_en < now() - interval '1 year'));
  get diagnostics v_n = row_count;
  v_borradas := v_borradas + v_n;

  -- Daily figures carry no read time: they go by their day (yesterday at most for a profile: within 48 hours by the
  -- same bound). A profile stores none today; the cap keeps it that way.
  delete from public.metricas_diarias d using public.cuentas c
   where c.id = d.cuenta_id and d.origen = 'api'
     and ((c.tipo = 'persona' and d.dia < (now() at time zone 'America/Santiago')::date - 1)
       or (c.tipo = 'empresa' and d.dia < (now() at time zone 'America/Santiago')::date - 365));
  get diagnostics v_n = row_count;
  v_borradas := v_borradas + v_n;

  delete from public.lecturas_de_analiticas
   where estado in ('lista', 'fallo') and creada_en < now() - interval '30 days';
  get diagnostics v_n = row_count;
  return v_borradas + v_n;
end $$;

revoke execute on function public.analiticas_conectadas(uuid), public.lecturas_del_dia_agotadas(uuid),
  public.pedir_lectura_de_analiticas(uuid),
  public.programar_lecturas_de_analiticas(), public.tomar_lecturas_de_analiticas(integer),
  public.terminar_lectura_de_analiticas(uuid, text, text), public.credencial_de_analiticas(uuid),
  public.guardar_metricas_api(uuid, jsonb), public.barrer_analiticas()
  from public, anon, authenticated;
grant execute on function public.pedir_lectura_de_analiticas(uuid) to authenticated;
grant execute on function public.programar_lecturas_de_analiticas(), public.tomar_lecturas_de_analiticas(integer),
  public.terminar_lectura_de_analiticas(uuid, text, text), public.credencial_de_analiticas(uuid),
  public.guardar_metricas_api(uuid, jsonb), public.barrer_analiticas()
  to service_role;

-- Learnings come from imported figures only: API figures never reach Claude (Developer AI Policy), so a learning may
-- not cite one either. Same signature, owner and grants as in 20261109180000_aprendizajes.sql (service role only);
-- only the origin check is new.
create or replace function public.guardar_aprendizajes(p_lectura uuid, p_items jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_cuenta uuid;
  v_guardados integer;
begin
  select cuenta_id into v_cuenta from public.lecturas_de_rendimiento where id = p_lectura and estado = 'trabajando' for update;
  if v_cuenta is null then
    raise exception using errcode = 'P0002', message = 'lectura_no_encontrada';
  end if;
  if jsonb_typeof(p_items) <> 'array'
     or exists (
       select 1 from jsonb_array_elements(p_items) e
        where jsonb_typeof(e) <> 'object'
           or jsonb_typeof(e -> 'texto') <> 'string' or length(btrim(e ->> 'texto')) not between 1 and 400
           or jsonb_typeof(e -> 'porque') <> 'string' or length(e ->> 'porque') > 600
           or jsonb_typeof(e -> 'respaldo') <> 'number' or (e ->> 'respaldo') !~ '^[0-9]+$'
           or jsonb_typeof(e -> 'publicaciones') <> 'array'
           or exists (
             select 1 from jsonb_array_elements(e -> 'publicaciones') p
              where jsonb_typeof(p) <> 'string'
                 or (p #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                 or not exists (select 1 from public.metricas_de_publicacion m
                                 where m.id = (p #>> '{}')::uuid and m.cuenta_id = v_cuenta
                                   and m.origen = 'importacion'))) then
    raise exception using errcode = '22023', message = 'datos_invalidos';
  end if;

  update public.aprendizajes set estado = 'descartado', decidido_en = now()
   where cuenta_id = v_cuenta and estado in ('propuesto', 'pista');
  insert into public.aprendizajes (cuenta_id, lectura_id, texto, porque, respaldo, publicaciones, estado)
  select v_cuenta, p_lectura, btrim(e ->> 'texto'), e ->> 'porque', (e ->> 'respaldo')::integer,
         array(select (p #>> '{}')::uuid from jsonb_array_elements(e -> 'publicaciones') p),
         case when (e ->> 'respaldo')::integer >= 8 then 'propuesto' else 'pista' end
    from jsonb_array_elements(p_items) e;
  get diagnostics v_guardados = row_count;
  return v_guardados;
end $$;
