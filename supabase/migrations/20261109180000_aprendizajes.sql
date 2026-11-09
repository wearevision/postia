-- Rendimiento, blocks 3 and 4 (docs/superpowers/specs/2026-11-09-rendimiento-design.md): after each import Claude
-- reads the account's posts with their figures and proposes what works. A person's action only queues a reading; the
-- Trigger.dev task takes it (same shape as pedidos_de_texto in 20261102120000_redaccion.sql) and writes the proposals
-- through the service-role RPCs below. Owners approve, edit or discard each learning.

create table public.lecturas_de_rendimiento (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  importacion_id uuid references public.importaciones_de_metricas (id) on delete set null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'trabajando', 'lista', 'fallo')),
  motivo text check (length(motivo) <= 500),
  arrendado_hasta timestamptz,
  pedida_por uuid not null references auth.users (id),
  creada_en timestamptz not null default now(),
  terminada_en timestamptz
);
-- At most one open reading per account: a second tap or a second import never queues a month of spend.
create unique index lecturas_una_abierta_por_cuenta on public.lecturas_de_rendimiento (cuenta_id)
  where estado in ('pendiente', 'trabajando');
create index lecturas_abiertas on public.lecturas_de_rendimiento (creada_en) where estado in ('pendiente', 'trabajando');
create index lecturas_por_importacion on public.lecturas_de_rendimiento (importacion_id) where importacion_id is not null;
create index lecturas_por_persona on public.lecturas_de_rendimiento (pedida_por);

create table public.aprendizajes (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  lectura_id uuid references public.lecturas_de_rendimiento (id) on delete set null,
  texto text not null check (length(btrim(texto)) between 1 and 400),
  -- Claude's reasoning, in one or two sentences.
  porque text not null check (length(porque) <= 600),
  respaldo integer not null check (respaldo >= 0),
  -- metricas_de_publicacion ids that back the learning.
  publicaciones uuid[] not null default '{}',
  estado text not null default 'propuesto' check (estado in ('propuesto', 'aprobado', 'descartado', 'pista')),
  creado_en timestamptz not null default now(),
  decidido_por uuid references auth.users (id) on delete set null,
  decidido_en timestamptz
);
create index aprendizajes_por_cuenta on public.aprendizajes (cuenta_id, estado);
create index aprendizajes_por_lectura on public.aprendizajes (lectura_id) where lectura_id is not null;
create index aprendizajes_por_persona on public.aprendizajes (decidido_por) where decidido_por is not null;

alter table public.lecturas_de_rendimiento enable row level security;
alter table public.aprendizajes enable row level security;
create policy "duenos leen lecturas" on public.lecturas_de_rendimiento for select to authenticated
  using (exists (select 1 from public.cuentas c where c.id = cuenta_id and public.es_dueno(c.marca_id)));
create policy "duenos leen aprendizajes" on public.aprendizajes for select to authenticated
  using (exists (select 1 from public.cuentas c where c.id = cuenta_id and public.es_dueno(c.marca_id)));
revoke all on public.lecturas_de_rendimiento, public.aprendizajes from anon, authenticated;
grant select on public.lecturas_de_rendimiento, public.aprendizajes to authenticated;

-- People's actions. Owners only.
create function public.pedir_lectura(p_cuenta uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_marca uuid;
  v_id uuid;
begin
  select marca_id into v_marca from public.cuentas where id = p_cuenta;
  if v_marca is null or not public.es_dueno(v_marca) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_pide_lecturas';
  end if;
  begin
    insert into public.lecturas_de_rendimiento (cuenta_id, importacion_id, pedida_por)
    values (p_cuenta,
            (select id from public.importaciones_de_metricas where cuenta_id = p_cuenta order by hasta desc, creada_en desc limit 1),
            auth.uid())
    returning id into v_id;
  exception when unique_violation then
    raise exception using errcode = '55000', message = 'lectura_en_curso';
  end;
  return v_id;
end $$;

create function public.decidir_aprendizaje(p_id uuid, p_estado text, p_texto text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_cuenta uuid;
  v_marca uuid;
  v_texto text := btrim(p_texto);
  v_estado text;
begin
  select a.cuenta_id, c.marca_id, a.estado into v_cuenta, v_marca, v_estado
    from public.aprendizajes a join public.cuentas c on c.id = a.cuenta_id
   where a.id = p_id;
  if v_cuenta is null then
    raise exception using errcode = 'P0002', message = 'aprendizaje_no_encontrado';
  end if;
  if not public.es_dueno(v_marca) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_decide';
  end if;
  if p_estado not in ('aprobado', 'descartado') then
    raise exception using errcode = '22023', message = 'estado_de_aprendizaje_invalido';
  end if;
  if p_texto is not null and length(v_texto) not between 1 and 400 then
    raise exception using errcode = '22023', message = 'texto_invalido';
  end if;
  -- A screen opened before a newer reading may still show a learning that reading set aside: only open ones are
  -- approved; an approved one can still be taken back.
  if v_estado = 'descartado' or (p_estado = 'aprobado' and v_estado = 'aprobado') then
    raise exception using errcode = '22023', message = 'aprendizaje_ya_decidido';
  end if;
  update public.aprendizajes
     set estado = p_estado, texto = coalesce(v_texto, texto), decidido_por = auth.uid(), decidido_en = now()
   where id = p_id;
end $$;

-- The reader (service role only). One at a time, like tomar_pedidos.
create function public.tomar_lecturas() returns setof public.lecturas_de_rendimiento
language sql security definer set search_path = '' as $$
  update public.lecturas_de_rendimiento l set estado = 'trabajando', arrendado_hasta = now() + interval '10 minutes'
   where l.id in (
     select id from public.lecturas_de_rendimiento
      where estado = 'pendiente' or (estado = 'trabajando' and arrendado_hasta < now())
      order by creada_en
      limit 1
      for update skip locked)
  returning l.*
$$;

create function public.terminar_lectura(p_id uuid, p_estado text, p_motivo text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_estado not in ('lista', 'fallo') then
    raise exception using errcode = '22023', message = 'estado_de_lectura_invalido';
  end if;
  update public.lecturas_de_rendimiento
     set estado = p_estado, motivo = left(p_motivo, 500), terminada_en = now(), arrendado_hasta = null
   where id = p_id and estado = 'trabajando';
end $$;

-- p_items: [{texto, porque, respaldo, publicaciones: [metricas_de_publicacion ids]}]. Backing of 8 or more is a
-- proposal, less is only a hint. A new reading replaces what the earlier ones left undecided; approved ones stay.
create function public.guardar_aprendizajes(p_lectura uuid, p_items jsonb) returns integer
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
                                 where m.id = (p #>> '{}')::uuid and m.cuenta_id = v_cuenta))) then
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

revoke execute on function public.pedir_lectura(uuid), public.decidir_aprendizaje(uuid, text, text) from public, anon;
grant execute on function public.pedir_lectura(uuid), public.decidir_aprendizaje(uuid, text, text) to authenticated;
-- Service role only: Supabase's default privileges grant execute to anon and authenticated otherwise.
revoke execute on function public.tomar_lecturas(), public.terminar_lectura(uuid, text, text),
  public.guardar_aprendizajes(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.tomar_lecturas(), public.terminar_lectura(uuid, text, text),
  public.guardar_aprendizajes(uuid, jsonb) to service_role;
