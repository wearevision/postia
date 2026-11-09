-- Rendimiento, block 1 (docs/superpowers/specs/2026-11-09-rendimiento-design.md). D12, changed on 2026-11-09:
-- figures come from the LinkedIn API (later) or from the files Federico exports from his own profile (.xlsx) and from
-- the WAV page (.xls: content, followers, visitors). Each figure keeps its origin; when both exist the API wins.
-- Imported figures do not expire; owners can delete them.

create table public.importaciones_de_metricas (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  desde date not null,
  hasta date not null check (hasta >= desde),
  seguidores_total integer check (seguidores_total >= 0),
  creada_por uuid references auth.users (id) on delete set null,
  creada_en timestamptz not null default now(),
  unique (cuenta_id, desde, hasta)
);

create table public.metricas_de_publicacion (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  post_urn text not null check (post_urn ~ '^urn:li:(share|ugcPost|activity):[0-9]+$'),
  pieza_id uuid references public.piezas (id) on delete set null,
  publicada_el date not null,
  interacciones integer check (interacciones >= 0),
  impresiones integer check (impresiones >= 0),
  -- The page's exports name posts by activity URN and by the start of their text (extracto), and carry clicks and follows.
  extracto text check (length(extracto) <= 300),
  clics integer check (clics >= 0),
  seguidores_nuevos integer check (seguidores_nuevos >= 0),
  origen text not null check (origen in ('api', 'importacion')),
  leida_en timestamptz not null default now(),
  unique (cuenta_id, post_urn, origen)
);
create index metricas_de_publicacion_por_pieza on public.metricas_de_publicacion (pieza_id) where pieza_id is not null;

create table public.metricas_diarias (
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  dia date not null,
  -- Null when the day only comes from the page's followers or visitors file: there is no content figure to store.
  impresiones integer check (impresiones >= 0),
  interacciones integer check (interacciones >= 0),
  seguidores_nuevos integer check (seguidores_nuevos >= 0),
  visitas integer check (visitas >= 0),
  visitantes_unicos integer check (visitantes_unicos >= 0),
  origen text not null check (origen in ('api', 'importacion')),
  primary key (cuenta_id, dia, origen)
);

-- Aggregated audience as LinkedIn exports it: top values per category, never a person. The profile gives percentages
-- (publico, contenido); the page gives counts (seguidores, visitantes).
create table public.publico_de_la_cuenta (
  id uuid primary key default gen_random_uuid(),
  importacion_id uuid not null references public.importaciones_de_metricas (id) on delete cascade,
  tipo text not null check (tipo in ('publico', 'contenido', 'seguidores', 'visitantes')),
  categoria text not null check (length(btrim(categoria)) between 1 and 80),
  valor text not null check (length(btrim(valor)) between 1 and 200),
  porcentaje numeric(5, 2) check (porcentaje between 0 and 100),
  menor_a_uno boolean not null default false,
  cantidad integer check (cantidad >= 0)
);
create index publico_de_la_cuenta_por_importacion on public.publico_de_la_cuenta (importacion_id);

alter table public.importaciones_de_metricas enable row level security;
alter table public.metricas_de_publicacion enable row level security;
alter table public.metricas_diarias enable row level security;
alter table public.publico_de_la_cuenta enable row level security;

-- Read for the brand's owners; writes only through importar_metricas.
create policy "duenos leen importaciones" on public.importaciones_de_metricas for select to authenticated
  using (exists (select 1 from public.cuentas c where c.id = cuenta_id and public.es_dueno(c.marca_id)));
create policy "duenos leen metricas" on public.metricas_de_publicacion for select to authenticated
  using (exists (select 1 from public.cuentas c where c.id = cuenta_id and public.es_dueno(c.marca_id)));
create policy "duenos leen metricas diarias" on public.metricas_diarias for select to authenticated
  using (exists (select 1 from public.cuentas c where c.id = cuenta_id and public.es_dueno(c.marca_id)));
create policy "duenos leen publico" on public.publico_de_la_cuenta for select to authenticated
  using (exists (
    select 1 from public.importaciones_de_metricas i join public.cuentas c on c.id = i.cuenta_id
     where i.id = importacion_id and public.es_dueno(c.marca_id)));

-- Lowercase, whitespace collapsed (ASCII class, as in the pieces' text checks), and a trailing «…» or «...» removed:
-- how a page post's extract and a piece's text are compared.
create function public.texto_para_comparar(p_texto text) returns text
language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(
    regexp_replace(lower(replace(coalesce(p_texto, ''), chr(160), ' ')), '[ \t\r\n\f]+', ' ', 'g'),
    '(…|\.\.\.)[ \t\r\n\f]*$', ''))
$$;
revoke execute on function public.texto_para_comparar(text) from public, anon;

create function public.importar_metricas(p_cuenta uuid, p_datos jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_marca uuid;
  v_importacion uuid;
  v_publicaciones integer;
  v_de_postia integer;
  v_dias integer;
  v_publico integer;
begin
  select marca_id into v_marca from public.cuentas where id = p_cuenta;
  if v_marca is null or not public.es_dueno(v_marca) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_importa';
  end if;
  if jsonb_typeof(p_datos -> 'publicaciones') <> 'array' or jsonb_typeof(p_datos -> 'dias') <> 'array'
     or jsonb_typeof(p_datos -> 'publico') <> 'array'
     or exists (select 1 from jsonb_array_elements(p_datos -> 'publicaciones') e
                 where coalesce(e ->> 'post_urn', '') !~ '^urn:li:(share|ugcPost|activity):[0-9]+$') then
    raise exception using errcode = '22023', message = 'datos_invalidos';
  end if;

  -- The same period imported again replaces the earlier import (its audience goes with it).
  delete from public.importaciones_de_metricas
   where cuenta_id = p_cuenta and desde = (p_datos ->> 'desde')::date and hasta = (p_datos ->> 'hasta')::date;
  insert into public.importaciones_de_metricas (cuenta_id, desde, hasta, seguidores_total, creada_por)
  values (p_cuenta, (p_datos ->> 'desde')::date, (p_datos ->> 'hasta')::date,
          (p_datos ->> 'seguidores_total')::integer, auth.uid())
  returning id into v_importacion;

  -- A post belongs to a PostIA piece by its URN (the profile) or, for the page's posts, by the day it went out in Chile
  -- (publicaciones.enviado_en, or the day a hand-closed piece was marked published in eventos) and the start of its
  -- text (the latest version). One candidate only; several or none means no piece.
  insert into public.metricas_de_publicacion (cuenta_id, post_urn, pieza_id, publicada_el, interacciones, impresiones,
                                              extracto, clics, seguidores_nuevos, origen, leida_en)
  select p_cuenta, e ->> 'post_urn',
         coalesce(
           (select pu.pieza_id from public.publicaciones pu join public.piezas pz on pz.id = pu.pieza_id
             where pu.post_urn = e ->> 'post_urn' and pz.cuenta_id = p_cuenta limit 1),
           case when public.texto_para_comparar(e ->> 'extracto') <> '' then
             (select (array_agg(c.id))[1]
                from (select pz.id
                        from public.piezas pz
                       where pz.cuenta_id = p_cuenta and pz.estado = 'publicada'
                         and (coalesce((select max(pu.enviado_en) from public.publicaciones pu where pu.pieza_id = pz.id),
                                       (select max(ev.en) from public.eventos ev where ev.pieza_id = pz.id and ev.a = 'publicada'))
                                at time zone 'America/Santiago')::date = (e ->> 'publicada_el')::date
                         and starts_with(
                               public.texto_para_comparar(
                                 (select v.texto from public.versiones v where v.pieza_id = pz.id order by v.numero desc limit 1)),
                               public.texto_para_comparar(e ->> 'extracto'))) c
              having count(*) = 1)
           end),
         (e ->> 'publicada_el')::date, (e ->> 'interacciones')::integer, (e ->> 'impresiones')::integer,
         e ->> 'extracto', (e ->> 'clics')::integer, (e ->> 'seguidores_nuevos')::integer, 'importacion', now()
    from jsonb_array_elements(p_datos -> 'publicaciones') e
  on conflict (cuenta_id, post_urn, origen) do update
     set pieza_id = excluded.pieza_id, publicada_el = excluded.publicada_el,
         interacciones = coalesce(excluded.interacciones, public.metricas_de_publicacion.interacciones),
         impresiones = coalesce(excluded.impresiones, public.metricas_de_publicacion.impresiones),
         extracto = coalesce(excluded.extracto, public.metricas_de_publicacion.extracto),
         clics = coalesce(excluded.clics, public.metricas_de_publicacion.clics),
         seguidores_nuevos = coalesce(excluded.seguidores_nuevos, public.metricas_de_publicacion.seguidores_nuevos),
         leida_en = excluded.leida_en;

  -- Each file of the page fills only its own columns, so a null never erases a figure another import stored.
  insert into public.metricas_diarias (cuenta_id, dia, impresiones, interacciones, seguidores_nuevos, visitas,
                                       visitantes_unicos, origen)
  select p_cuenta, (e ->> 'dia')::date, (e ->> 'impresiones')::integer, (e ->> 'interacciones')::integer,
         (e ->> 'seguidores_nuevos')::integer, (e ->> 'visitas')::integer, (e ->> 'visitantes_unicos')::integer,
         'importacion'
    from jsonb_array_elements(p_datos -> 'dias') e
  on conflict (cuenta_id, dia, origen) do update
     set impresiones = coalesce(excluded.impresiones, public.metricas_diarias.impresiones),
         interacciones = coalesce(excluded.interacciones, public.metricas_diarias.interacciones),
         seguidores_nuevos = coalesce(excluded.seguidores_nuevos, public.metricas_diarias.seguidores_nuevos),
         visitas = coalesce(excluded.visitas, public.metricas_diarias.visitas),
         visitantes_unicos = coalesce(excluded.visitantes_unicos, public.metricas_diarias.visitantes_unicos);

  insert into public.publico_de_la_cuenta (importacion_id, tipo, categoria, valor, porcentaje, menor_a_uno, cantidad)
  select v_importacion, e ->> 'tipo', e ->> 'categoria', e ->> 'valor', (e ->> 'porcentaje')::numeric,
         coalesce((e ->> 'menor_a_uno')::boolean, false), (e ->> 'cantidad')::integer
    from jsonb_array_elements(p_datos -> 'publico') e;

  select count(*), count(pieza_id) into v_publicaciones, v_de_postia
    from public.metricas_de_publicacion
   where cuenta_id = p_cuenta and origen = 'importacion'
     and post_urn in (select e ->> 'post_urn' from jsonb_array_elements(p_datos -> 'publicaciones') e);
  v_dias := jsonb_array_length(p_datos -> 'dias');
  v_publico := jsonb_array_length(p_datos -> 'publico');
  return jsonb_build_object('publicaciones', v_publicaciones, 'de_postia', v_de_postia,
                            'anteriores', v_publicaciones - v_de_postia, 'dias', v_dias, 'publico', v_publico);
exception
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or check_violation
       or not_null_violation then
    raise exception using errcode = '22023', message = 'datos_invalidos';
end $$;

revoke execute on function public.importar_metricas(uuid, jsonb) from public, anon;
grant execute on function public.importar_metricas(uuid, jsonb) to authenticated;
