-- Fase 1k: the WAV page publishes through «Estudio WAV» (Community Management API). A connection now records its app
-- and, for a page, the organization it posts as. The refresh token, when LinkedIn sends one, lives in its own Vault
-- secret, 'conexion:<id>:renovacion'.

alter table public.conexiones
  drop constraint conexiones_app_check,
  drop constraint conexiones_scopes_check,
  drop constraint conexiones_app_titular_key,
  add column organizacion text check (organizacion ~ '^urn:li:organization:[0-9]+$'),
  add column renovacion_expira_en timestamptz,
  -- «Estudio WAV Perfil» posts as the member; «Estudio WAV» (Community Management) posts as a page.
  add constraint conexiones_app_check check (app in ('estudio_wav_perfil', 'estudio_wav')),
  add constraint pagina_con_organizacion check ((app = 'estudio_wav') = (organizacion is not null)),
  add constraint conexiones_scopes_check check (
    (app = 'estudio_wav_perfil' and 'w_member_social' = any (scopes))
    or (app = 'estudio_wav' and 'w_organization_social' = any (scopes))
  ),
  -- One administrator can connect two pages; the profile (no organization) stays one row per member.
  add constraint conexiones_app_titular_organizacion_key unique nulls not distinct (app, titular, organizacion);

-- A page publishes by API now: which app an account may use is checked when it connects (cuenta_y_app_no_calzan).
alter table public.cuentas drop constraint api_solo_perfil;

-- Not callable by anyone: only the security definer functions below, running as the owner, write secrets.
create function public.guardar_secreto(p_nombre text, p_valor text) returns void
language plpgsql set search_path = '' as $$
declare
  v_secreto uuid;
begin
  select id into v_secreto from vault.secrets where name = p_nombre;
  if found then
    perform vault.update_secret(v_secreto, p_valor);
  else
    perform vault.create_secret(p_valor, p_nombre);
  end if;
end $$;

-- Not callable by anyone: a connection no account uses any more goes, with its Vault secrets.
create function public.soltar_conexion(p_conexion uuid) returns void
language plpgsql set search_path = '' as $$
begin
  if p_conexion is null or exists (select 1 from public.cuentas where conexion_id = p_conexion) then
    return;
  end if;
  delete from vault.secrets where name in ('conexion:' || p_conexion, 'conexion:' || p_conexion || ':renovacion');
  delete from public.conexiones where id = p_conexion;
end $$;

drop function public.conectar_linkedin(uuid, text, text, text, text[], timestamptz);

create function public.conectar_linkedin(
  p_cuenta uuid, p_token text, p_titular text, p_nombre text, p_scopes text[], p_expira_en timestamptz,
  p_app text default 'estudio_wav_perfil', p_organizacion text default null,
  p_renovacion text default null, p_renovacion_expira_en timestamptz default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_cuenta public.cuentas;
  v_conexion uuid;
  v_renovacion text := nullif(btrim(p_renovacion), '');
begin
  select * into v_cuenta from public.cuentas where id = p_cuenta for update;
  if not found or not public.es_dueno(v_cuenta.marca_id) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_conecta';
  end if;
  if v_cuenta.ruta <> 'api' then
    raise exception using errcode = '22023', message = 'cuenta_no_publica_por_api';
  end if;
  -- A page account only through the page app, a profile only through the profile app.
  if (v_cuenta.tipo = 'empresa') <> (p_app = 'estudio_wav') then
    raise exception using errcode = '22023', message = 'cuenta_y_app_no_calzan';
  end if;
  if nullif(btrim(p_token), '') is null or p_expira_en is null or p_expira_en <= now()
     or (v_renovacion is not null and (p_renovacion_expira_en is null or p_renovacion_expira_en <= now())) then
    raise exception using errcode = '22023', message = 'conexion_incompleta';
  end if;

  insert into public.conexiones (red, app, titular, organizacion, nombre, scopes, expira_en, renovacion_expira_en,
                                 conectada_por)
  values ('linkedin', p_app, p_titular, p_organizacion, nullif(btrim(p_nombre), ''), p_scopes, p_expira_en,
          case when v_renovacion is not null then p_renovacion_expira_en end, auth.uid())
  on conflict on constraint conexiones_app_titular_organizacion_key do update
    set nombre = excluded.nombre, scopes = excluded.scopes, expira_en = excluded.expira_en,
        renovacion_expira_en = excluded.renovacion_expira_en,
        conectada_en = now(), conectada_por = excluded.conectada_por
  returning id into v_conexion;

  perform public.guardar_secreto('conexion:' || v_conexion, btrim(p_token));
  -- A reconnect without a refresh token forgets the previous one: it belonged to an older grant.
  if v_renovacion is not null then
    perform public.guardar_secreto('conexion:' || v_conexion || ':renovacion', v_renovacion);
  else
    delete from vault.secrets where name = 'conexion:' || v_conexion || ':renovacion';
  end if;

  update public.cuentas set conexion_id = v_conexion where id = p_cuenta;
  -- A reconnect to another member or page leaves the old connection behind: it goes unless another account uses it.
  if v_cuenta.conexion_id is distinct from v_conexion then
    perform public.soltar_conexion(v_cuenta.conexion_id);
  end if;
  return v_conexion;
end $$;

-- LinkedIn documents no revoke endpoint for this app: disconnecting forgets our copy.
create or replace function public.desconectar_cuenta(p_cuenta uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_cuenta public.cuentas;
begin
  select * into v_cuenta from public.cuentas where id = p_cuenta for update;
  if not found or not public.es_dueno(v_cuenta.marca_id) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_desconecta';
  end if;
  if v_cuenta.conexion_id is null then
    return;
  end if;
  update public.cuentas set conexion_id = null where id = p_cuenta;
  perform public.soltar_conexion(v_cuenta.conexion_id);
end $$;

-- The return type gains `autor`, so the function is dropped and created again.
drop function public.credencial_de_cuenta(uuid);

-- Server tasks and scripts only (service role): the token never reaches a browser. `autor` is who the post is by:
-- the organization for a page, the member for the profile.
create function public.credencial_de_cuenta(p_cuenta uuid)
returns table (token text, titular text, expira_en timestamptz, autor text)
language sql stable security definer set search_path = '' as $$
  select s.decrypted_secret, c.titular, c.expira_en, coalesce(c.organizacion, c.titular)
    from public.cuentas a
    join public.conexiones c on c.id = a.conexion_id
    join vault.decrypted_secrets s on s.name = 'conexion:' || c.id
   where a.id = p_cuenta
$$;

-- Marcas «a mano» ↔ «sale sola». Signed pieces keep their content and date: the publisher reads the route when it
-- sends. Going back to «a mano» unlinks the connection, like desconectar_cuenta.
create function public.cambiar_ruta(p_cuenta uuid, p_ruta text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_cuenta public.cuentas;
begin
  select * into v_cuenta from public.cuentas where id = p_cuenta for update;
  if not found or not public.es_dueno(v_cuenta.marca_id) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_cambia_cuentas';
  end if;
  -- No Metricool path exists, so it is not offered as a route.
  if p_ruta is null or p_ruta not in ('api', 'a_mano') then
    raise exception using errcode = '22023', message = 'ruta_invalida';
  end if;
  if p_ruta = 'a_mano' then
    perform public.desconectar_cuenta(p_cuenta);
  end if;
  update public.cuentas set ruta = p_ruta where id = p_cuenta;
end $$;

-- Daily refresh task (service role): page connections that serve at least one account, whose access token runs out
-- before p_hasta and whose refresh token is still valid, with the refresh token decrypted.
create function public.renovaciones_pendientes(p_hasta timestamptz)
returns table (conexion uuid, renovacion text, expira_en timestamptz, renovacion_expira_en timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.id, s.decrypted_secret, c.expira_en, c.renovacion_expira_en
    from public.conexiones c
    join vault.decrypted_secrets s on s.name = 'conexion:' || c.id || ':renovacion'
   where c.app = 'estudio_wav' and c.expira_en < p_hasta and c.renovacion_expira_en > now()
     and exists (select 1 from public.cuentas a where a.conexion_id = c.id)
$$;

-- Daily refresh task (service role): the new access token, and the refresh token when LinkedIn sends one back.
create function public.guardar_renovacion(
  p_conexion uuid, p_token text, p_expira_en timestamptz, p_renovacion text, p_renovacion_expira_en timestamptz
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_renovacion text := nullif(btrim(p_renovacion), '');
begin
  if nullif(btrim(p_token), '') is null or p_expira_en is null or p_expira_en <= now()
     or (v_renovacion is not null and (p_renovacion_expira_en is null or p_renovacion_expira_en <= now())) then
    raise exception using errcode = '22023', message = 'conexion_incompleta';
  end if;
  update public.conexiones
     set expira_en = p_expira_en,
         renovacion_expira_en = case when v_renovacion is not null then p_renovacion_expira_en
                                     else renovacion_expira_en end
   where id = p_conexion and app = 'estudio_wav';
  if not found then
    raise exception using errcode = 'P0002', message = 'conexion_no_existe';
  end if;
  perform public.guardar_secreto('conexion:' || p_conexion, btrim(p_token));
  if v_renovacion is not null then
    perform public.guardar_secreto('conexion:' || p_conexion || ':renovacion', v_renovacion);
  end if;
end $$;

-- Daily refresh task (service role): LinkedIn refused this refresh token, so it is forgotten. Without it the
-- connection no longer counts as self-renewing and the watch warns about its access token again.
create function public.olvidar_renovacion(p_conexion uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.conexiones set renovacion_expira_en = null where id = p_conexion;
  delete from vault.secrets where name = 'conexion:' || p_conexion || ':renovacion';
end $$;

-- The owner confirms the page that publishes, even when they administer only one. The list holds page names only for
-- this short flow: it is ignored after 10 minutes and deleted when a page is picked or by the nightly sweep (LinkedIn:
-- organization data ≤ 8 weeks).
-- The token waits in Vault as 'eleccion:<id>' (and 'eleccion:<id>:renovacion').
create table public.elecciones_de_pagina (
  id uuid primary key default gen_random_uuid(),
  conectada_por uuid not null references auth.users (id) on delete cascade,
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  titular text not null check (titular ~ '^urn:li:person:[A-Za-z0-9_-]+$'),
  nombre text check (length(nombre) <= 120),
  scopes text[] not null check ('w_organization_social' = any (scopes)),
  expira_en timestamptz not null,
  renovacion_expira_en timestamptz,
  paginas jsonb not null check (jsonb_typeof(paginas) = 'array'),
  creada_en timestamptz not null default now()
);

alter table public.elecciones_de_pagina enable row level security;
create policy "cada persona ve sus elecciones recientes" on public.elecciones_de_pagina for select to authenticated
  using (conectada_por = (select auth.uid()) and creada_en > now() - interval '10 minutes');
revoke all on public.elecciones_de_pagina from anon, authenticated;
grant select (id, cuenta_id, paginas, creada_en) on public.elecciones_de_pagina to authenticated;

create function public.guardar_eleccion(
  p_cuenta uuid, p_titular text, p_nombre text, p_paginas jsonb, p_token text, p_scopes text[],
  p_expira_en timestamptz, p_renovacion text default null, p_renovacion_expira_en timestamptz default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_cuenta public.cuentas;
  v_eleccion uuid;
  v_renovacion text := nullif(btrim(p_renovacion), '');
begin
  select * into v_cuenta from public.cuentas where id = p_cuenta;
  if not found or not public.es_dueno(v_cuenta.marca_id) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_conecta';
  end if;
  if v_cuenta.ruta <> 'api' then
    raise exception using errcode = '22023', message = 'cuenta_no_publica_por_api';
  end if;
  if v_cuenta.tipo <> 'empresa' then
    raise exception using errcode = '22023', message = 'cuenta_y_app_no_calzan';
  end if;
  if nullif(btrim(p_token), '') is null or p_expira_en is null or p_expira_en <= now()
     or (v_renovacion is not null and (p_renovacion_expira_en is null or p_renovacion_expira_en <= now())) then
    raise exception using errcode = '22023', message = 'conexion_incompleta';
  end if;
  if p_paginas is null or jsonb_typeof(p_paginas) <> 'array' or jsonb_array_length(p_paginas) not between 1 and 100
     or exists (select 1 from jsonb_array_elements(p_paginas) e
                 where jsonb_typeof(e) <> 'object'
                    or coalesce(e ->> 'urn', '') !~ '^urn:li:organization:[0-9]+$'
                    or jsonb_typeof(e -> 'nombre') is distinct from 'string') then
    raise exception using errcode = '22023', message = 'paginas_invalidas';
  end if;

  insert into public.elecciones_de_pagina (conectada_por, cuenta_id, titular, nombre, scopes, expira_en,
                                           renovacion_expira_en, paginas)
  values (auth.uid(), p_cuenta, p_titular, nullif(btrim(p_nombre), ''), p_scopes, p_expira_en,
          case when v_renovacion is not null then p_renovacion_expira_en end, p_paginas)
  returning id into v_eleccion;

  perform public.guardar_secreto('eleccion:' || v_eleccion, btrim(p_token));
  if v_renovacion is not null then
    perform public.guardar_secreto('eleccion:' || v_eleccion || ':renovacion', v_renovacion);
  end if;
  return v_eleccion;
end $$;

create function public.elegir_pagina(p_eleccion uuid, p_organizacion text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_eleccion public.elecciones_de_pagina;
  v_token text;
  v_renovacion text;
  v_conexion uuid;
begin
  select * into v_eleccion from public.elecciones_de_pagina where id = p_eleccion for update;
  if not found or v_eleccion.conectada_por is distinct from auth.uid() then
    raise exception using errcode = '42501', message = 'eleccion_ajena';
  end if;
  if v_eleccion.creada_en <= now() - interval '10 minutes' then
    raise exception using errcode = '22023', message = 'eleccion_vencida';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_eleccion.paginas) e where e ->> 'urn' = p_organizacion) then
    raise exception using errcode = '22023', message = 'pagina_fuera_de_la_lista';
  end if;

  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'eleccion:' || p_eleccion;
  select decrypted_secret into v_renovacion from vault.decrypted_secrets
   where name = 'eleccion:' || p_eleccion || ':renovacion';
  -- conectar_linkedin checks ownership again with the same caller (auth.uid() is the person, not the definer).
  v_conexion := public.conectar_linkedin(
    v_eleccion.cuenta_id, v_token, v_eleccion.titular, v_eleccion.nombre, v_eleccion.scopes, v_eleccion.expira_en,
    'estudio_wav', p_organizacion, v_renovacion, v_eleccion.renovacion_expira_en
  );

  delete from vault.secrets where name in ('eleccion:' || p_eleccion, 'eleccion:' || p_eleccion || ':renovacion');
  delete from public.elecciones_de_pagina where id = p_eleccion;
  return v_conexion;
end $$;

-- Plano «Mantenimiento», nightly: stale choices go, and so does any choice secret left without its row (an account
-- deleted mid-choice cascades the row away).
create function public.barrer_elecciones(p_ahora timestamptz default now()) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_borradas integer;
begin
  delete from public.elecciones_de_pagina where creada_en <= p_ahora - interval '10 minutes';
  get diagnostics v_borradas = row_count;
  delete from vault.secrets s
   where s.name like 'eleccion:%'
     and not exists (select 1 from public.elecciones_de_pagina e
                      where s.name in ('eleccion:' || e.id, 'eleccion:' || e.id || ':renovacion'));
  return v_borradas;
end $$;

revoke execute on function public.guardar_secreto(text, text), public.soltar_conexion(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function
  public.conectar_linkedin(uuid, text, text, text, text[], timestamptz, text, text, text, timestamptz),
  public.desconectar_cuenta(uuid), public.credencial_de_cuenta(uuid), public.cambiar_ruta(uuid, text),
  public.renovaciones_pendientes(timestamptz),
  public.guardar_renovacion(uuid, text, timestamptz, text, timestamptz), public.olvidar_renovacion(uuid),
  public.guardar_eleccion(uuid, text, text, jsonb, text, text[], timestamptz, text, timestamptz),
  public.elegir_pagina(uuid, text), public.barrer_elecciones(timestamptz)
  from public, anon, authenticated;
grant execute on function
  public.conectar_linkedin(uuid, text, text, text, text[], timestamptz, text, text, text, timestamptz),
  public.desconectar_cuenta(uuid), public.cambiar_ruta(uuid, text),
  public.guardar_eleccion(uuid, text, text, jsonb, text, text[], timestamptz, text, timestamptz),
  public.elegir_pagina(uuid, text)
  to authenticated;
grant execute on function public.credencial_de_cuenta(uuid), public.renovaciones_pendientes(timestamptz),
  public.guardar_renovacion(uuid, text, timestamptz, text, timestamptz), public.olvidar_renovacion(uuid),
  public.barrer_elecciones(timestamptz)
  to service_role;
