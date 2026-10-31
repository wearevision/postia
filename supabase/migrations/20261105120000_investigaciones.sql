-- supabase/migrations/20261105120000_investigaciones.sql
-- 4e: research on request and the Saturday watch. A person's action only queues a job; the Trigger.dev task
-- atender-investigaciones searches the web with Claude (never LinkedIn), sorts the notes into angles, embeds the
-- findings with Voyage and saves them through guardar_hallazgo (4d). Plano: «Investigar», «Vigilancia semanal», D17.

-- Research is not separated by brand (D17): the people's actions check es_dueno_de_alguna (voz_y_clientes).

create table public.investigaciones (
  id uuid primary key default gen_random_uuid(),
  origen text not null check (origen in ('encargo', 'vigilancia')),
  tema text not null check (length(btrim(tema)) between 1 and 300),
  cantidad integer check (cantidad between 1 and 30),
  formato text check (formato in ('texto', 'carrusel_pdf')),
  enfoque text check (enfoque in ('tendencias', 'desafios', 'mitos', 'guia')),
  angulos jsonb not null default '[]' check (jsonb_typeof(angulos) = 'array'),
  -- Shown on the report: findings refused as already in the map, and sources dropped as invented or from LinkedIn.
  repetidos integer not null default 0 check (repetidos >= 0),
  descartados integer not null default 0 check (descartados >= 0),
  estado text not null default 'en_cola'
    check (estado in ('en_cola', 'investigando', 'informe_por_aprobar', 'aprobada', 'descartada', 'fallo')),
  motivo text check (length(motivo) <= 500),
  pedida_por uuid references auth.users (id),
  -- A watch's Santiago date: one watch per day, so a re-run the same day reuses its row.
  dia date,
  creada_en timestamptz not null default now(),
  cerrada_en timestamptz,
  constraint dia_de_vigilancia check ((origen = 'vigilancia') = (dia is not null)),
  constraint encargo_completo check (origen = 'vigilancia' or (cantidad is not null and formato is not null and pedida_por is not null))
);
create index investigaciones_por_estado on public.investigaciones (estado, creada_en desc);
create unique index una_vigilancia_por_dia on public.investigaciones (dia) where origen = 'vigilancia';
create index investigaciones_por_persona on public.investigaciones (pedida_por) where pedida_por is not null;

create table public.trabajos_de_investigacion (
  id uuid primary key default gen_random_uuid(),
  investigacion_id uuid not null references public.investigaciones (id) on delete cascade,
  tipo text not null check (tipo in ('investigar', 'ampliar')),
  angulo text check (length(btrim(angulo)) between 1 and 80),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'trabajando', 'hecho', 'fallo')),
  intentos integer not null default 0,
  motivo text check (length(motivo) <= 500),
  arrendado_hasta timestamptz,
  creado_en timestamptz not null default now(),
  terminado_en timestamptz,
  constraint ampliar_con_angulo check ((tipo = 'ampliar') = (angulo is not null))
);
create index trabajos_abiertos on public.trabajos_de_investigacion (creado_en) where estado in ('pendiente', 'trabajando');
create index trabajos_por_investigacion on public.trabajos_de_investigacion (investigacion_id);

alter table public.hallazgos add column investigacion_id uuid references public.investigaciones (id) on delete set null;
alter table public.hallazgos add column angulo text check (length(angulo) <= 80);
create index hallazgos_por_investigacion on public.hallazgos (investigacion_id) where investigacion_id is not null;

create table public.sugerencias_de_investigacion (
  id uuid primary key default gen_random_uuid(),
  tema text not null check (length(btrim(tema)) between 1 and 300),
  enriquece text not null check (length(btrim(enriquece)) between 1 and 400),
  creada_en timestamptz not null default now()
);

alter table public.investigaciones enable row level security;
alter table public.trabajos_de_investigacion enable row level security;
alter table public.sugerencias_de_investigacion enable row level security;
create policy "con acceso ven investigaciones" on public.investigaciones for select to authenticated using (public.tiene_acceso());
create policy "con acceso ven trabajos" on public.trabajos_de_investigacion for select to authenticated using (public.tiene_acceso());
create policy "con acceso ven sugerencias" on public.sugerencias_de_investigacion for select to authenticated using (public.tiene_acceso());
revoke all on public.investigaciones, public.trabajos_de_investigacion, public.sugerencias_de_investigacion from anon, authenticated;
grant select on public.investigaciones, public.trabajos_de_investigacion, public.sugerencias_de_investigacion to authenticated;

-- People's actions ------------------------------------------------------------------------------------------------

create function public.pedir_investigacion(p_tema text, p_cantidad integer, p_formato text, p_enfoque text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not public.es_dueno_de_alguna() then
    raise exception using errcode = '42501', message = 'solo_duenos_investigan';
  end if;
  -- Phase 1 offers text posts and PDF carousels; Instagram formats arrive in phase 2.
  if p_formato is null or p_formato not in ('texto', 'carrusel_pdf') then
    raise exception using errcode = '22023', message = 'formato_no_disponible';
  end if;
  -- Serializes the count below: two requests at once must not both pass as the third.
  perform pg_advisory_xact_lock(hashtext('investigaciones'));
  -- Only requests count: a watch has no author to wait on it, and a stuck one must not block Federico.
  if (select count(*) from public.investigaciones
       where origen = 'encargo' and estado in ('en_cola', 'investigando')) >= 3 then
    raise exception using errcode = '22023', message = 'demasiadas_investigaciones';
  end if;
  insert into public.investigaciones (origen, tema, cantidad, formato, enfoque, pedida_por)
  values ('encargo', btrim(p_tema), p_cantidad, p_formato, p_enfoque, auth.uid())
  returning id into v_id;
  insert into public.trabajos_de_investigacion (investigacion_id, tipo) values (v_id, 'investigar');
  return v_id;
end $$;

create function public.pedir_ampliacion(p_investigacion uuid, p_angulo text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_investigacion public.investigaciones;
  v_id uuid;
begin
  if not public.es_dueno_de_alguna() then
    raise exception using errcode = '42501', message = 'solo_duenos_investigan';
  end if;
  select * into v_investigacion from public.investigaciones where id = p_investigacion for update;
  -- Checked before the state: an open extension has already moved the research back to investigando.
  if exists (select 1 from public.trabajos_de_investigacion
              where investigacion_id = p_investigacion and estado in ('pendiente', 'trabajando')) then
    raise exception using errcode = '22023', message = 'trabajo_en_curso';
  end if;
  if v_investigacion.id is null or v_investigacion.estado <> 'informe_por_aprobar' then
    raise exception using errcode = '22023', message = 'informe_no_esta_por_aprobar';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_investigacion.angulos) a where a ->> 'nombre' = p_angulo) then
    raise exception using errcode = '22023', message = 'angulo_desconocido';
  end if;
  insert into public.trabajos_de_investigacion (investigacion_id, tipo, angulo)
  values (p_investigacion, 'ampliar', p_angulo)
  returning id into v_id;
  update public.investigaciones set estado = 'investigando' where id = p_investigacion;
  return v_id;
end $$;

create function public.aprobar_informe(p_investigacion uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_dueno_de_alguna() then
    raise exception using errcode = '42501', message = 'solo_duenos_investigan';
  end if;
  update public.investigaciones set estado = 'aprobada'
   where id = p_investigacion and estado = 'informe_por_aprobar';
  if not found then
    raise exception using errcode = '22023', message = 'informe_no_esta_por_aprobar';
  end if;
end $$;

create function public.descartar_informe(p_investigacion uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_dueno_de_alguna() then
    raise exception using errcode = '42501', message = 'solo_duenos_investigan';
  end if;
  update public.investigaciones set estado = 'descartada'
   where id = p_investigacion and estado = 'informe_por_aprobar';
  if not found then
    raise exception using errcode = '22023', message = 'informe_no_esta_por_aprobar';
  end if;
  -- Discarded findings stay in the map so a repeat is still recognized, but the Sunday engine never uses them.
  update public.hallazgos set estado = 'descartado' where investigacion_id = p_investigacion;
end $$;

-- Only from a report waiting for approval: once approved, the series (4f) decides what each finding is used for.
create function public.descartar_hallazgo(p_hallazgo uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_dueno_de_alguna() then
    raise exception using errcode = '42501', message = 'solo_duenos_investigan';
  end if;
  update public.hallazgos h set estado = 'descartado'
    from public.investigaciones i
   where h.id = p_hallazgo and i.id = h.investigacion_id and i.estado = 'informe_por_aprobar';
  if not found then
    raise exception using errcode = '22023', message = 'informe_no_esta_por_aprobar';
  end if;
end $$;

-- Trigger.dev's side (service role) ----------------------------------------------------------------------------

create function public.tomar_trabajo_de_investigacion() returns setof public.trabajos_de_investigacion
language plpgsql security definer set search_path = '' as $$
declare
  v_motivo constant text := 'No pude terminar la investigación después de dos intentos. Pídela de nuevo.';
begin
  -- Poison guard, as in tomar_pedidos_de_diseno: a job that died twice is not leased a third time. A failed request
  -- fails its research; a failed extension leaves the report it extends standing, as terminar does.
  with vencidos as (
    update public.trabajos_de_investigacion
       set estado = 'fallo', motivo = v_motivo, terminado_en = now(), arrendado_hasta = null
     where estado = 'trabajando' and arrendado_hasta < now() and intentos >= 2
    returning investigacion_id, tipo
  )
  update public.investigaciones i
     set estado = case when v.tipo = 'investigar' then 'fallo' else 'informe_por_aprobar' end,
         motivo = case when v.tipo = 'investigar' then v_motivo else i.motivo end,
         cerrada_en = case when v.tipo = 'investigar' then now() else i.cerrada_en end
    from vencidos v
   where i.id = v.investigacion_id and i.estado = 'investigando';

  return query
  with tomado as (
    update public.trabajos_de_investigacion t
       set estado = 'trabajando', arrendado_hasta = now() + interval '15 minutes', intentos = t.intentos + 1
     where t.id in (
       select id from public.trabajos_de_investigacion
        where estado = 'pendiente' or (estado = 'trabajando' and arrendado_hasta < now())
        order by creado_en
        limit 1
        for update skip locked)
    returning t.*
  ), marcada as (
    update public.investigaciones i set estado = 'investigando'
      from tomado
     where i.id = tomado.investigacion_id
  )
  select * from tomado;
end $$;

create function public.terminar_trabajo_de_investigacion(p_trabajo uuid, p_estado text, p_motivo text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_trabajo public.trabajos_de_investigacion;
begin
  if p_estado is null or p_estado not in ('hecho', 'fallo') then
    raise exception using errcode = '22023', message = 'estado_de_trabajo_invalido';
  end if;
  update public.trabajos_de_investigacion
     set estado = p_estado, motivo = left(p_motivo, 500), terminado_en = now(), arrendado_hasta = null
   where id = p_trabajo and estado = 'trabajando'
  returning * into v_trabajo;
  if not found or p_estado = 'hecho' then
    return;
  end if;
  if v_trabajo.tipo = 'investigar' then
    update public.investigaciones
       set estado = 'fallo', motivo = left(p_motivo, 500), cerrada_en = now()
     where id = v_trabajo.investigacion_id and estado = 'investigando';
  else
    -- The report being extended still stands.
    update public.investigaciones set estado = 'informe_por_aprobar'
     where id = v_trabajo.investigacion_id and estado = 'investigando';
  end if;
end $$;

create function public.cerrar_investigacion(
  p_investigacion uuid,
  p_angulos jsonb,
  p_repetidos integer default 0,
  p_descartados integer default 0
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_investigacion public.investigaciones;
begin
  if p_angulos is null or jsonb_typeof(p_angulos) <> 'array' then
    raise exception using errcode = '22023', message = 'angulos_invalidos';
  end if;
  if coalesce(p_repetidos, -1) < 0 or coalesce(p_descartados, -1) < 0 then
    raise exception using errcode = '22023', message = 'cuentas_invalidas';
  end if;
  select * into v_investigacion from public.investigaciones where id = p_investigacion for update;
  if not found or v_investigacion.estado <> 'investigando' then
    raise exception using errcode = '22023', message = 'investigacion_no_esta_investigando';
  end if;
  -- An extension adds to the list: angles already present by name are kept as they were.
  update public.investigaciones
     set angulos = v_investigacion.angulos || coalesce((
           select jsonb_agg(n.a order by n.orden)
             from jsonb_array_elements(p_angulos) with ordinality as n(a, orden)
            where not exists (select 1 from jsonb_array_elements(v_investigacion.angulos) e
                               where e ->> 'nombre' = n.a ->> 'nombre')), '[]'::jsonb),
         -- An extension or a same-day watch re-run adds its counts to the ones already there.
         repetidos = v_investigacion.repetidos + p_repetidos,
         descartados = v_investigacion.descartados + p_descartados,
         -- The plano sends watched findings straight to the Sunday engine, without a report.
         estado = case when v_investigacion.origen = 'encargo' then 'informe_por_aprobar' else 'aprobada' end,
         cerrada_en = now()
   where id = p_investigacion;
end $$;

-- A re-run the same day (a retry, or topics edited after the first run) gets the day's row back with the current
-- topics and open again, so its close can append; cerrar_investigacion keeps the angles already there.
create function public.crear_vigilancia(p_dia date, p_temas text[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if p_dia is null then
    raise exception using errcode = '22023', message = 'dia_requerido';
  end if;
  insert into public.investigaciones (origen, tema, estado, dia)
  values ('vigilancia', left(array_to_string(p_temas, ' · '), 300), 'investigando', p_dia)
  on conflict (dia) where origen = 'vigilancia'
  do update set tema = excluded.tema, estado = 'investigando', cerrada_en = null
  returning id into v_id;
  return v_id;
end $$;

create function public.guardar_sugerencias(p_sugerencias jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_sugerencias is null or jsonb_typeof(p_sugerencias) <> 'array' or jsonb_array_length(p_sugerencias) > 5 then
    raise exception using errcode = '22023', message = 'sugerencias_invalidas';
  end if;
  delete from public.sugerencias_de_investigacion where true;
  insert into public.sugerencias_de_investigacion (tema, enriquece)
  select btrim(s ->> 'tema'), btrim(s ->> 'enriquece')
    from jsonb_array_elements(p_sugerencias) with ordinality as x(s, orden)
   order by orden;
end $$;

-- guardar_hallazgo (4d) learns which research and angle a finding came from. Body otherwise unchanged.
drop function public.guardar_hallazgo(text, text, text, text, text, real, real, text, date);

create function public.guardar_hallazgo(
  p_resumen text,
  p_enlace text,
  p_enlace_normalizado text,
  p_medio text,
  p_vector text,
  p_umbral_repetido real,
  p_umbral_tema real,
  p_cita text default null,
  p_publicado_en date default null,
  p_investigacion uuid default null,
  p_angulo text default null
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
  insert into public.hallazgos (resumen, cita, enlace, enlace_normalizado, medio, publicado_en, vector, tema_id,
                                investigacion_id, angulo)
  values (p_resumen, p_cita, p_enlace, p_enlace_normalizado, p_medio, p_publicado_en, v_vector, v_tema,
          p_investigacion, p_angulo)
  returning id into v_id;
  if v_tema is not null then
    perform public.recalcular_centroide(v_tema);
  end if;
  return jsonb_build_object('estado', 'guardado', 'id', v_id, 'tema', v_tema);
end $$;

-- Supabase's default privileges grant execute to anon and authenticated otherwise.
revoke execute on function
  public.pedir_investigacion(text, integer, text, text),
  public.pedir_ampliacion(uuid, text),
  public.aprobar_informe(uuid),
  public.descartar_informe(uuid),
  public.descartar_hallazgo(uuid)
from public, anon;
grant execute on function
  public.pedir_investigacion(text, integer, text, text),
  public.pedir_ampliacion(uuid, text),
  public.aprobar_informe(uuid),
  public.descartar_informe(uuid),
  public.descartar_hallazgo(uuid)
to authenticated;

revoke execute on function
  public.tomar_trabajo_de_investigacion(),
  public.terminar_trabajo_de_investigacion(uuid, text, text),
  public.cerrar_investigacion(uuid, jsonb, integer, integer),
  public.crear_vigilancia(date, text[]),
  public.guardar_sugerencias(jsonb),
  public.guardar_hallazgo(text, text, text, text, text, real, real, text, date, uuid, text)
from public, anon, authenticated;
grant execute on function
  public.tomar_trabajo_de_investigacion(),
  public.terminar_trabajo_de_investigacion(uuid, text, text),
  public.cerrar_investigacion(uuid, jsonb, integer, integer),
  public.crear_vigilancia(date, text[]),
  public.guardar_sugerencias(jsonb),
  public.guardar_hallazgo(text, text, text, text, text, real, real, text, date, uuid, text)
to service_role;
