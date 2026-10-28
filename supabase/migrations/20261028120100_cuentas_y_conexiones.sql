-- An authorization with a network: whose it is, which app issued it, its scopes and expiry. The token itself lives in
-- Vault as 'conexion:<id>' («Llaves fuera»). One connection can serve several accounts (a page admin's token).
create table public.conexiones (
  id uuid primary key default gen_random_uuid(),
  red text not null check (red = 'linkedin'),
  -- «Estudio WAV Perfil»: Share on LinkedIn + Sign In with LinkedIn using OpenID Connect (D2).
  app text not null check (app = 'estudio_wav_perfil'),
  titular text not null check (titular ~ '^urn:li:person:[A-Za-z0-9_-]+$'),
  nombre text check (length(nombre) <= 120),
  scopes text[] not null check ('w_member_social' = any (scopes)),
  expira_en timestamptz not null,
  conectada_en timestamptz not null default now(),
  conectada_por uuid not null references auth.users (id),
  unique (app, titular)
);

-- One presence of a brand on a network. Phase 1 is LinkedIn only (D6); Instagram widens the check in phase 2.
create table public.cuentas (
  id uuid primary key default gen_random_uuid(),
  marca_id uuid not null references public.marcas (id) on delete cascade,
  red text not null check (red = 'linkedin'),
  tipo text not null check (tipo in ('persona', 'empresa')),
  ruta text not null check (ruta in ('api', 'metricool', 'a_mano')),
  nombre text not null check (length(btrim(nombre)) between 1 and 80),
  -- Phase 0 rhythm: 3 posts a week on each LinkedIn account.
  ritmo_semanal smallint not null default 3 check (ritmo_semanal between 0 and 21),
  conexion_id uuid references public.conexiones (id) on delete set null,
  creada_en timestamptz not null default now(),
  unique (marca_id, red, nombre),
  -- Only the profile publishes by API until LinkedIn approves Community Management for the page (D2).
  constraint api_solo_perfil check (ruta <> 'api' or tipo = 'persona'),
  constraint conexion_solo_api check (conexion_id is null or ruta = 'api')
);

alter table public.cuentas enable row level security;
alter table public.conexiones enable row level security;

create policy "miembros ven las cuentas de sus marcas" on public.cuentas for select to authenticated
  using (public.es_miembro(marca_id));
create policy "duenos agregan cuentas" on public.cuentas for insert to authenticated
  with check (public.es_dueno(marca_id));
create policy "miembros ven las conexiones de sus cuentas" on public.conexiones for select to authenticated
  using (exists (select 1 from public.cuentas c where c.conexion_id = conexiones.id and public.es_miembro(c.marca_id)));

revoke all on public.cuentas, public.conexiones from anon, authenticated;
grant select on public.cuentas, public.conexiones to authenticated;
-- conexion_id is not insertable: an account only gets a connection through conectar_linkedin.
grant insert (marca_id, red, tipo, ruta, nombre, ritmo_semanal) on public.cuentas to authenticated;

create function public.conectar_linkedin(
  p_cuenta uuid, p_token text, p_titular text, p_nombre text, p_scopes text[], p_expira_en timestamptz
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_cuenta public.cuentas;
  v_conexion uuid;
  v_secreto uuid;
begin
  select * into v_cuenta from public.cuentas where id = p_cuenta for update;
  if not found or not public.es_dueno(v_cuenta.marca_id) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_conecta';
  end if;
  if v_cuenta.ruta <> 'api' or v_cuenta.tipo <> 'persona' then
    raise exception using errcode = '22023', message = 'cuenta_no_publica_por_api';
  end if;
  if nullif(btrim(p_token), '') is null or p_expira_en is null or p_expira_en <= now() then
    raise exception using errcode = '22023', message = 'conexion_incompleta';
  end if;

  insert into public.conexiones (red, app, titular, nombre, scopes, expira_en, conectada_por)
  values ('linkedin', 'estudio_wav_perfil', p_titular, nullif(btrim(p_nombre), ''), p_scopes, p_expira_en, auth.uid())
  on conflict (app, titular) do update
    set nombre = excluded.nombre, scopes = excluded.scopes, expira_en = excluded.expira_en,
        conectada_en = now(), conectada_por = excluded.conectada_por
  returning id into v_conexion;

  select id into v_secreto from vault.secrets where name = 'conexion:' || v_conexion;
  if found then
    perform vault.update_secret(v_secreto, btrim(p_token));
  else
    perform vault.create_secret(btrim(p_token), 'conexion:' || v_conexion);
  end if;

  update public.cuentas set conexion_id = v_conexion where id = p_cuenta;
  return v_conexion;
end $$;

-- LinkedIn documents no revoke endpoint for this app: disconnecting forgets our copy.
create function public.desconectar_cuenta(p_cuenta uuid) returns void
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
  if not exists (select 1 from public.cuentas where conexion_id = v_cuenta.conexion_id) then
    delete from vault.secrets where name = 'conexion:' || v_cuenta.conexion_id;
    delete from public.conexiones where id = v_cuenta.conexion_id;
  end if;
end $$;

-- Server tasks and scripts only (service role): the token never reaches a browser.
create function public.credencial_de_cuenta(p_cuenta uuid)
returns table (token text, titular text, expira_en timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.decrypted_secret, c.titular, c.expira_en
    from public.cuentas a
    join public.conexiones c on c.id = a.conexion_id
    join vault.decrypted_secrets s on s.name = 'conexion:' || c.id
   where a.id = p_cuenta
$$;

revoke execute on function public.conectar_linkedin(uuid, text, text, text, text[], timestamptz),
  public.desconectar_cuenta(uuid), public.credencial_de_cuenta(uuid) from public, anon, authenticated;
grant execute on function public.conectar_linkedin(uuid, text, text, text, text[], timestamptz),
  public.desconectar_cuenta(uuid) to authenticated;
grant execute on function public.credencial_de_cuenta(uuid) to service_role;
