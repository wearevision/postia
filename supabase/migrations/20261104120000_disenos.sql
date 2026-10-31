-- 4b: carousels from Federico's 9 templates. A person's action only queues a design request; the Trigger.dev task
-- armar-carruseles renders it in Chromium, uploads the PDF and its slide previews, and saves the piece through the
-- service-role RPCs below. The version's huella already covers the file's sha256, so firmar_pieza is the D25 single
-- signature. Plano: «Plantillas (D24)», «Armar diseño», «Puerta 1».

alter table public.versiones add column tema text;
alter table public.versiones add column diseno jsonb;
alter table public.versiones add constraint diseno_completo check ((tema is null) = (diseno is null));
alter table public.versiones add constraint diseno_es_objeto check (
  diseno is null or (jsonb_typeof(diseno) = 'object' and jsonb_typeof(diseno -> 'laminas') = 'array')
);

-- Slide previews (<marca>/<archivo>/NN.jpg) live next to the PDF; members already read their brand's folder.
update storage.buckets set allowed_mime_types = array['application/pdf', 'image/jpeg'] where id = 'piezas';

-- Mirrors temasDeLaVoz (lib/plantillas/temas.ts); tests/integration/disenos.test.ts keeps them equal.
create function public.tema_de_la_voz(p_tema text, p_voz text) returns boolean
language sql immutable set search_path = '' as $$
  select case p_voz
    when 'nosotros' then p_tema in ('oscura', 'papel', 'magenta', 'wav-noche', 'wav-papel', 'wav-degradado')
    when 'yo' then p_tema in ('personal-claro', 'personal-grafito', 'personal-arena')
    else false
  end
$$;

create table public.pedidos_de_diseno (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  pieza_id uuid references public.piezas (id) on delete cascade,
  version_base_id uuid references public.versiones (id) on delete set null,
  tema text not null,
  titulo text not null check (length(btrim(titulo)) between 1 and 100),
  texto text not null check (length(btrim(texto)) between 1 and 3000),
  diseno jsonb not null check (
    jsonb_typeof(diseno) = 'object' and jsonb_typeof(diseno -> 'laminas') = 'array'
    and jsonb_array_length(diseno -> 'laminas') between 3 and 10
    -- Ten slides at their word limits are under 8 KB; the cap keeps a crafted call from storing megabytes.
    and octet_length(diseno::text) <= 32768
  ),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'trabajando', 'hecho', 'fallo', 'obsoleto')),
  motivo text check (length(motivo) <= 500),
  resultado_pieza_id uuid references public.piezas (id) on delete set null,
  arrendado_hasta timestamptz,
  pedido_por uuid not null references auth.users (id),
  creado_en timestamptz not null default now(),
  terminado_en timestamptz,
  constraint edicion_con_base check ((pieza_id is null) = (version_base_id is null))
);
create index pedidos_de_diseno_abiertos on public.pedidos_de_diseno (creado_en) where estado in ('pendiente', 'trabajando');
create index pedidos_de_diseno_por_cuenta on public.pedidos_de_diseno (cuenta_id);
create index pedidos_de_diseno_por_pieza on public.pedidos_de_diseno (pieza_id) where pieza_id is not null;
create index pedidos_de_diseno_por_base on public.pedidos_de_diseno (version_base_id) where version_base_id is not null;
create index pedidos_de_diseno_por_resultado on public.pedidos_de_diseno (resultado_pieza_id) where resultado_pieza_id is not null;
create index pedidos_de_diseno_por_persona on public.pedidos_de_diseno (pedido_por);

alter table public.pedidos_de_diseno enable row level security;
create policy "miembros ven pedidos de diseño" on public.pedidos_de_diseno for select to authenticated
  using (public.es_miembro((select marca_id from public.cuentas where id = cuenta_id)));
revoke all on public.pedidos_de_diseno from anon, authenticated;
grant select on public.pedidos_de_diseno to authenticated;

-- Owners only (D4). The slides' content is checked by revisarCarrusel before this and again in the worker.
create function public.pedir_diseno(
  p_cuenta uuid, p_tema text, p_titulo text, p_texto text, p_diseno jsonb, p_pieza uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_marca uuid;
  v_voz text;
  v_pieza public.piezas;
  v_base uuid;
  v_id uuid;
begin
  select c.marca_id, m.voz into v_marca, v_voz
    from public.cuentas c join public.marcas m on m.id = c.marca_id where c.id = p_cuenta;
  if v_marca is null or not public.es_dueno(v_marca) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_pide_disenos';
  end if;
  if not public.tema_de_la_voz(p_tema, v_voz) then
    raise exception using errcode = '22023', message = 'tema_de_otra_marca';
  end if;
  if p_pieza is not null then
    select * into v_pieza from public.piezas where id = p_pieza for update;
    if not found or v_pieza.cuenta_id <> p_cuenta then
      raise exception using errcode = '22023', message = 'pieza_de_otra_cuenta';
    end if;
    if v_pieza.formato <> 'carrusel_pdf' then
      raise exception using errcode = '22023', message = 'solo_carruseles';
    end if;
    if v_pieza.estado not in ('por_aprobar', 'en_reserva', 'programada', 'a_mano') then
      raise exception using errcode = '22023', message = 'pieza_no_editable';
    end if;
    if exists (select 1 from public.pedidos_de_diseno where pieza_id = p_pieza and estado in ('pendiente', 'trabajando')) then
      raise exception using errcode = '22023', message = 'pedido_en_curso';
    end if;
    select id into v_base from public.versiones where pieza_id = p_pieza order by numero desc limit 1;
  end if;
  perform pg_advisory_xact_lock(hashtext('pedidos_de_diseno:' || v_marca::text));
  if (select count(*) from public.pedidos_de_diseno p join public.cuentas c on c.id = p.cuenta_id
       where c.marca_id = v_marca and p.estado in ('pendiente', 'trabajando')) >= 5 then
    raise exception using errcode = '22023', message = 'demasiados_pedidos';
  end if;
  insert into public.pedidos_de_diseno (cuenta_id, pieza_id, version_base_id, tema, titulo, texto, diseno, pedido_por)
  values (p_cuenta, p_pieza, v_base, p_tema, btrim(p_titulo), btrim(p_texto), p_diseno, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- The renderer (service role only). One at a time: Chromium is the slow part and a run is far below the lease.
create function public.tomar_pedidos_de_diseno() returns setof public.pedidos_de_diseno
language sql security definer set search_path = '' as $$
  update public.pedidos_de_diseno p set estado = 'trabajando', arrendado_hasta = now() + interval '10 minutes'
   where p.id in (
     select id from public.pedidos_de_diseno
      where estado = 'pendiente' or (estado = 'trabajando' and arrendado_hasta < now())
      order by creado_en
      limit 1
      for update skip locked)
  returning p.*
$$;

create function public.terminar_pedido_de_diseno(p_pedido uuid, p_estado text, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_estado not in ('fallo', 'obsoleto') then
    raise exception using errcode = '22023', message = 'estado_de_pedido_invalido';
  end if;
  update public.pedidos_de_diseno
     set estado = p_estado, motivo = left(p_motivo, 500), terminado_en = now(), arrendado_hasta = null
   where id = p_pedido and estado = 'trabajando';
end $$;

-- Null when an edit's piece moved on while it rendered (signed elsewhere, edited, discarded): that decision stands.
create function public.guardar_diseno(
  p_pedido uuid, p_archivo_ruta text, p_archivo_sha256 text, p_planeada_para timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_pedido public.pedidos_de_diseno;
  v_pieza public.piezas;
  v_ultima public.versiones;
  v_pieza_id uuid;
  v_version uuid;
begin
  select * into v_pedido from public.pedidos_de_diseno where id = p_pedido for update;
  if not found or v_pedido.estado <> 'trabajando' then
    raise exception using errcode = '22023', message = 'pedido_no_esta_trabajando';
  end if;
  if v_pedido.pieza_id is null then
    insert into public.piezas (cuenta_id, formato, creada_por, planeada_para)
    values (v_pedido.cuenta_id, 'carrusel_pdf', v_pedido.pedido_por, p_planeada_para)
    returning id into v_pieza_id;
    insert into public.versiones (pieza_id, numero, texto, titulo, archivo_ruta, archivo_sha256, creada_por, tema, diseno)
    values (v_pieza_id, 1, v_pedido.texto, v_pedido.titulo, p_archivo_ruta, p_archivo_sha256, v_pedido.pedido_por,
            v_pedido.tema, v_pedido.diseno)
    returning id into v_version;
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

revoke execute on function public.pedir_diseno(uuid, text, text, text, jsonb, uuid) from public, anon;
grant execute on function public.pedir_diseno(uuid, text, text, text, jsonb, uuid) to authenticated;
revoke execute on function public.tomar_pedidos_de_diseno() from public, anon, authenticated;
revoke execute on function public.terminar_pedido_de_diseno(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.guardar_diseno(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.tema_de_la_voz(text, text) from public, anon;
grant execute on function public.tomar_pedidos_de_diseno() to service_role;
grant execute on function public.terminar_pedido_de_diseno(uuid, text, text) to service_role;
grant execute on function public.guardar_diseno(uuid, text, text, timestamptz) to service_role;
grant execute on function public.tema_de_la_voz(text, text) to authenticated, service_role;
