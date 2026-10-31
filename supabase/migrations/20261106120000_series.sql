-- 4f: a series of ideas from an approved report, their assignments to accounts and dates, and the hand-off to the
-- writers (text: a Claude piece; carousel: a design request that 4b renders). Plano: «Armar la serie», «Ideas y
-- series», «Adaptar a cada cuenta», «Escribir texto».
-- 4b, 4c and 4e are in production: what they defined is changed here with alter / create or replace, bodies copied.

-- An idea's skeleton: 1 to 10 beats, each an object with a short «idea» and an optional «tipo». The slide types and the
-- portada/cierre order are checked in lib/series/propuestas.ts; SQL keeps the shape honest.
create function public.esqueleto_valido(p jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select case
    when p is null or jsonb_typeof(p) <> 'array' then false
    when jsonb_array_length(p) not between 1 and 10 then false
    else not exists (
      select 1 from jsonb_array_elements(p) e
       where jsonb_typeof(e) <> 'object'
          or jsonb_typeof(e -> 'idea') is distinct from 'string'
          or length(btrim(e ->> 'idea')) not between 1 and 400
          or (e ? 'tipo' and jsonb_typeof(e -> 'tipo') <> 'string'))
  end
$$;

-- An idea belongs to no brand (D17): the suggested account is a proposal a person confirms.
create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  investigacion_id uuid references public.investigaciones (id) on delete set null,
  orden integer not null default 0,
  gancho text not null check (length(btrim(gancho)) between 1 and 140),
  resumen text not null check (length(btrim(resumen)) between 1 and 600),
  formato text not null check (formato in ('texto', 'carrusel_pdf')),
  esqueleto jsonb not null check (public.esqueleto_valido(esqueleto)),
  fuentes uuid[] not null check (cardinality(fuentes) between 1 and 6),
  cuenta_sugerida uuid not null references public.cuentas (id) on delete cascade,
  razon text not null check (length(btrim(razon)) between 1 and 300),
  pilar_id uuid references public.pilares (id) on delete set null,
  vector extensions.vector(1024) not null,
  estado text not null default 'propuesta' check (estado in ('propuesta', 'aprobada', 'descartada', 'reemplazada')),
  reemplaza_a uuid references public.ideas (id) on delete set null,
  aprobada_por uuid references auth.users (id) on delete set null,
  creada_en timestamptz not null default now()
);
create index ideas_por_investigacion on public.ideas (investigacion_id, orden) where investigacion_id is not null;
create index ideas_por_cuenta on public.ideas (cuenta_sugerida);
create index ideas_por_pilar on public.ideas (pilar_id) where pilar_id is not null;
create index ideas_por_reemplazo on public.ideas (reemplaza_a) where reemplaza_a is not null;
create index ideas_por_aprobador on public.ideas (aprobada_por) where aprobada_por is not null;
create index ideas_propuestas on public.ideas (creada_en) where estado = 'propuesta';

-- A planned but unwritten piece: a piece is born with its first version (huella, gate 1), so the slot lives here.
create table public.asignaciones (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.ideas (id) on delete cascade,
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  formato text not null check (formato in ('texto', 'carrusel_pdf')),
  planeada_para timestamptz not null,
  estado text not null default 'por_escribir'
    check (estado in ('por_escribir', 'escribiendo', 'escrita', 'fallo', 'descartada')),
  pieza_id uuid references public.piezas (id) on delete set null,
  intentos integer not null default 0,
  arrendado_hasta timestamptz,
  motivo text check (length(motivo) <= 500),
  creada_en timestamptz not null default now()
);
-- An open assignment holds its slot like a planned piece does (C2's slot rule).
create unique index asignaciones_un_horario on public.asignaciones (cuenta_id, planeada_para)
  where estado in ('por_escribir', 'escribiendo');
create index asignaciones_por_idea on public.asignaciones (idea_id);
create index asignaciones_por_cuenta on public.asignaciones (cuenta_id);
create index asignaciones_por_pieza on public.asignaciones (pieza_id) where pieza_id is not null;
create index asignaciones_por_escribir on public.asignaciones (planeada_para) where estado in ('por_escribir', 'escribiendo');

-- The research queue (4e) also runs the series jobs: «serie» for a report, «otra_idea» to replace one idea.
alter table public.trabajos_de_investigacion drop constraint trabajos_de_investigacion_tipo_check;
alter table public.trabajos_de_investigacion add constraint trabajos_de_investigacion_tipo_check
  check (tipo in ('investigar', 'ampliar', 'serie', 'otra_idea'));
alter table public.trabajos_de_investigacion add column idea_id uuid references public.ideas (id) on delete cascade;
alter table public.trabajos_de_investigacion add constraint otra_idea_con_idea check ((tipo = 'otra_idea') = (idea_id is not null));
create index trabajos_por_idea on public.trabajos_de_investigacion (idea_id) where idea_id is not null;

-- A carousel written by Claude for an assignment is a design request carrying the assignment's date, origin and line.
alter table public.pedidos_de_diseno add column asignacion_id uuid references public.asignaciones (id) on delete set null;
alter table public.pedidos_de_diseno add column planeada_para timestamptz;
alter table public.pedidos_de_diseno add column origen text not null default 'persona' check (origen in ('persona', 'claude'));
alter table public.pedidos_de_diseno add column linea_version integer check (linea_version >= 1);
alter table public.pedidos_de_diseno add constraint claude_con_linea check (origen = 'persona' or linea_version is not null);
create index pedidos_de_diseno_por_asignacion on public.pedidos_de_diseno (asignacion_id) where asignacion_id is not null;

alter table public.asignaciones add column pedido_de_diseno_id uuid references public.pedidos_de_diseno (id) on delete set null;
create index asignaciones_por_pedido on public.asignaciones (pedido_de_diseno_id) where pedido_de_diseno_id is not null;

alter table public.ideas enable row level security;
alter table public.asignaciones enable row level security;
create policy "con acceso ven ideas" on public.ideas for select to authenticated using (public.tiene_acceso());
create policy "con acceso ven asignaciones" on public.asignaciones for select to authenticated using (public.tiene_acceso());
revoke all on public.ideas, public.asignaciones from anon, authenticated;
grant select on public.ideas, public.asignaciones to authenticated;

-- One slot, two tables ------------------------------------------------------------------------------------------
-- Pieces and open assignments each have their own slot index; these triggers check the other table under one lock
-- per account, so a slot is never held by both whatever path writes it (planear_pieza, firmar_pieza, the reserve, the
-- 4b and 4c saves, the assignment RPCs). 23505 like the slot indexes, so every caller's existing clash handling holds.

create function public.horario_de_pieza_libre() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.planeada_para is null or new.estado not in ('por_aprobar', 'programada', 'publicando', 'publicada') then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.planeada_para = old.planeada_para and new.cuenta_id = old.cuenta_id
     and old.estado in ('por_aprobar', 'programada', 'publicando', 'publicada') then
    return null;
  end if;
  perform pg_advisory_xact_lock(hashtext('horario:' || new.cuenta_id::text));
  if exists (select 1 from public.asignaciones a
              where a.cuenta_id = new.cuenta_id and a.planeada_para = new.planeada_para
                and a.estado in ('por_escribir', 'escribiendo')) then
    raise exception using errcode = '23505', message = 'horario_ocupado';
  end if;
  return null;
end $$;
create trigger piezas_horario_sin_asignacion after insert or update on public.piezas
  for each row execute function public.horario_de_pieza_libre();

create function public.horario_de_asignacion_libre() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.estado not in ('por_escribir', 'escribiendo') then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.planeada_para = old.planeada_para and new.cuenta_id = old.cuenta_id
     and old.estado in ('por_escribir', 'escribiendo') then
    return null;
  end if;
  perform pg_advisory_xact_lock(hashtext('horario:' || new.cuenta_id::text));
  if exists (select 1 from public.piezas p
              where p.cuenta_id = new.cuenta_id and p.planeada_para = new.planeada_para
                and p.estado in ('por_aprobar', 'programada', 'publicando', 'publicada')) then
    raise exception using errcode = '23505', message = 'horario_ocupado';
  end if;
  return null;
end $$;
create trigger asignaciones_horario_sin_pieza after insert or update on public.asignaciones
  for each row execute function public.horario_de_asignacion_libre();

-- C2 keeps its days and hours in TypeScript (proponerFecha); SQL refuses only the past and weekends (D19, Chile time).
create function public.fecha_de_asignacion_valida(p timestamptz) returns boolean
language sql stable set search_path = '' as $$
  select p is not null and p >= now() + interval '1 minute'
     and extract(isodow from p at time zone 'America/Santiago') < 6
$$;

-- People's actions --------------------------------------------------------------------------------------------

-- 4e's body plus the series job: approving a report is what asks for its series.
create or replace function public.aprobar_informe(p_investigacion uuid) returns void
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
  insert into public.trabajos_de_investigacion (investigacion_id, tipo) values (p_investigacion, 'serie');
end $$;

-- 4e's body; only research jobs count as «en curso»: a series job of the same research is not an extension.
create or replace function public.pedir_ampliacion(p_investigacion uuid, p_angulo text) returns uuid
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
              where investigacion_id = p_investigacion and estado in ('pendiente', 'trabajando')
                and tipo in ('investigar', 'ampliar')) then
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

-- For a report approved before 4f, or whose series job failed: only while it has no ideas and no open series job.
create function public.pedir_serie(p_investigacion uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not public.es_dueno_de_alguna() then
    raise exception using errcode = '42501', message = 'solo_duenos_investigan';
  end if;
  perform 1 from public.investigaciones
   where id = p_investigacion and origen = 'encargo' and estado = 'aprobada' for update;
  if not found
     or exists (select 1 from public.ideas where investigacion_id = p_investigacion)
     or exists (select 1 from public.trabajos_de_investigacion
                 where investigacion_id = p_investigacion and tipo = 'serie' and estado in ('pendiente', 'trabajando')) then
    raise exception using errcode = '22023', message = 'serie_no_disponible';
  end if;
  insert into public.trabajos_de_investigacion (investigacion_id, tipo) values (p_investigacion, 'serie')
  returning id into v_id;
  return v_id;
end $$;

-- p_asignaciones: [{ cuenta, planeada_para }], the dates proposed by the app (repartirFechas). Owners of each target
-- account's brand only. A clash with a piece or another assignment is 23505 horario_ocupado: the app retries once.
-- Refused while a replacement of the idea is being written (otra_idea): its result would replace an approved idea.
create function public.aprobar_idea(p_idea uuid, p_asignaciones jsonb) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare
  v_idea public.ideas;
  v_item jsonb;
  v_cuenta uuid;
  v_fecha timestamptz;
  v_marca uuid;
  v_cuentas uuid[] := '{}';
  v_fechas timestamptz[] := '{}';
  v_id uuid;
  v_ids uuid[] := '{}';
begin
  if not public.es_dueno_de_alguna() then
    raise exception using errcode = '42501', message = 'solo_el_dueno_aprueba';
  end if;
  if p_asignaciones is null or jsonb_typeof(p_asignaciones) <> 'array'
     or jsonb_array_length(p_asignaciones) not between 1 and 10 then
    raise exception using errcode = '22023', message = 'asignaciones_invalidas';
  end if;
  select * into v_idea from public.ideas where id = p_idea for update;
  if not found or v_idea.estado <> 'propuesta' then
    raise exception using errcode = '22023', message = 'idea_no_esta_propuesta';
  end if;
  if exists (select 1 from public.trabajos_de_investigacion
              where idea_id = p_idea and tipo = 'otra_idea' and estado in ('pendiente', 'trabajando')) then
    raise exception using errcode = '22023', message = 'trabajo_en_curso';
  end if;
  for v_item in select e from jsonb_array_elements(p_asignaciones) with ordinality as x(e, n) order by n loop
    begin
      v_cuenta := (v_item ->> 'cuenta')::uuid;
      v_fecha := (v_item ->> 'planeada_para')::timestamptz;
    exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
      raise exception using errcode = '22023', message = 'asignaciones_invalidas';
    end;
    if v_cuenta is null then
      raise exception using errcode = '22023', message = 'asignaciones_invalidas';
    end if;
    select marca_id into v_marca from public.cuentas where id = v_cuenta;
    if v_marca is null or not public.es_dueno(v_marca) then
      raise exception using errcode = '42501', message = 'solo_el_dueno_aprueba';
    end if;
    if not public.fecha_de_asignacion_valida(v_fecha) then
      raise exception using errcode = '22023', message = 'fecha_no_valida';
    end if;
    if v_cuenta = any (v_cuentas)
       or exists (select 1 from public.asignaciones where idea_id = p_idea and cuenta_id = v_cuenta) then
      raise exception using errcode = '22023', message = 'cuenta_repetida';
    end if;
    v_cuentas := v_cuentas || v_cuenta;
    v_fechas := v_fechas || v_fecha;
  end loop;
  -- The insert trigger locks each account's slots (horario_de_asignacion_libre). Taking them all first, in one order,
  -- keeps two approvals that share accounts from each holding one and waiting on the other.
  for v_cuenta in select c from unnest(v_cuentas) c order by c loop
    perform pg_advisory_xact_lock(hashtext('horario:' || v_cuenta::text));
  end loop;
  for n in 1 .. cardinality(v_cuentas) loop
    begin
      insert into public.asignaciones (idea_id, cuenta_id, formato, planeada_para)
      values (p_idea, v_cuentas[n], v_idea.formato, v_fechas[n])
      returning id into v_id;
    exception when unique_violation then
      raise exception using errcode = '23505', message = 'horario_ocupado';
    end;
    v_ids := v_ids || v_id;
  end loop;
  update public.ideas set estado = 'aprobada', aprobada_por = auth.uid() where id = p_idea;
  return v_ids;
end $$;

-- A proposal or an approved idea. An approved one takes its unwritten assignments with it; written pieces stay, and
-- one being written right now finishes and arrives at gate 1, where it can be discarded too.
create function public.descartar_idea(p_idea uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_estado text;
begin
  if not public.es_dueno_de_alguna() then
    raise exception using errcode = '42501', message = 'solo_duenos_investigan';
  end if;
  select estado into v_estado from public.ideas where id = p_idea for update;
  if v_estado is null or v_estado not in ('propuesta', 'aprobada') then
    raise exception using errcode = '22023', message = 'idea_no_descartable';
  end if;
  if exists (select 1 from public.asignaciones a join public.cuentas c on c.id = a.cuenta_id
              where a.idea_id = p_idea and a.estado = 'por_escribir' and not public.es_dueno(c.marca_id)) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_aprueba';
  end if;
  update public.ideas set estado = 'descartada' where id = p_idea;
  update public.asignaciones set estado = 'descartada' where idea_id = p_idea and estado = 'por_escribir';
end $$;

create function public.editar_idea(p_idea uuid, p_gancho text, p_esqueleto jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_dueno_de_alguna() then
    raise exception using errcode = '42501', message = 'solo_duenos_investigan';
  end if;
  if not public.esqueleto_valido(p_esqueleto) then
    raise exception using errcode = '22023', message = 'esqueleto_no_valido';
  end if;
  update public.ideas set gancho = btrim(p_gancho), esqueleto = p_esqueleto
   where id = p_idea and estado = 'propuesta';
  if not found then
    raise exception using errcode = '22023', message = 'idea_no_editable';
  end if;
end $$;

-- Queues a replacement; guardar_serie with reemplaza_a saves it and marks this one reemplazada.
create function public.pedir_otra_idea(p_idea uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_idea public.ideas;
  v_id uuid;
begin
  if not public.es_dueno_de_alguna() then
    raise exception using errcode = '42501', message = 'solo_duenos_investigan';
  end if;
  select * into v_idea from public.ideas where id = p_idea for update;
  if not found or v_idea.estado <> 'propuesta' or v_idea.investigacion_id is null then
    raise exception using errcode = '22023', message = 'idea_no_esta_propuesta';
  end if;
  if exists (select 1 from public.trabajos_de_investigacion
              where idea_id = p_idea and estado in ('pendiente', 'trabajando')) then
    raise exception using errcode = '22023', message = 'trabajo_en_curso';
  end if;
  insert into public.trabajos_de_investigacion (investigacion_id, tipo, idea_id)
  values (v_idea.investigacion_id, 'otra_idea', p_idea)
  returning id into v_id;
  return v_id;
end $$;

-- Before it is written; after that the piece moves as any other (planear_pieza).
create function public.mover_asignacion(p_asignacion uuid, p_fecha timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_asignacion public.asignaciones;
begin
  select * into v_asignacion from public.asignaciones where id = p_asignacion for update;
  if not found or not public.es_dueno((select marca_id from public.cuentas where id = v_asignacion.cuenta_id)) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_planea';
  end if;
  if v_asignacion.estado <> 'por_escribir' then
    raise exception using errcode = '22023', message = 'asignacion_no_movible';
  end if;
  if not public.fecha_de_asignacion_valida(p_fecha) then
    raise exception using errcode = '22023', message = 'fecha_no_valida';
  end if;
  begin
    update public.asignaciones set planeada_para = p_fecha where id = p_asignacion;
  exception when unique_violation then
    raise exception using errcode = '23505', message = 'horario_ocupado';
  end;
end $$;

-- Trigger.dev's side (service role) ----------------------------------------------------------------------------

-- p_ideas: [{ gancho, resumen, formato, esqueleto, fuentes, cuenta, razon, pilar, vector, reemplaza_a? }], already
-- validated and deduplicated by lib/series/armar.ts. One with reemplaza_a takes the place (and order) of that proposal.
create function public.guardar_serie(p_investigacion uuid, p_ideas jsonb) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare
  v_investigacion public.investigaciones;
  v_idea jsonb;
  v_orden integer;
  v_orden_de_esta integer;
  v_cuenta uuid;
  v_marca uuid;
  v_pilar uuid;
  v_fuentes uuid[];
  v_reemplaza uuid;
  v_vieja public.ideas;
  v_id uuid;
  v_ids uuid[] := '{}';
begin
  if p_ideas is null or jsonb_typeof(p_ideas) <> 'array' or jsonb_array_length(p_ideas) not between 1 and 30 then
    raise exception using errcode = '22023', message = 'ideas_invalidas';
  end if;
  select * into v_investigacion from public.investigaciones where id = p_investigacion for update;
  if not found or v_investigacion.estado <> 'aprobada' then
    raise exception using errcode = '22023', message = 'investigacion_no_aprobada';
  end if;
  select coalesce(max(orden), 0) into v_orden from public.ideas where investigacion_id = p_investigacion;
  for v_idea in select e from jsonb_array_elements(p_ideas) with ordinality as x(e, n) order by n loop
    v_cuenta := nullif(v_idea ->> 'cuenta', '')::uuid;
    select marca_id into v_marca from public.cuentas where id = v_cuenta;
    if v_marca is null then
      raise exception using errcode = '22023', message = 'cuenta_desconocida';
    end if;
    v_pilar := nullif(v_idea ->> 'pilar', '')::uuid;
    if v_pilar is not null and not exists (
      select 1 from public.pilares where id = v_pilar and marca_id = v_marca and activo
    ) then
      raise exception using errcode = '22023', message = 'pilar_no_valido';
    end if;
    if jsonb_typeof(v_idea -> 'fuentes') is distinct from 'array' then
      raise exception using errcode = '22023', message = 'fuente_ajena';
    end if;
    select array_agg(distinct f::uuid) into v_fuentes from jsonb_array_elements_text(v_idea -> 'fuentes') f;
    if v_fuentes is null or exists (
      select 1 from unnest(v_fuentes) f
       where not exists (select 1 from public.hallazgos h where h.id = f and h.investigacion_id = p_investigacion)
    ) then
      raise exception using errcode = '22023', message = 'fuente_ajena';
    end if;
    if not public.esqueleto_valido(v_idea -> 'esqueleto') then
      raise exception using errcode = '22023', message = 'esqueleto_no_valido';
    end if;
    v_reemplaza := nullif(v_idea ->> 'reemplaza_a', '')::uuid;
    if v_reemplaza is not null then
      select * into v_vieja from public.ideas where id = v_reemplaza for update;
      if not found or v_vieja.estado <> 'propuesta' or v_vieja.investigacion_id is distinct from p_investigacion then
        raise exception using errcode = '22023', message = 'idea_no_reemplazable';
      end if;
      update public.ideas set estado = 'reemplazada' where id = v_reemplaza;
      v_orden_de_esta := v_vieja.orden;
    else
      v_orden := v_orden + 1;
      v_orden_de_esta := v_orden;
    end if;
    insert into public.ideas (investigacion_id, orden, gancho, resumen, formato, esqueleto, fuentes, cuenta_sugerida,
                              razon, pilar_id, vector, reemplaza_a)
    values (p_investigacion, v_orden_de_esta, btrim(v_idea ->> 'gancho'), btrim(v_idea ->> 'resumen'),
            v_idea ->> 'formato', v_idea -> 'esqueleto', v_fuentes, v_cuenta, btrim(v_idea ->> 'razon'), v_pilar,
            (v_idea ->> 'vector')::extensions.vector, v_reemplaza)
    returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;
  return v_ids;
end $$;

-- Earlier ideas at or above the threshold, in every state but reemplazada: approved ones are planned or written, and
-- discarded ones never come back (plano «Armar la serie»).
create function public.ideas_parecidas(p_vector text, p_umbral real, p_excepto uuid[] default '{}')
returns table (id uuid, gancho text, estado text, similitud real)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_vector extensions.vector := p_vector::extensions.vector;
begin
  return query
  select i.id, i.gancho, i.estado, (1 - (i.vector operator(extensions.<=>) v_vector))::real
    from public.ideas i
   where i.estado <> 'reemplazada'
     and not (i.id = any (coalesce(p_excepto, '{}')))
     and 1 - (i.vector operator(extensions.<=>) v_vector) >= p_umbral
   order by i.vector operator(extensions.<=>) v_vector
   limit 20;
end $$;

-- Leases due assignments (planeada_para <= p_hasta), soonest first. A lease that expired means the run died on it;
-- after two of those it is closed instead of taken again (the guard of 4b and 4e). An assignment whose carousel is
-- rendering has no lease (pedido_de_diseno_id set): 4b's request owns it then.
create function public.tomar_asignaciones(p_hasta timestamptz, p_limite integer) returns setof public.asignaciones
language plpgsql security definer set search_path = '' as $$
begin
  update public.asignaciones
     set estado = 'fallo', motivo = 'No pude escribir esta pieza después de dos intentos.', arrendado_hasta = null
   where estado = 'escribiendo' and arrendado_hasta < now() and intentos >= 2;
  return query
  update public.asignaciones a
     set estado = 'escribiendo', arrendado_hasta = now() + interval '15 minutes', intentos = a.intentos + 1,
         motivo = null
   where a.id in (
     select id from public.asignaciones
      where (estado = 'por_escribir' and planeada_para <= p_hasta)
         or (estado = 'escribiendo' and arrendado_hasta < now())
      order by planeada_para
      limit greatest(1, least(coalesce(p_limite, 1), 10))
      for update skip locked)
  returning a.*;
end $$;

create function public.fallar_asignacion(p_asignacion uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.asignaciones
     set estado = 'fallo', motivo = left(p_motivo, 500), arrendado_hasta = null
   where id = p_asignacion and estado = 'escribiendo';
end $$;

-- The idea's pillar only when it belongs to this account's brand and is active: an idea confirmed for another brand's
-- account carries no pillar there.
create function public.pilar_de_idea_en_cuenta(p_idea uuid, p_cuenta uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select pi.id
    from public.ideas i
    join public.pilares pi on pi.id = i.pilar_id and pi.activo
    join public.cuentas c on c.marca_id = pi.marca_id
   where i.id = p_idea and c.id = p_cuenta
$$;

-- Model: 4c's crear_pieza_de_claude. The assignment hands its slot to the piece, so it closes first.
create function public.crear_pieza_de_asignacion(
  p_asignacion uuid, p_texto text, p_linea_version integer, p_planeada_para timestamptz
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_asignacion public.asignaciones;
  v_idea public.ideas;
  v_pieza uuid;
  v_version uuid;
begin
  select * into v_asignacion from public.asignaciones where id = p_asignacion for update;
  if not found or v_asignacion.estado <> 'escribiendo' or v_asignacion.formato <> 'texto' then
    raise exception using errcode = '22023', message = 'asignacion_no_esta_escribiendo';
  end if;
  select * into v_idea from public.ideas where id = v_asignacion.idea_id;
  if v_idea.aprobada_por is null then
    raise exception using errcode = '22023', message = 'idea_sin_aprobador';
  end if;
  update public.asignaciones set estado = 'escrita', arrendado_hasta = null, motivo = null where id = p_asignacion;
  insert into public.piezas (cuenta_id, formato, creada_por, pilar_id, planeada_para)
  values (v_asignacion.cuenta_id, 'texto', v_idea.aprobada_por,
          public.pilar_de_idea_en_cuenta(v_idea.id, v_asignacion.cuenta_id), p_planeada_para)
  returning id into v_pieza;
  insert into public.versiones (pieza_id, numero, texto, origen, linea_version)
  values (v_pieza, 1, p_texto, 'claude', p_linea_version)
  returning id into v_version;
  update public.asignaciones set pieza_id = v_pieza where id = p_asignacion;
  update public.hallazgos set estado = 'usado' where id = any (v_idea.fuentes) and estado = 'nuevo';
  return jsonb_build_object('pieza', v_pieza, 'version', v_version);
end $$;

-- The carousel is queued for 4b's renderer; the assignment keeps its slot, without a lease, until guardar_diseno.
create function public.pedir_diseno_de_asignacion(
  p_asignacion uuid, p_tema text, p_titulo text, p_texto text, p_diseno jsonb, p_linea_version integer,
  p_planeada_para timestamptz
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_asignacion public.asignaciones;
  v_idea public.ideas;
  v_voz text;
  v_id uuid;
begin
  select * into v_asignacion from public.asignaciones where id = p_asignacion for update;
  if not found or v_asignacion.estado <> 'escribiendo' or v_asignacion.formato <> 'carrusel_pdf' then
    raise exception using errcode = '22023', message = 'asignacion_no_esta_escribiendo';
  end if;
  select * into v_idea from public.ideas where id = v_asignacion.idea_id;
  if v_idea.aprobada_por is null then
    raise exception using errcode = '22023', message = 'idea_sin_aprobador';
  end if;
  select m.voz into v_voz from public.cuentas c join public.marcas m on m.id = c.marca_id where c.id = v_asignacion.cuenta_id;
  if not public.tema_de_la_voz(p_tema, v_voz) then
    raise exception using errcode = '22023', message = 'tema_de_otra_marca';
  end if;
  insert into public.pedidos_de_diseno (cuenta_id, tema, titulo, texto, diseno, pedido_por, asignacion_id,
                                        planeada_para, origen, linea_version)
  values (v_asignacion.cuenta_id, p_tema, btrim(p_titulo), btrim(p_texto), p_diseno, v_idea.aprobada_por,
          p_asignacion, p_planeada_para, 'claude', p_linea_version)
  returning id into v_id;
  update public.asignaciones set pedido_de_diseno_id = v_id, arrendado_hasta = null where id = p_asignacion;
  return v_id;
end $$;

-- 4e's body; series jobs never move the approved report they belong to (only investigar and ampliar mark it).
create or replace function public.tomar_trabajo_de_investigacion() returns setof public.trabajos_de_investigacion
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
   where i.id = v.investigacion_id and i.estado = 'investigando' and v.tipo in ('investigar', 'ampliar');

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
     where i.id = tomado.investigacion_id and tomado.tipo in ('investigar', 'ampliar')
  )
  select * from tomado;
end $$;

-- 4e's body; a failed series job leaves the approved report as it was.
create or replace function public.terminar_trabajo_de_investigacion(p_trabajo uuid, p_estado text, p_motivo text default null)
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
  elsif v_trabajo.tipo = 'ampliar' then
    -- The report being extended still stands.
    update public.investigaciones set estado = 'informe_por_aprobar'
     where id = v_trabajo.investigacion_id and estado = 'investigando';
  end if;
end $$;

-- 4b's body; a request closed by the guard also closes its assignment, which would otherwise hold its slot forever.
create or replace function public.tomar_pedidos_de_diseno() returns setof public.pedidos_de_diseno
language plpgsql security definer set search_path = '' as $$
begin
  with vencidos as (
    update public.pedidos_de_diseno
       set estado = 'fallo',
           motivo = 'No pude armar el carrusel después de dos intentos. Revisa las láminas o pídelo de nuevo.',
           terminado_en = now(), arrendado_hasta = null
     where estado = 'trabajando' and arrendado_hasta < now() and intentos >= 2
    returning asignacion_id, motivo
  )
  update public.asignaciones a
     set estado = 'fallo', motivo = v.motivo, arrendado_hasta = null
    from vencidos v
   where a.id = v.asignacion_id and a.estado = 'escribiendo';
  return query
  update public.pedidos_de_diseno p
     set estado = 'trabajando', arrendado_hasta = now() + interval '10 minutes', intentos = p.intentos + 1
   where p.id in (
     select id from public.pedidos_de_diseno
      where estado = 'pendiente' or (estado = 'trabajando' and arrendado_hasta < now())
      order by creado_en
      limit 1
      for update skip locked)
  returning p.*;
end $$;

-- 4b's body; a failed request closes its assignment with the same reason (overflow: «La lámina N no cabe»).
create or replace function public.terminar_pedido_de_diseno(p_pedido uuid, p_estado text, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_asignacion uuid;
begin
  if p_estado not in ('fallo', 'obsoleto') then
    raise exception using errcode = '22023', message = 'estado_de_pedido_invalido';
  end if;
  update public.pedidos_de_diseno
     set estado = p_estado, motivo = left(p_motivo, 500), terminado_en = now(), arrendado_hasta = null
   where id = p_pedido and estado = 'trabajando'
  returning asignacion_id into v_asignacion;
  if v_asignacion is not null then
    update public.asignaciones set estado = 'fallo', motivo = left(p_motivo, 500), arrendado_hasta = null
     where id = v_asignacion and estado = 'escribiendo';
  end if;
end $$;

-- 4b's body. A request for an assignment (4f) writes its piece on the assignment's date, with Claude as origin, the
-- line version, and the idea's pillar; the assignment becomes escrita and the idea's findings usado. The renderer's
-- p_planeada_para is the fallback when that date is gone (past, or taken despite the assignment holding it).
create or replace function public.guardar_diseno(
  p_pedido uuid, p_archivo_ruta text, p_archivo_sha256 text, p_planeada_para timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_pedido public.pedidos_de_diseno;
  v_pieza public.piezas;
  v_ultima public.versiones;
  v_pieza_id uuid;
  v_version uuid;
  v_asignacion public.asignaciones;
  v_plan timestamptz := p_planeada_para;
  v_pilar uuid;
  v_fuentes uuid[];
begin
  select * into v_pedido from public.pedidos_de_diseno where id = p_pedido for update;
  if not found or v_pedido.estado <> 'trabajando' then
    raise exception using errcode = '22023', message = 'pedido_no_esta_trabajando';
  end if;
  if v_pedido.pieza_id is null then
    if v_pedido.asignacion_id is not null then
      select * into v_asignacion from public.asignaciones where id = v_pedido.asignacion_id for update;
      update public.asignaciones set estado = 'escrita', arrendado_hasta = null, motivo = null
       where id = v_pedido.asignacion_id;
      v_pilar := public.pilar_de_idea_en_cuenta(v_asignacion.idea_id, v_pedido.cuenta_id);
      perform pg_advisory_xact_lock(hashtext('horario:' || v_pedido.cuenta_id::text));
      if v_pedido.planeada_para >= now() + interval '1 minute'
         and not exists (select 1 from public.piezas
                          where cuenta_id = v_pedido.cuenta_id and planeada_para = v_pedido.planeada_para
                            and estado in ('por_aprobar', 'programada', 'publicando', 'publicada'))
         and not exists (select 1 from public.asignaciones
                          where cuenta_id = v_pedido.cuenta_id and planeada_para = v_pedido.planeada_para
                            and estado in ('por_escribir', 'escribiendo')) then
        v_plan := v_pedido.planeada_para;
      end if;
    end if;
    insert into public.piezas (cuenta_id, formato, creada_por, planeada_para, pilar_id)
    values (v_pedido.cuenta_id, 'carrusel_pdf', v_pedido.pedido_por, v_plan, v_pilar)
    returning id into v_pieza_id;
    insert into public.versiones (pieza_id, numero, texto, titulo, archivo_ruta, archivo_sha256, creada_por, tema, diseno,
                                  origen, linea_version)
    values (v_pieza_id, 1, v_pedido.texto, v_pedido.titulo, p_archivo_ruta, p_archivo_sha256,
            case when v_pedido.origen = 'claude' then null else v_pedido.pedido_por end,
            v_pedido.tema, v_pedido.diseno, v_pedido.origen, v_pedido.linea_version)
    returning id into v_version;
    if v_asignacion.id is not null then
      update public.asignaciones set pieza_id = v_pieza_id where id = v_asignacion.id;
      select fuentes into v_fuentes from public.ideas where id = v_asignacion.idea_id;
      update public.hallazgos set estado = 'usado' where id = any (v_fuentes) and estado = 'nuevo';
    end if;
  else
    select * into v_pieza from public.piezas where id = v_pedido.pieza_id for update;
    select * into v_ultima from public.versiones where pieza_id = v_pedido.pieza_id order by numero desc limit 1;
    if not found or v_pieza.estado not in ('por_aprobar', 'en_reserva', 'programada', 'a_mano')
       or v_ultima.id is distinct from v_pedido.version_base_id then
      update public.pedidos_de_diseno
         set estado = 'obsoleto', motivo = 'La pieza cambió mientras se armaba el carrusel; no se aplicó.',
             terminado_en = now(), arrendado_hasta = null
       where id = p_pedido;
      return null;
    end if;
    v_pieza_id := v_pieza.id;
    -- The versions trigger drops a vigente signature and sends a scheduled piece back to por_aprobar.
    insert into public.versiones (pieza_id, numero, texto, titulo, archivo_ruta, archivo_sha256, creada_por, tema, diseno)
    values (v_pieza_id, v_ultima.numero + 1, v_pedido.texto, v_pedido.titulo, p_archivo_ruta, p_archivo_sha256,
            v_pedido.pedido_por, v_pedido.tema, v_pedido.diseno)
    returning id into v_version;
  end if;
  update public.pedidos_de_diseno
     set estado = 'hecho', resultado_pieza_id = v_pieza_id, terminado_en = now(), arrendado_hasta = null
   where id = p_pedido;
  return jsonb_build_object('pieza', v_pieza_id, 'version', v_version);
end $$;

-- Grants. create or replace kept the grants of the redefined functions. Supabase's default privileges grant execute
-- to anon and authenticated otherwise.
revoke execute on function
  public.pedir_serie(uuid),
  public.aprobar_idea(uuid, jsonb),
  public.descartar_idea(uuid),
  public.editar_idea(uuid, text, jsonb),
  public.pedir_otra_idea(uuid),
  public.mover_asignacion(uuid, timestamptz),
  public.esqueleto_valido(jsonb),
  public.fecha_de_asignacion_valida(timestamptz)
from public, anon;
grant execute on function
  public.pedir_serie(uuid),
  public.aprobar_idea(uuid, jsonb),
  public.descartar_idea(uuid),
  public.editar_idea(uuid, text, jsonb),
  public.pedir_otra_idea(uuid),
  public.mover_asignacion(uuid, timestamptz),
  public.esqueleto_valido(jsonb),
  public.fecha_de_asignacion_valida(timestamptz)
to authenticated;
grant execute on function public.esqueleto_valido(jsonb), public.fecha_de_asignacion_valida(timestamptz) to service_role;

revoke execute on function
  public.guardar_serie(uuid, jsonb),
  public.ideas_parecidas(text, real, uuid[]),
  public.tomar_asignaciones(timestamptz, integer),
  public.fallar_asignacion(uuid, text),
  public.pilar_de_idea_en_cuenta(uuid, uuid),
  public.crear_pieza_de_asignacion(uuid, text, integer, timestamptz),
  public.pedir_diseno_de_asignacion(uuid, text, text, text, jsonb, integer, timestamptz),
  public.horario_de_pieza_libre(),
  public.horario_de_asignacion_libre()
from public, anon, authenticated;
grant execute on function
  public.guardar_serie(uuid, jsonb),
  public.ideas_parecidas(text, real, uuid[]),
  public.tomar_asignaciones(timestamptz, integer),
  public.fallar_asignacion(uuid, text),
  public.crear_pieza_de_asignacion(uuid, text, integer, timestamptz),
  public.pedir_diseno_de_asignacion(uuid, text, text, text, jsonb, integer, timestamptz)
to service_role;
