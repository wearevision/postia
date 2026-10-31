-- 4g: ideas nobody asked for. Crosses of two findings at a middle distance, loose ideas from the Sunday engine, and the
-- crosses of an approved report against the rest of the map. Plano: «Cruces: ideas que nacen de dos hallazgos»,
-- «Motor semanal: ideas sueltas», «Cruzar hallazgos», «Motor semanal de ideas».
-- 4e and 4f are in production: what they defined is changed here with alter / create or replace, bodies copied.

-- Where an idea comes from. A series idea hangs from its report; a cross or a Sunday idea from no research.
alter table public.ideas add column origen text not null default 'serie' check (origen in ('serie', 'cruce', 'domingo'));
alter table public.ideas add constraint serie_con_investigacion check ((origen = 'serie') = (investigacion_id is not null));
create index ideas_sueltas on public.ideas (origen, creada_en desc) where investigacion_id is null;
-- 4f's «on delete set null» would turn a series idea into one with no research, which serie_con_investigacion refuses
-- with a check error. The app never deletes research: the refusal is the foreign key's, explicit.
alter table public.ideas drop constraint ideas_investigacion_id_fkey;
alter table public.ideas add constraint ideas_investigacion_id_fkey
  foreign key (investigacion_id) references public.investigaciones (id) on delete restrict;

-- A pair whose cross was dropped as near-duplicate of an earlier idea: pares_para_cruzar never offers it again, or every
-- run would pay to cross it once more. a < b, so a pair has one row. Service role only (RLS on, no policies).
create table public.pares_descartados (
  a uuid not null references public.hallazgos (id) on delete cascade,
  b uuid not null references public.hallazgos (id) on delete cascade,
  creado_en timestamptz not null default now(),
  primary key (a, b),
  constraint par_ordenado check (a < b)
);
create index pares_descartados_b on public.pares_descartados (b);
alter table public.pares_descartados enable row level security;
revoke all on public.pares_descartados from anon, authenticated;

-- The research queue also runs the crosses of an approved report. A replacement for an idea with no research
-- (otra_idea of a cross or a Sunday idea) is the only job without a research.
alter table public.trabajos_de_investigacion drop constraint trabajos_de_investigacion_tipo_check;
alter table public.trabajos_de_investigacion add constraint trabajos_de_investigacion_tipo_check
  check (tipo in ('investigar', 'ampliar', 'serie', 'otra_idea', 'cruces'));
alter table public.trabajos_de_investigacion alter column investigacion_id drop not null;
alter table public.trabajos_de_investigacion add constraint con_investigacion
  check (investigacion_id is not null or tipo = 'otra_idea');

-- People's actions --------------------------------------------------------------------------------------------

-- 4f's body plus the crosses job. tomar_trabajo_de_investigacion takes the oldest first and both rows share now():
-- the crosses job is stamped with the clock so the series comes first.
create or replace function public.aprobar_informe(p_investigacion uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_origen text;
begin
  if not public.es_dueno_de_alguna() then
    raise exception using errcode = '42501', message = 'solo_duenos_investigan';
  end if;
  update public.investigaciones set estado = 'aprobada'
   where id = p_investigacion and estado = 'informe_por_aprobar'
  returning origen into v_origen;
  if not found then
    raise exception using errcode = '22023', message = 'informe_no_esta_por_aprobar';
  end if;
  if v_origen = 'encargo' then
    insert into public.trabajos_de_investigacion (investigacion_id, tipo) values (p_investigacion, 'serie');
    insert into public.trabajos_de_investigacion (investigacion_id, tipo, creado_en)
    values (p_investigacion, 'cruces', clock_timestamp());
  end if;
end $$;

-- 4f's body, also for an idea with no research (a cross or a Sunday idea): its job carries no research.
create or replace function public.pedir_otra_idea(p_idea uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_idea public.ideas;
  v_id uuid;
begin
  if not public.es_dueno_de_alguna() then
    raise exception using errcode = '42501', message = 'solo_duenos_investigan';
  end if;
  select * into v_idea from public.ideas where id = p_idea for update;
  if not found or v_idea.estado <> 'propuesta' then
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

-- Trigger.dev's side (service role) ----------------------------------------------------------------------------

-- The suggested account and its optional pillar, which must belong to that account's brand and be active. Shared by
-- guardar_serie and guardar_ideas_sueltas so both keep one rule.
create function public.cuenta_y_pilar_de_idea(p_idea jsonb, out cuenta uuid, out pilar uuid)
language plpgsql stable set search_path = '' as $$
declare
  v_marca uuid;
begin
  cuenta := nullif(p_idea ->> 'cuenta', '')::uuid;
  select c.marca_id into v_marca from public.cuentas c where c.id = cuenta;
  if v_marca is null then
    raise exception using errcode = '22023', message = 'cuenta_desconocida';
  end if;
  pilar := nullif(p_idea ->> 'pilar', '')::uuid;
  if pilar is not null and not exists (
    select 1 from public.pilares pi where pi.id = pilar and pi.marca_id = v_marca and pi.activo
  ) then
    raise exception using errcode = '22023', message = 'pilar_no_valido';
  end if;
end $$;

-- 4f's body; the account and pillar checks moved to cuenta_y_pilar_de_idea, same order and errors.
create or replace function public.guardar_serie(p_investigacion uuid, p_ideas jsonb) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare
  v_investigacion public.investigaciones;
  v_idea jsonb;
  v_orden integer;
  v_orden_de_esta integer;
  v_cuenta uuid;
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
    select x.cuenta, x.pilar into v_cuenta, v_pilar from public.cuenta_y_pilar_de_idea(v_idea) x;
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

-- p_ideas: as in guardar_serie, already validated and deduplicated by lib/ideas. Sources are any findings of the map
-- that are not discarded; a cross has exactly its two. One with reemplaza_a takes the place of a proposal of the same
-- origin (otra_idea of a cross or a Sunday idea).
create function public.guardar_ideas_sueltas(p_ideas jsonb, p_origen text) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare
  v_idea jsonb;
  v_cuenta uuid;
  v_pilar uuid;
  v_fuentes uuid[];
  v_reemplaza uuid;
  v_vieja public.ideas;
  v_id uuid;
  v_ids uuid[] := '{}';
begin
  if p_origen is null or p_origen not in ('cruce', 'domingo') then
    raise exception using errcode = '22023', message = 'origen_no_valido';
  end if;
  if p_ideas is null or jsonb_typeof(p_ideas) <> 'array' or jsonb_array_length(p_ideas) not between 1 and 30 then
    raise exception using errcode = '22023', message = 'ideas_invalidas';
  end if;
  for v_idea in select e from jsonb_array_elements(p_ideas) with ordinality as x(e, n) order by n loop
    select x.cuenta, x.pilar into v_cuenta, v_pilar from public.cuenta_y_pilar_de_idea(v_idea) x;
    if jsonb_typeof(v_idea -> 'fuentes') is distinct from 'array' then
      raise exception using errcode = '22023', message = 'fuente_no_valida';
    end if;
    select array_agg(distinct f::uuid) into v_fuentes from jsonb_array_elements_text(v_idea -> 'fuentes') f;
    if v_fuentes is null or exists (
      select 1 from unnest(v_fuentes) f
       where not exists (select 1 from public.hallazgos h where h.id = f and h.estado <> 'descartado')
    ) then
      raise exception using errcode = '22023', message = 'fuente_no_valida';
    end if;
    if p_origen = 'cruce' and cardinality(v_fuentes) <> 2 then
      raise exception using errcode = '22023', message = 'cruce_sin_dos_fuentes';
    end if;
    if not public.esqueleto_valido(v_idea -> 'esqueleto') then
      raise exception using errcode = '22023', message = 'esqueleto_no_valido';
    end if;
    v_reemplaza := nullif(v_idea ->> 'reemplaza_a', '')::uuid;
    if v_reemplaza is not null then
      select * into v_vieja from public.ideas where id = v_reemplaza for update;
      if not found or v_vieja.estado <> 'propuesta' or v_vieja.origen <> p_origen then
        raise exception using errcode = '22023', message = 'idea_no_reemplazable';
      end if;
      update public.ideas set estado = 'reemplazada' where id = v_reemplaza;
    end if;
    insert into public.ideas (origen, gancho, resumen, formato, esqueleto, fuentes, cuenta_sugerida, razon, pilar_id,
                              vector, reemplaza_a)
    values (p_origen, btrim(v_idea ->> 'gancho'), btrim(v_idea ->> 'resumen'), v_idea ->> 'formato',
            v_idea -> 'esqueleto', v_fuentes, v_cuenta, btrim(v_idea ->> 'razon'), v_pilar,
            (v_idea ->> 'vector')::extensions.vector, v_reemplaza)
    returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;
  return v_ids;
end $$;

-- Candidate pairs for crossing (plano «Cruzar hallazgos»). Side A: the findings created since p_desde, or the findings of
-- p_investigacion (then side B is the rest of the map). Both sides leave out discarded findings. Ranked by: topics that
-- differ (or a finding with none), a topic pair no earlier cross used, newer A, closer to the band's middle. Pairs any
-- idea already used together, and pairs whose cross was dropped (pares_descartados), are left out, and each finding
-- appears once: the best pair it is in wins.
create function public.pares_para_cruzar(
  p_desde timestamptz, p_minimo real, p_maximo real, p_limite integer, p_investigacion uuid default null
) returns table (a uuid, b uuid, similitud real, tema_a uuid, tema_b uuid)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_medio real := (p_minimo + p_maximo) / 2;
  v_limite integer := greatest(0, least(coalesce(p_limite, 0), 50));
  v_usados uuid[] := '{}';
  v_par record;
begin
  if v_limite = 0 then
    return;
  end if;
  for v_par in
    with lado_a as (
      select h.id, h.tema_id, h.vector, h.creado_en from public.hallazgos h
       where h.estado <> 'descartado'
         and (case when p_investigacion is null then h.creado_en >= p_desde
                   else h.investigacion_id = p_investigacion end)
       order by h.creado_en desc
       limit 200
    ), lado_b as (
      select h.id, h.tema_id, h.vector from public.hallazgos h
       where h.estado <> 'descartado'
         and (p_investigacion is null or h.investigacion_id is distinct from p_investigacion)
       order by h.creado_en desc
       limit 3000
    ), cruzados as (
      select distinct least(h1.tema_id, h2.tema_id) as t1, greatest(h1.tema_id, h2.tema_id) as t2
        from public.ideas i
        join public.hallazgos h1 on h1.id = i.fuentes[1]
        join public.hallazgos h2 on h2.id = i.fuentes[2]
       where i.origen = 'cruce' and h1.tema_id <> h2.tema_id
    ), juntos as (
      select distinct least(x, y) as f1, greatest(x, y) as f2
        from public.ideas i, unnest(i.fuentes) x, unnest(i.fuentes) y
       where x < y
    ), candidatos as (
      select ha.id as id_a, hb.id as id_b, ha.tema_id as tema_de_a, hb.tema_id as tema_de_b, ha.creado_en,
             (1 - (ha.vector operator(extensions.<=>) hb.vector))::real as sim
        from lado_a ha join lado_b hb on hb.id <> ha.id
    )
    select c.* from candidatos c
     where c.sim between p_minimo and p_maximo
       and not exists (select 1 from juntos j where j.f1 = least(c.id_a, c.id_b) and j.f2 = greatest(c.id_a, c.id_b))
       and not exists (select 1 from public.pares_descartados d
                        where d.a = least(c.id_a, c.id_b) and d.b = greatest(c.id_a, c.id_b))
     order by
       (c.tema_de_a is null or c.tema_de_b is null or c.tema_de_a <> c.tema_de_b) desc,
       exists (select 1 from cruzados x
                where x.t1 = least(c.tema_de_a, c.tema_de_b) and x.t2 = greatest(c.tema_de_a, c.tema_de_b)) asc,
       c.creado_en desc,
       abs(c.sim - v_medio) asc,
       c.id_a, c.id_b
  loop
    continue when v_par.id_a = any (v_usados) or v_par.id_b = any (v_usados);
    v_usados := v_usados || v_par.id_a || v_par.id_b;
    a := v_par.id_a;
    b := v_par.id_b;
    similitud := v_par.sim;
    tema_a := v_par.tema_de_a;
    tema_b := v_par.tema_de_b;
    return next;
    exit when cardinality(v_usados) >= 2 * v_limite;
  end loop;
end $$;

-- Calibration of the band (probar-cruces): every pair of a finding created since p_desde with the rest of the map,
-- each pair once, in 20 buckets of 0.05 (width_bucket: bucket n is [(n-1)/20, n/20); a negative similarity counts in the
-- first and 1 in the last). Per bucket: pairs, pairs within one topic, and those of both inside the band.
create function public.histograma_de_similitudes(p_desde timestamptz, p_minimo real, p_maximo real)
returns table (cubeta integer, pares integer, mismo_tema integer, en_la_banda integer, en_la_banda_mismo_tema integer)
language sql stable security definer set search_path = '' as $$
  with recientes as (
    select h.id, h.tema_id, h.vector from public.hallazgos h
     where h.estado <> 'descartado' and h.creado_en >= p_desde
  ), todos as (
    select (1 - (ha.vector operator(extensions.<=>) hb.vector))::real as sim,
           coalesce(ha.tema_id = hb.tema_id, false) as mismo
      from recientes ha
      join public.hallazgos hb on hb.id <> ha.id and hb.estado <> 'descartado'
     where not exists (select 1 from recientes r where r.id = hb.id) or hb.id > ha.id
  )
  select least(greatest(width_bucket(sim::double precision, 0, 1, 20), 1), 20),
         count(*)::integer,
         (count(*) filter (where mismo))::integer,
         (count(*) filter (where sim between p_minimo and p_maximo))::integer,
         (count(*) filter (where mismo and sim between p_minimo and p_maximo))::integer
    from todos
   group by 1
   order by 1
$$;

-- Leases --------------------------------------------------------------------------------------------------------
-- `where id in (select … limit n for update skip locked)` may re-run the locking subquery once per outer row (a semi
-- join without Materialize), and each run can lock and return other rows: one call could lease more than its limit.
-- A materialized CTE runs once. Every lease is redefined with that form; the rest of each body is copied unchanged.

-- C1's body (piezas).
create or replace function public.tomar_para_publicar() returns setof public.piezas
language sql security definer set search_path = '' as $$
  with elegida as materialized (
    select id from public.piezas
     where estado = 'programada' and programada_para <= now()
       and (arrendada_hasta is null or arrendada_hasta < now())
     order by programada_para
     -- Serial work: ~90 s per carousel x 3 is an estimate against the 540 s maxDuration and the 600 s lease; the worst case can exceed it.
     -- Safety does not rest on the arithmetic but on concurrencyLimit 1, the atomic reservation (reservar_envio) and the doubtful sweep.
     limit 3
     for update skip locked
  )
  update public.piezas p set arrendada_hasta = now() + interval '10 minutes'
    from elegida
   where p.id = elegida.id
  returning p.*
$$;

-- 4a's body (redaccion).
create or replace function public.tomar_pedidos() returns setof public.pedidos_de_texto
language sql security definer set search_path = '' as $$
  with elegido as materialized (
    select id from public.pedidos_de_texto
     where estado = 'pendiente' or (estado = 'trabajando' and arrendado_hasta < now())
     order by creado_en
     limit 1
     for update skip locked
  )
  update public.pedidos_de_texto p set estado = 'trabajando', arrendado_hasta = now() + interval '10 minutes'
    from elegido
   where p.id = elegido.id
  returning p.*
$$;

-- 4f's body (series).
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
  with elegido as materialized (
    select id from public.pedidos_de_diseno
     where estado = 'pendiente' or (estado = 'trabajando' and arrendado_hasta < now())
     order by creado_en
     limit 1
     for update skip locked
  )
  update public.pedidos_de_diseno p
     set estado = 'trabajando', arrendado_hasta = now() + interval '10 minutes', intentos = p.intentos + 1
    from elegido
   where p.id = elegido.id
  returning p.*;
end $$;

-- 4f's body (series).
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
  with elegido as materialized (
    select id from public.trabajos_de_investigacion
     where estado = 'pendiente' or (estado = 'trabajando' and arrendado_hasta < now())
     order by creado_en
     limit 1
     for update skip locked
  ), tomado as (
    update public.trabajos_de_investigacion t
       set estado = 'trabajando', arrendado_hasta = now() + interval '15 minutes', intentos = t.intentos + 1
      from elegido
     where t.id = elegido.id
    returning t.*
  ), marcada as (
    update public.investigaciones i set estado = 'investigando'
      from tomado
     where i.id = tomado.investigacion_id and tomado.tipo in ('investigar', 'ampliar')
  )
  select * from tomado;
end $$;

-- 4f's body (series).
create or replace function public.tomar_asignaciones(p_hasta timestamptz, p_limite integer) returns setof public.asignaciones
language plpgsql security definer set search_path = '' as $$
begin
  update public.asignaciones
     set estado = 'fallo', motivo = 'No pude escribir esta pieza después de dos intentos.', arrendado_hasta = null
   where estado = 'escribiendo' and arrendado_hasta < now() and intentos >= 2;
  update public.asignaciones a
     set estado = 'fallo', motivo = 'El carrusel no se pudo armar. Pídelo de nuevo desde la idea.'
   where a.estado = 'escribiendo' and a.formato = 'carrusel_pdf' and a.arrendado_hasta is null
     and (a.pedido_de_diseno_id is null
          or exists (select 1 from public.pedidos_de_diseno p
                      where p.id = a.pedido_de_diseno_id and p.estado in ('fallo', 'obsoleto')));
  return query
  with elegida as materialized (
    select id from public.asignaciones
     where (estado = 'por_escribir' and planeada_para <= p_hasta)
        or (estado = 'escribiendo' and arrendado_hasta < now())
     order by planeada_para
     limit greatest(1, least(coalesce(p_limite, 1), 10))
     for update skip locked
  )
  update public.asignaciones a
     set estado = 'escribiendo', arrendado_hasta = now() + interval '15 minutes', intentos = a.intentos + 1,
         motivo = null
    from elegida
   where a.id = elegida.id
  returning a.*;
end $$;

-- Grants. create or replace kept the grants of the redefined functions. Supabase's default privileges grant execute
-- to anon and authenticated otherwise.
revoke execute on function public.cuenta_y_pilar_de_idea(jsonb) from public, anon, authenticated, service_role;
revoke execute on function
  public.guardar_ideas_sueltas(jsonb, text),
  public.pares_para_cruzar(timestamptz, real, real, integer, uuid),
  public.histograma_de_similitudes(timestamptz, real, real)
from public, anon, authenticated;
grant execute on function
  public.guardar_ideas_sueltas(jsonb, text),
  public.pares_para_cruzar(timestamptz, real, real, integer, uuid),
  public.histograma_de_similitudes(timestamptz, real, real)
to service_role;
