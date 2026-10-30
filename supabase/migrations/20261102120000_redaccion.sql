-- 4c: Claude writes text posts on request. A person's action only queues a request; the Trigger.dev task
-- atender-pedidos-de-texto takes it, pays through the ledger (20261101120000_tope_de_gasto.sql) and writes the result
-- through the service-role RPCs below. Plano: «Escribir texto», «Escritura de texto», «Puerta 1», «Voz por marca».

alter table public.versiones add column origen text not null default 'persona' check (origen in ('persona', 'claude'));
-- «Cada texto guarda con qué versión se escribió» (plano, líneas editoriales).
alter table public.versiones add column linea_version integer check (linea_version >= 1);
alter table public.versiones add constraint claude_con_linea check (origen = 'persona' or linea_version is not null);

create table public.pedidos_de_texto (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('escribir', 'reescribir', 'revisar')),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  pilar_id uuid references public.pilares (id),
  encargo text check (length(btrim(encargo)) between 1 and 2000),
  material text check (length(material) <= 8000),
  instruccion text check (length(btrim(instruccion)) between 1 and 500),
  pieza_id uuid references public.piezas (id) on delete cascade,
  version_id uuid references public.versiones (id) on delete cascade,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'trabajando', 'hecho', 'fallo', 'obsoleto')),
  motivo text check (length(motivo) <= 500),
  resultado_pieza_id uuid references public.piezas (id) on delete set null,
  arrendado_hasta timestamptz,
  pedido_por uuid not null references auth.users (id),
  creado_en timestamptz not null default now(),
  terminado_en timestamptz,
  constraint forma_del_pedido check (
    (tipo = 'escribir' and encargo is not null and instruccion is null and pieza_id is null and version_id is null)
    or (tipo = 'reescribir' and instruccion is not null and encargo is null and pieza_id is not null and version_id is not null)
    or (tipo = 'revisar' and encargo is null and instruccion is null and pieza_id is not null and version_id is not null)
  )
);
create index pedidos_abiertos on public.pedidos_de_texto (creado_en) where estado in ('pendiente', 'trabajando');
create index pedidos_por_cuenta on public.pedidos_de_texto (cuenta_id);
create index pedidos_por_pieza on public.pedidos_de_texto (pieza_id) where pieza_id is not null;
create index pedidos_por_version on public.pedidos_de_texto (version_id) where version_id is not null;
create index pedidos_por_pilar on public.pedidos_de_texto (pilar_id) where pilar_id is not null;
create index pedidos_por_resultado on public.pedidos_de_texto (resultado_pieza_id) where resultado_pieza_id is not null;
create index pedidos_por_persona on public.pedidos_de_texto (pedido_por);

-- One Claude review per version; a new version needs its own.
create table public.revisiones_ia (
  version_id uuid primary key references public.versiones (id) on delete cascade,
  veredicto jsonb not null check (jsonb_typeof(veredicto) = 'object'),
  creada_en timestamptz not null default now()
);

alter table public.pedidos_de_texto enable row level security;
alter table public.revisiones_ia enable row level security;
create policy "miembros ven pedidos" on public.pedidos_de_texto for select to authenticated
  using (public.es_miembro((select marca_id from public.cuentas where id = cuenta_id)));
create policy "miembros ven revisiones" on public.revisiones_ia for select to authenticated
  using (public.es_miembro(public.marca_de_pieza((select pieza_id from public.versiones where id = version_id))));
revoke all on public.pedidos_de_texto, public.revisiones_ia from anon, authenticated;
grant select on public.pedidos_de_texto, public.revisiones_ia to authenticated;

-- People's requests. Owners only (D4).
create function public.pedir_texto(p_cuenta uuid, p_encargo text, p_material text default null, p_pilar uuid default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_marca uuid;
  v_id uuid;
begin
  select marca_id into v_marca from public.cuentas where id = p_cuenta;
  if v_marca is null or not public.es_dueno(v_marca) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_pide_textos';
  end if;
  if not exists (select 1 from public.lineas_editoriales where marca_id = v_marca) then
    raise exception using errcode = '22023', message = 'marca_sin_linea';
  end if;
  if p_pilar is not null and not exists (select 1 from public.pilares where id = p_pilar and marca_id = v_marca and activo) then
    raise exception using errcode = '22023', message = 'pilar_no_valido';
  end if;
  -- Cost guard: a burst of taps never queues a month of spend. The lock makes the count and the insert one step.
  perform pg_advisory_xact_lock(hashtext('pedidos_de_texto:' || v_marca::text));
  if (select count(*) from public.pedidos_de_texto p join public.cuentas c on c.id = p.cuenta_id
       where c.marca_id = v_marca and p.estado in ('pendiente', 'trabajando')) >= 5 then
    raise exception using errcode = '22023', message = 'demasiados_pedidos';
  end if;
  insert into public.pedidos_de_texto (tipo, cuenta_id, pilar_id, encargo, material, pedido_por)
  values ('escribir', p_cuenta, p_pilar, btrim(p_encargo), nullif(btrim(p_material), ''), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- Shared by the two requests on an existing piece: owner, unsigned text post, nothing else open on it.
create function public.pieza_para_pedido(p_pieza uuid) returns public.piezas
language plpgsql security definer set search_path = '' as $$
declare
  v_pieza public.piezas;
begin
  if not public.es_dueno(public.marca_de_pieza(p_pieza)) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_pide_textos';
  end if;
  select * into v_pieza from public.piezas where id = p_pieza for update;
  if v_pieza.estado <> 'por_aprobar' then
    raise exception using errcode = '22023', message = 'pieza_no_esta_por_aprobar';
  end if;
  if v_pieza.formato <> 'texto' then
    raise exception using errcode = '22023', message = 'solo_posts_de_texto';
  end if;
  if exists (select 1 from public.pedidos_de_texto where pieza_id = p_pieza and estado in ('pendiente', 'trabajando')) then
    raise exception using errcode = '22023', message = 'pedido_en_curso';
  end if;
  return v_pieza;
end $$;

create function public.pedir_reescritura(p_pieza uuid, p_instruccion text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_pieza public.piezas;
  v_id uuid;
begin
  v_pieza := public.pieza_para_pedido(p_pieza);
  -- Plano: «Máximo 3 cambios de texto». A failed request was not applied, so it does not count.
  if (select count(*) from public.pedidos_de_texto
       where pieza_id = p_pieza and tipo = 'reescribir' and estado in ('pendiente', 'trabajando', 'hecho')) >= 3 then
    raise exception using errcode = '22023', message = 'sin_reescrituras';
  end if;
  insert into public.pedidos_de_texto (tipo, cuenta_id, pilar_id, instruccion, pieza_id, version_id, pedido_por)
  values ('reescribir', v_pieza.cuenta_id, v_pieza.pilar_id, btrim(p_instruccion), p_pieza,
          (select id from public.versiones where pieza_id = p_pieza order by numero desc limit 1), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create function public.pedir_revision(p_pieza uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_pieza public.piezas;
  v_version uuid;
  v_id uuid;
begin
  v_pieza := public.pieza_para_pedido(p_pieza);
  select id into v_version from public.versiones where pieza_id = p_pieza order by numero desc limit 1;
  if exists (select 1 from public.revisiones_ia where version_id = v_version) then
    raise exception using errcode = '22023', message = 'ya_revisada';
  end if;
  insert into public.pedidos_de_texto (tipo, cuenta_id, pilar_id, pieza_id, version_id, pedido_por)
  values ('revisar', v_pieza.cuenta_id, v_pieza.pilar_id, p_pieza, v_version, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- The writer (service role only). One at a time: a write plus its review takes a few minutes, and a run cut by the
-- task's maxDuration (540 s, below the 10-minute lease) mid-second-request would lose a result already paid.
create function public.tomar_pedidos() returns setof public.pedidos_de_texto
language sql security definer set search_path = '' as $$
  update public.pedidos_de_texto p set estado = 'trabajando', arrendado_hasta = now() + interval '10 minutes'
   where p.id in (
     select id from public.pedidos_de_texto
      where estado = 'pendiente' or (estado = 'trabajando' and arrendado_hasta < now())
      order by creado_en
      limit 1
      for update skip locked)
  returning p.*
$$;

create function public.terminar_pedido(p_pedido uuid, p_estado text, p_motivo text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_estado not in ('hecho', 'fallo', 'obsoleto') then
    raise exception using errcode = '22023', message = 'estado_de_pedido_invalido';
  end if;
  update public.pedidos_de_texto
     set estado = p_estado, motivo = left(p_motivo, 500), terminado_en = now(), arrendado_hasta = null
   where id = p_pedido and estado = 'trabajando';
end $$;

create function public.crear_pieza_de_claude(
  p_pedido uuid, p_texto text, p_linea_version integer, p_planeada_para timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_pedido public.pedidos_de_texto;
  v_pieza uuid;
  v_version uuid;
begin
  select * into v_pedido from public.pedidos_de_texto where id = p_pedido and tipo = 'escribir' for update;
  if not found or v_pedido.estado <> 'trabajando' then
    raise exception using errcode = '22023', message = 'pedido_no_esta_trabajando';
  end if;
  -- A pillar retired while Claude wrote is left out: pilar_de_su_marca refuses it, and the text is already paid.
  insert into public.piezas (cuenta_id, formato, creada_por, pilar_id, planeada_para)
  values (v_pedido.cuenta_id, 'texto', v_pedido.pedido_por,
          (select id from public.pilares where id = v_pedido.pilar_id and activo), p_planeada_para)
  returning id into v_pieza;
  insert into public.versiones (pieza_id, numero, texto, origen, linea_version)
  values (v_pieza, 1, p_texto, 'claude', p_linea_version)
  returning id into v_version;
  update public.pedidos_de_texto
     set estado = 'hecho', resultado_pieza_id = v_pieza, terminado_en = now(), arrendado_hasta = null
   where id = p_pedido;
  return jsonb_build_object('pieza', v_pieza, 'version', v_version);
end $$;

-- Null when the piece moved on while Claude wrote (signed, discarded or edited by hand): that decision stands.
create function public.version_de_claude(p_pedido uuid, p_texto text, p_linea_version integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_pedido public.pedidos_de_texto;
  v_estado text;
  v_ultima public.versiones;
  v_id uuid;
begin
  select * into v_pedido from public.pedidos_de_texto where id = p_pedido and tipo = 'reescribir' for update;
  if not found or v_pedido.estado <> 'trabajando' then
    raise exception using errcode = '22023', message = 'pedido_no_esta_trabajando';
  end if;
  select estado into v_estado from public.piezas where id = v_pedido.pieza_id for update;
  select * into v_ultima from public.versiones where pieza_id = v_pedido.pieza_id order by numero desc limit 1;
  if v_estado is distinct from 'por_aprobar' or v_ultima.id is distinct from v_pedido.version_id then
    update public.pedidos_de_texto
       set estado = 'obsoleto', motivo = 'La pieza cambió mientras Claude reescribía; no se aplicó.',
           terminado_en = now(), arrendado_hasta = null
     where id = p_pedido;
    return null;
  end if;
  insert into public.versiones (pieza_id, numero, texto, origen, linea_version)
  values (v_pedido.pieza_id, v_ultima.numero + 1, p_texto, 'claude', p_linea_version)
  returning id into v_id;
  update public.pedidos_de_texto
     set estado = 'hecho', resultado_pieza_id = v_pedido.pieza_id, terminado_en = now(), arrendado_hasta = null
   where id = p_pedido;
  return v_id;
end $$;

create function public.guardar_revision_ia(p_version uuid, p_veredicto jsonb, p_pedido uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.revisiones_ia (version_id, veredicto) values (p_version, p_veredicto)
  on conflict (version_id) do nothing;
  if p_pedido is not null then
    update public.pedidos_de_texto
       set estado = 'hecho', terminado_en = now(), arrendado_hasta = null
     where id = p_pedido and estado = 'trabajando';
  end if;
end $$;

revoke execute on function public.pedir_texto(uuid, text, text, uuid), public.pedir_reescritura(uuid, text),
  public.pedir_revision(uuid) from public, anon;
grant execute on function public.pedir_texto(uuid, text, text, uuid), public.pedir_reescritura(uuid, text),
  public.pedir_revision(uuid) to authenticated;
-- Service role only: Supabase's default privileges grant execute to anon and authenticated otherwise.
revoke execute on function public.pieza_para_pedido(uuid), public.tomar_pedidos(), public.terminar_pedido(uuid, text, text),
  public.crear_pieza_de_claude(uuid, text, integer, timestamptz), public.version_de_claude(uuid, text, integer),
  public.guardar_revision_ia(uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.tomar_pedidos(), public.terminar_pedido(uuid, text, text),
  public.crear_pieza_de_claude(uuid, text, integer, timestamptz), public.version_de_claude(uuid, text, integer),
  public.guardar_revision_ia(uuid, jsonb, uuid) to service_role;
