-- supabase/migrations/20261103120000_mapa_de_temas.sql
-- Block 4d: the topic map (plano «temas», «hallazgos», «Embeddings»). Not per brand: any account can use a finding.
-- Vectors are voyage-4 with 1,024 dimensions. Every similarity is 1 - cosine distance.

create extension if not exists vector with schema extensions;

create table public.temas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(nombre) between 1 and 120),
  descripcion text not null default '' check (length(descripcion) <= 600),
  centroide extensions.vector(1024),
  alias text[] not null default '{}',
  fusionado_en uuid references public.temas (id),
  creado_en timestamptz not null default now(),
  check (fusionado_en is distinct from id)
);

create table public.hallazgos (
  id uuid primary key default gen_random_uuid(),
  resumen text not null check (length(resumen) between 1 and 1200),
  cita text check (length(cita) <= 300),
  enlace text not null check (enlace ~ '^https?://'),
  enlace_normalizado text not null check (length(enlace_normalizado) > 0),
  medio text not null default '' check (length(medio) <= 200),
  publicado_en date,
  vector extensions.vector(1024) not null,
  tema_id uuid references public.temas (id),
  estado text not null default 'nuevo' check (estado in ('nuevo', 'usado', 'descartado')),
  creado_en timestamptz not null default now()
);

create index hallazgos_por_enlace on public.hallazgos (enlace_normalizado);
create index hallazgos_por_tema on public.hallazgos (tema_id);
create index hallazgos_sueltos on public.hallazgos (creado_en) where tema_id is null;

alter table public.temas enable row level security;
alter table public.hallazgos enable row level security;
revoke all on public.temas, public.hallazgos from anon, authenticated;
grant select on public.temas, public.hallazgos to authenticated;

-- Shared across brands: anyone who belongs to at least one brand reads the map.
create policy "miembros ven temas" on public.temas for select to authenticated
  using (exists (select 1 from public.miembros m where m.user_id = (select auth.uid())));
create policy "miembros ven hallazgos" on public.hallazgos for select to authenticated
  using (exists (select 1 from public.miembros m where m.user_id = (select auth.uid())));

create function public.tema_mas_cercano(p_vector extensions.vector, p_umbral real) returns uuid
language sql stable security definer set search_path = '' as $$
  select t.id from public.temas t
  where t.fusionado_en is null and t.centroide is not null
    and 1 - (t.centroide operator(extensions.<=>) p_vector) >= p_umbral
  order by t.centroide operator(extensions.<=>) p_vector
  limit 1
$$;

create function public.recalcular_centroide(p_tema uuid) returns void
language sql security definer set search_path = '' as $$
  update public.temas
  set centroide = (select extensions.avg(h.vector) from public.hallazgos h where h.tema_id = p_tema)
  where id = p_tema
$$;

create function public.guardar_hallazgo(
  p_resumen text,
  p_enlace text,
  p_enlace_normalizado text,
  p_medio text,
  p_vector text,
  p_umbral_repetido real,
  p_umbral_tema real,
  p_cita text default null,
  p_publicado_en date default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_vector extensions.vector := p_vector::extensions.vector;
  v_repetido uuid;
  v_tema uuid;
  v_id uuid;
begin
  -- One writer on the map at a time (guardar_hallazgo, crear_tema, reubicar_pendientes, fusionar_temas): two runs
  -- must not save the same story twice, nor attach a finding to a topic that is being merged away.
  perform pg_advisory_xact_lock(hashtext('mapa_de_temas'));

  select h.id into v_repetido
  from public.hallazgos h
  where h.enlace_normalizado = p_enlace_normalizado
     or 1 - (h.vector operator(extensions.<=>) v_vector) >= p_umbral_repetido
  order by (h.enlace_normalizado = p_enlace_normalizado) desc, h.vector operator(extensions.<=>) v_vector
  limit 1;
  if v_repetido is not null then
    return jsonb_build_object('estado', 'repetido', 'de', v_repetido);
  end if;

  v_tema := public.tema_mas_cercano(v_vector, p_umbral_tema);
  insert into public.hallazgos (resumen, cita, enlace, enlace_normalizado, medio, publicado_en, vector, tema_id)
  values (p_resumen, p_cita, p_enlace, p_enlace_normalizado, p_medio, p_publicado_en, v_vector, v_tema)
  returning id into v_id;
  if v_tema is not null then
    perform public.recalcular_centroide(v_tema);
  end if;
  return jsonb_build_object('estado', 'guardado', 'id', v_id, 'tema', v_tema);
end $$;

create function public.temas_cercanos(p_vector text, p_cantidad int)
returns table (id uuid, nombre text, descripcion text, similitud real)
language sql stable security definer set search_path = '' as $$
  select t.id, t.nombre, t.descripcion,
         (1 - (t.centroide operator(extensions.<=>) p_vector::extensions.vector))::real
  from public.temas t
  where t.fusionado_en is null and t.centroide is not null
  order by t.centroide operator(extensions.<=>) p_vector::extensions.vector
  limit greatest(p_cantidad, 0)
$$;

create function public.hallazgos_pendientes(p_limite int)
returns table (id uuid, resumen text, vector text)
language sql stable security definer set search_path = '' as $$
  select h.id, h.resumen, h.vector::text
  from public.hallazgos h
  where h.tema_id is null and h.estado <> 'descartado'
  -- Newest first: findings that never group stay loose for good, and oldest-first would let them fill the
  -- nightly limit and starve the new ones.
  order by h.creado_en desc, h.id
  limit greatest(p_limite, 0)
$$;

create function public.reubicar_pendientes(p_umbral real) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_fila record;
  v_tema uuid;
  v_tocados uuid[] := '{}';
  v_movidos int := 0;
begin
  -- One writer on the map at a time; same lock as guardar_hallazgo.
  perform pg_advisory_xact_lock(hashtext('mapa_de_temas'));
  for v_fila in
    select h.id, h.vector from public.hallazgos h where h.tema_id is null and h.estado <> 'descartado'
  loop
    v_tema := public.tema_mas_cercano(v_fila.vector, p_umbral);
    if v_tema is not null then
      update public.hallazgos set tema_id = v_tema where id = v_fila.id;
      v_tocados := array_append(v_tocados, v_tema);
      v_movidos := v_movidos + 1;
    end if;
  end loop;
  -- Centroids move only after the loop, so every loose finding is compared with the same map.
  perform public.recalcular_centroide(t) from (select distinct unnest(v_tocados) as t) x;
  return v_movidos;
end $$;

create function public.crear_tema(p_nombre text, p_descripcion text, p_hallazgos uuid[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_asignados int;
begin
  -- One writer on the map at a time; same lock as guardar_hallazgo.
  perform pg_advisory_xact_lock(hashtext('mapa_de_temas'));
  insert into public.temas (nombre, descripcion) values (p_nombre, p_descripcion) returning id into v_id;
  update public.hallazgos set tema_id = v_id where id = any (p_hallazgos) and tema_id is null;
  get diagnostics v_asignados = row_count;
  if v_asignados = 0 then
    raise exception 'El tema «%» no tiene ningún hallazgo suelto.', p_nombre;
  end if;
  perform public.recalcular_centroide(v_id);
  return v_id;
end $$;

create function public.temas_casi_iguales(p_umbral real)
returns table (tema_a uuid, tema_b uuid, similitud real, hallazgos_a int, hallazgos_b int)
language sql stable security definer set search_path = '' as $$
  with activos as (
    select t.id, t.centroide,
           (select count(*)::int from public.hallazgos h where h.tema_id = t.id) as n
    from public.temas t
    where t.fusionado_en is null and t.centroide is not null
  )
  select a.id, b.id, (1 - (a.centroide operator(extensions.<=>) b.centroide))::real, a.n, b.n
  from activos a join activos b on a.id < b.id
  where 1 - (a.centroide operator(extensions.<=>) b.centroide) >= p_umbral
  order by 3 desc
$$;

create function public.fusionar_temas(p_de uuid, p_en uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_de public.temas;
  v_en public.temas;
begin
  -- One writer on the map at a time; same lock as guardar_hallazgo.
  perform pg_advisory_xact_lock(hashtext('mapa_de_temas'));
  if p_de = p_en then
    return false;
  end if;
  select * into v_de from public.temas where id = p_de for update;
  select * into v_en from public.temas where id = p_en for update;
  if v_de.id is null or v_en.id is null or v_de.fusionado_en is not null or v_en.fusionado_en is not null then
    return false;
  end if;
  update public.hallazgos set tema_id = p_en where tema_id = p_de;
  update public.temas
  set alias = (select coalesce(array_agg(distinct a order by a), '{}')
               from unnest(v_en.alias || v_de.nombre || v_de.alias) a
               where a <> v_en.nombre)
  where id = p_en;
  -- Topics that already pointed at p_de now point at the survivor: pointers never chain.
  update public.temas set fusionado_en = p_en where fusionado_en = p_de;
  update public.temas set fusionado_en = p_en where id = p_de;
  perform public.recalcular_centroide(p_en);
  return true;
end $$;

-- Service role only: Supabase's default privileges grant execute to anon and authenticated otherwise.
revoke execute on function
  public.tema_mas_cercano(extensions.vector, real),
  public.recalcular_centroide(uuid),
  public.guardar_hallazgo(text, text, text, text, text, real, real, text, date),
  public.temas_cercanos(text, int),
  public.hallazgos_pendientes(int),
  public.reubicar_pendientes(real),
  public.crear_tema(text, text, uuid[]),
  public.temas_casi_iguales(real),
  public.fusionar_temas(uuid, uuid)
from public, anon, authenticated;
grant execute on function
  public.tema_mas_cercano(extensions.vector, real),
  public.recalcular_centroide(uuid),
  public.guardar_hallazgo(text, text, text, text, text, real, real, text, date),
  public.temas_cercanos(text, int),
  public.hallazgos_pendientes(int),
  public.reubicar_pendientes(real),
  public.crear_tema(text, text, uuid[]),
  public.temas_casi_iguales(real),
  public.fusionar_temas(uuid, uuid)
to service_role;
