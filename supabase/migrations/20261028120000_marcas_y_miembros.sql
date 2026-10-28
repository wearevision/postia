-- Brands and who belongs to each one. Every later table is scoped by brand through es_miembro / es_dueno.
create table public.marcas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (length(btrim(nombre)) between 1 and 80),
  -- «Cada marca con su voz»: WAV speaks as «nosotros», Federico as «yo».
  voz text not null check (voz in ('yo', 'nosotros')),
  creada_en timestamptz not null default now()
);

-- Phase 1 (D4): only owners. Approvers and editors arrive in phase 2 by widening this check.
create table public.miembros (
  marca_id uuid not null references public.marcas (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  rol text not null default 'dueno' check (rol = 'dueno'),
  creado_en timestamptz not null default now(),
  primary key (marca_id, user_id)
);

create function public.es_miembro(p_marca uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.miembros where marca_id = p_marca and user_id = auth.uid())
$$;

create function public.es_dueno(p_marca uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.miembros where marca_id = p_marca and user_id = auth.uid() and rol = 'dueno')
$$;

-- An invited person with no brand left signs out: the app has nothing to show them.
create function public.tiene_acceso() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.miembros where user_id = auth.uid())
$$;

create function public.crear_marca(p_nombre text, p_voz text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  -- Phase 1: whoever owns a brand can open another. Roles arrive in phase 2.
  if not exists (select 1 from public.miembros where user_id = auth.uid() and rol = 'dueno') then
    raise exception using errcode = '42501', message = 'solo_un_dueno_crea_marcas';
  end if;
  insert into public.marcas (nombre, voz) values (btrim(p_nombre), p_voz) returning id into v_id;
  insert into public.miembros (marca_id, user_id, rol) values (v_id, auth.uid(), 'dueno');
  return v_id;
end $$;

alter table public.marcas enable row level security;
alter table public.miembros enable row level security;

create policy "miembros ven sus marcas" on public.marcas for select to authenticated using (public.es_miembro(id));
create policy "cada persona ve sus membresias" on public.miembros for select to authenticated
  using (user_id = auth.uid());

revoke all on public.marcas, public.miembros from anon, authenticated;
grant select on public.marcas, public.miembros to authenticated;

revoke execute on function public.es_miembro(uuid), public.es_dueno(uuid), public.tiene_acceso(),
  public.crear_marca(text, text) from public, anon;
grant execute on function public.es_miembro(uuid), public.es_dueno(uuid), public.tiene_acceso(),
  public.crear_marca(text, text) to authenticated;
