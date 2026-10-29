-- D: editorial lines with versions, pillars (D20), the corrected cases and client exceptions (D13).
-- Plano: «Voz y línea editorial», «líneas editoriales», «Clientes», «excepciones de clientes», «Confidencialidad de
-- clientes». The C1 and C2 migrations are in production: anything they defined is changed here with alter.

-- Pillars keep their id across versions so pieces keep pointing at them; a pillar dropped from the line is retired.
create table public.pilares (
  id uuid primary key default gen_random_uuid(),
  marca_id uuid not null references public.marcas (id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) between 1 and 60),
  de_que_habla text not null default '' check (length(de_que_habla) <= 400),
  material text not null default '' check (length(material) <= 400),
  -- Pieces per week the brand's account aims for: 0.5 is one every two weeks (D20).
  por_semana numeric(3, 1) not null check (por_semana > 0 and por_semana <= 7),
  orden smallint not null check (orden between 1 and 8),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
create index pilares_marca on public.pilares (marca_id) where activo;

-- One row per version, never updated: a piece written later can say which version it followed.
create table public.lineas_editoriales (
  id uuid primary key default gen_random_uuid(),
  marca_id uuid not null references public.marcas (id) on delete cascade,
  version integer not null check (version >= 1),
  de_que_hablamos text not null default '' check (length(de_que_hablamos) <= 6000),
  tono text not null default '' check (length(tono) <= 6000),
  formatos text not null default '' check (length(formatos) <= 6000),
  temas_vetados text not null default '' check (length(temas_vetados) <= 6000),
  temas_a_vigilar text not null default '' check (length(temas_a_vigilar) <= 6000),
  ejemplos text not null default '' check (length(ejemplos) <= 20000),
  -- The pillars as they were when this version was saved, with their row ids.
  pilares jsonb not null check (jsonb_typeof(pilares) = 'array'),
  creada_por uuid not null references auth.users (id),
  creada_en timestamptz not null default now(),
  unique (marca_id, version)
);

create function public.lineas_inmutables() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '23514', message = 'linea_inmutable';
end $$;
create trigger lineas_editoriales_inmutables before update on public.lineas_editoriales
  for each row execute function public.lineas_inmutables();

-- Service role only (scripts/cargar-linea.ts passes the author); owners go through guardar_linea_editorial.
create function public.guardar_linea(p_marca uuid, p_base integer, p_secciones jsonb, p_pilares jsonb, p_autor uuid)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_actual integer;
  v_pilar jsonb;
  v_id uuid;
  v_ids uuid[] := '{}';
  v_orden smallint := 0;
  v_foto jsonb := '[]'::jsonb;
begin
  -- Two saves of one brand queue here, so the base check below sees the other one's version.
  perform 1 from public.marcas where id = p_marca for update;
  if not found then
    raise exception using errcode = '22023', message = 'marca_no_existe';
  end if;
  select coalesce(max(version), 0) into v_actual from public.lineas_editoriales where marca_id = p_marca;
  if v_actual <> p_base then
    -- Not 40001: PostgREST retries serialization failures, so the request would hang instead of answering.
    raise exception using errcode = '22023', message = 'linea_cambio';
  end if;
  if jsonb_typeof(p_pilares) <> 'array' or jsonb_array_length(p_pilares) not between 1 and 8 then
    raise exception using errcode = '22023', message = 'pilares_invalidos';
  end if;
  if (select count(distinct lower(btrim(e->>'nombre'))) from jsonb_array_elements(p_pilares) e)
     <> jsonb_array_length(p_pilares) then
    raise exception using errcode = '22023', message = 'pilares_repetidos';
  end if;

  for v_pilar in select value from jsonb_array_elements(p_pilares) loop
    v_orden := v_orden + 1;
    v_id := nullif(v_pilar->>'id', '')::uuid;
    if v_id is null then
      insert into public.pilares (marca_id, nombre, de_que_habla, material, por_semana, orden)
      values (p_marca, btrim(v_pilar->>'nombre'), coalesce(v_pilar->>'deQueHabla', ''), coalesce(v_pilar->>'material', ''),
              (v_pilar->>'porSemana')::numeric, v_orden)
      returning id into v_id;
    else
      update public.pilares
         set nombre = btrim(v_pilar->>'nombre'), de_que_habla = coalesce(v_pilar->>'deQueHabla', ''),
             material = coalesce(v_pilar->>'material', ''), por_semana = (v_pilar->>'porSemana')::numeric,
             orden = v_orden, activo = true
       where id = v_id and marca_id = p_marca;
      if not found then
        raise exception using errcode = '22023', message = 'pilar_de_otra_marca';
      end if;
    end if;
    v_ids := v_ids || v_id;
    v_foto := v_foto || jsonb_build_object(
      'id', v_id, 'nombre', btrim(v_pilar->>'nombre'), 'deQueHabla', coalesce(v_pilar->>'deQueHabla', ''),
      'material', coalesce(v_pilar->>'material', ''), 'porSemana', (v_pilar->>'porSemana')::numeric
    );
  end loop;
  update public.pilares set activo = false where marca_id = p_marca and activo and not (id = any (v_ids));

  insert into public.lineas_editoriales
    (marca_id, version, de_que_hablamos, tono, formatos, temas_vetados, temas_a_vigilar, ejemplos, pilares, creada_por)
  values (p_marca, v_actual + 1, coalesce(p_secciones->>'deQueHablamos', ''), coalesce(p_secciones->>'tono', ''),
          coalesce(p_secciones->>'formatos', ''), coalesce(p_secciones->>'temasVetados', ''),
          coalesce(p_secciones->>'temasAVigilar', ''), coalesce(p_secciones->>'ejemplos', ''), v_foto, p_autor);
  return v_actual + 1;
end $$;

create function public.guardar_linea_editorial(p_marca uuid, p_base integer, p_secciones jsonb, p_pilares jsonb)
returns integer
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_dueno(p_marca) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_edita_la_linea';
  end if;
  return public.guardar_linea(p_marca, p_base, p_secciones, p_pilares, auth.uid());
end $$;

alter table public.pilares enable row level security;
alter table public.lineas_editoriales enable row level security;
create policy "miembros ven los pilares" on public.pilares for select to authenticated using (public.es_miembro(marca_id));
create policy "miembros ven las lineas" on public.lineas_editoriales for select to authenticated
  using (public.es_miembro(marca_id));
revoke all on public.pilares, public.lineas_editoriales from anon, authenticated;
grant select on public.pilares, public.lineas_editoriales to authenticated;

revoke execute on function public.guardar_linea(uuid, integer, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.guardar_linea(uuid, integer, jsonb, jsonb, uuid) to service_role;
revoke execute on function public.guardar_linea_editorial(uuid, integer, jsonb, jsonb) from public, anon;
grant execute on function public.guardar_linea_editorial(uuid, integer, jsonb, jsonb) to authenticated;
revoke execute on function public.lineas_inmutables() from public, anon, authenticated;

-- D20: which pillar a piece serves. Changing it does not touch the huella: the pillar is not published.
alter table public.piezas add column pilar_id uuid references public.pilares (id);
create index piezas_pilar on public.piezas (pilar_id) where pilar_id is not null;

-- Also guards the service role (scripts/cargar-wr3.ts): a pillar belongs to the brand of the piece's account.
create function public.pilar_de_su_marca() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.pilar_id is not null and not exists (
    select 1 from public.pilares pi join public.cuentas c on c.marca_id = pi.marca_id
     where pi.id = new.pilar_id and c.id = new.cuenta_id
  ) then
    raise exception using errcode = '23514', message = 'pilar_de_otra_marca';
  end if;
  return new;
end $$;
create trigger piezas_pilar_de_su_marca before insert or update of pilar_id, cuenta_id on public.piezas
  for each row execute function public.pilar_de_su_marca();

create function public.poner_pilar(p_pieza uuid, p_pilar uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_dueno(public.marca_de_pieza(p_pieza)) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_cambia_piezas';
  end if;
  if p_pilar is not null and not exists (select 1 from public.pilares where id = p_pilar and activo) then
    raise exception using errcode = '22023', message = 'pilar_inactivo';
  end if;
  update public.piezas set pilar_id = p_pilar
   where id = p_pieza and estado not in ('publicando', 'publicada', 'descartada');
  if not found then
    raise exception using errcode = '22023', message = 'pieza_ya_cerrada';
  end if;
end $$;

revoke execute on function public.poner_pilar(uuid, uuid) from public, anon;
grant execute on function public.poner_pilar(uuid, uuid) to authenticated;
revoke execute on function public.pilar_de_su_marca() from public, anon, authenticated;

-- The corrected cases (data/casos/casos.json), loaded by scripts/cargar-casos.ts. Shared by every brand: they are
-- Federico's track record, which WAV cites (CLAUDE.md «Clientes»). PostIA keeps only the exceptions on top (D13).
create table public.casos (
  slug text primary key check (slug ~ '^[a-z0-9-]{3,140}$'),
  cliente text not null check (length(btrim(cliente)) between 1 and 120),
  titulo text not null check (length(titulo) between 1 and 200),
  anio smallint check (anio between 1990 and 2100),
  pais text check (length(pais) <= 80),
  ciudad text check (length(ciudad) <= 80),
  industria text check (length(industria) <= 120),
  tipos_de_trabajo text[] not null default '{}',
  capacidades text[] not null default '{}',
  resumen text not null default '' check (length(resumen) <= 4000),
  rol text not null default '' check (length(rol) <= 2000),
  frase_citable text check (length(frase_citable) <= 600),
  -- Before August 2025 a case is Federico's track record, never «WAV hizo».
  era text not null check (era in ('trayectoria', 'wav')),
  cargado_en timestamptz not null default now()
);
create index casos_cliente on public.casos (lower(cliente));

create table public.excepciones (
  id uuid primary key default gen_random_uuid(),
  cliente text not null check (length(btrim(cliente)) between 1 and 120),
  caso_slug text references public.casos (slug) on delete cascade,
  tipo text not null check (tipo in ('no_nombrar', 'sin_fotos', 'sin_logo', 'confidencial')),
  alias text[] not null default '{}' check (cardinality(alias) <= 10),
  -- Inclusive, Chile calendar; null means until someone removes it.
  hasta date,
  puesta_por uuid not null references auth.users (id) on delete cascade,
  puesta_en timestamptz not null default now(),
  quitada_por uuid references auth.users (id) on delete set null,
  quitada_en timestamptz
);
create unique index excepciones_una_vigente on public.excepciones (lower(cliente), coalesce(caso_slug, ''), tipo)
  where quitada_en is null;

-- Phase 1 (D4) has only owners; the client list is shared, so owning any brand is enough to mark exceptions.
create function public.es_dueno_de_alguna() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.miembros where user_id = auth.uid() and rol = 'dueno')
$$;

-- Optional parameters go last with `default null`, so the generated TypeScript types make them optional (C1 pattern).
create function public.marcar_excepcion(
  p_cliente text, p_tipo text, p_alias text[], p_caso text default null, p_hasta date default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not public.es_dueno_de_alguna() then
    raise exception using errcode = '42501', message = 'solo_el_dueno_marca_excepciones';
  end if;
  if p_caso is not null and not exists (
    select 1 from public.casos where slug = p_caso and lower(cliente) = lower(btrim(p_cliente))
  ) then
    raise exception using errcode = '22023', message = 'caso_de_otro_cliente';
  end if;
  insert into public.excepciones (cliente, caso_slug, tipo, alias, hasta, puesta_por)
  values (btrim(p_cliente), p_caso, p_tipo, coalesce(p_alias, '{}'), p_hasta, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create function public.quitar_excepcion(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_dueno_de_alguna() then
    raise exception using errcode = '42501', message = 'solo_el_dueno_marca_excepciones';
  end if;
  update public.excepciones set quitada_en = now(), quitada_por = auth.uid() where id = p_id and quitada_en is null;
  if not found then
    raise exception using errcode = '22023', message = 'excepcion_ya_quitada';
  end if;
end $$;

alter table public.casos enable row level security;
alter table public.excepciones enable row level security;
create policy "el equipo ve los casos" on public.casos for select to authenticated using (public.tiene_acceso());
create policy "el equipo ve las excepciones" on public.excepciones for select to authenticated
  using (public.tiene_acceso());
revoke all on public.casos, public.excepciones from anon, authenticated;
grant select on public.casos, public.excepciones to authenticated;

revoke execute on function public.marcar_excepcion(text, text, text[], text, date), public.quitar_excepcion(uuid),
  public.es_dueno_de_alguna() from public, anon;
grant execute on function public.marcar_excepcion(text, text, text[], text, date), public.quitar_excepcion(uuid),
  public.es_dueno_de_alguna() to authenticated;
