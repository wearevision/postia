-- A piece is what goes out on one account. Its text and file live in immutable versions; a signature binds one
-- version's huella and one date. Plano: «Estados de una pieza», «Puerta 2», «Sale lo que se aprobó».
create extension if not exists pgcrypto with schema extensions;

create table public.piezas (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  formato text not null check (formato in ('texto', 'carrusel_pdf')),
  estado text not null default 'por_aprobar' check (estado in (
    'por_aprobar', 'programada', 'publicando', 'publicada', 'envio_dudoso', 'a_mano', 'error', 'descartada'
  )),
  programada_para timestamptz,
  -- «Ventana de atraso»: past this many minutes after its time, a piece does not go out without a person knowing.
  ventana_minutos smallint not null default 30 check (ventana_minutos between 5 and 240),
  arrendada_hasta timestamptz,
  motivo text check (length(motivo) <= 500),
  enlace text check (enlace is null or enlace ~ '^https://(www\.)?linkedin\.com/'),
  creada_por uuid not null references auth.users (id),
  creada_en timestamptz not null default now(),
  constraint con_fecha check (estado not in ('programada', 'publicando') or programada_para is not null)
);

-- One account never has two pieces in the same slot (plano: horarioLibreEnCuenta, only inside the account).
create unique index piezas_un_horario_por_cuenta on public.piezas (cuenta_id, programada_para)
  where estado in ('programada', 'publicando', 'publicada');

create table public.versiones (
  id uuid primary key default gen_random_uuid(),
  pieza_id uuid not null references public.piezas (id) on delete cascade,
  numero integer not null check (numero > 0),
  texto text not null check (length(texto) between 1 and 3000),
  titulo text check (length(titulo) between 1 and 100),
  archivo_ruta text,
  archivo_sha256 text check (archivo_sha256 ~ '^[0-9a-f]{64}$'),
  huella text not null,
  creada_por uuid references auth.users (id),
  creada_en timestamptz not null default now(),
  unique (pieza_id, numero),
  constraint archivo_completo check ((archivo_ruta is null) = (archivo_sha256 is null))
);

create table public.firmas (
  id uuid primary key default gen_random_uuid(),
  pieza_id uuid not null references public.piezas (id) on delete cascade,
  version_id uuid not null references public.versiones (id) on delete cascade,
  huella text not null,
  programada_para timestamptz not null,
  firmada_por uuid not null references auth.users (id),
  firmada_en timestamptz not null default now(),
  vigente boolean not null default true
);
create unique index firmas_una_vigente on public.firmas (pieza_id) where vigente;

-- Written right before the irreversible POST: a second row for the same piece is impossible (send once).
create table public.publicaciones (
  id uuid primary key default gen_random_uuid(),
  pieza_id uuid not null unique references public.piezas (id) on delete cascade,
  version_id uuid references public.versiones (id),
  firma_id uuid references public.firmas (id),
  enviado_en timestamptz not null default now(),
  post_urn text check (post_urn ~ '^urn:li:(share|ugcPost):[0-9]+$'),
  enlace text
);

create table public.eventos (
  id bigint generated always as identity primary key,
  pieza_id uuid not null references public.piezas (id) on delete cascade,
  de text,
  a text not null,
  por uuid references auth.users (id),
  motivo text,
  en timestamptz not null default now()
);

-- Explicit ASCII class, not \s: \s depends on the server locale and disagrees with JS on U+0085 and U+FEFF.
-- The huella: format · title · file hash · text, the text normalized (CRLF to LF, trailing blanks off).
-- lib/piezas/huella.ts computes the same thing; tests/integration/piezas.test.ts checks they agree.
create function public.normalizar_texto(p text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(replace(p, E'\r\n', E'\n'), E'[ \t\n\r\f\v]+$', '')
$$;

create function public.poner_huella() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.texto := public.normalizar_texto(new.texto);
  new.huella := encode(extensions.digest(
    convert_to(new.texto, 'UTF8') || '\x00'::bytea
      || convert_to(coalesce(new.titulo, ''), 'UTF8') || '\x00'::bytea
      || convert_to(coalesce(new.archivo_sha256, ''), 'UTF8') || '\x00'::bytea
      || convert_to((select formato from public.piezas where id = new.pieza_id), 'UTF8'),
    'sha256'), 'hex');
  return new;
end $$;

create trigger versiones_huella before insert on public.versiones
  for each row execute function public.poner_huella();

-- Versions never change: a correction is a new version.
create function public.versiones_inmutables() returns trigger
language plpgsql as $$
begin
  raise exception using errcode = '42501', message = 'las_versiones_no_cambian';
end $$;
create trigger versiones_sin_cambios before update on public.versiones
  for each row execute function public.versiones_inmutables();

-- A new version drops any signature and sends a scheduled or by-hand piece back to the gate (Sale lo que se aprobó).
create function public.version_nueva_cae_firma() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.numero > 1 then
    update public.firmas set vigente = false where pieza_id = new.pieza_id and vigente;
    update public.piezas set estado = 'por_aprobar', motivo = 'Cambió el texto o el archivo: hay que firmar de nuevo.'
     where id = new.pieza_id and estado in ('programada', 'a_mano');
  end if;
  return new;
end $$;
create trigger versiones_firma after insert on public.versiones
  for each row execute function public.version_nueva_cae_firma();

-- The machine (same table as lib/piezas/estados.ts).
create function public.transiciones_de_pieza() returns table (de text, a text[])
language sql immutable set search_path = '' as $$
  values
    ('por_aprobar', array['programada', 'descartada']),
    ('programada', array['por_aprobar', 'publicando', 'a_mano', 'descartada']),
    ('publicando', array['publicada', 'envio_dudoso', 'a_mano', 'error']),
    ('error', array['programada', 'por_aprobar', 'descartada']),
    ('envio_dudoso', array['publicada', 'a_mano', 'descartada']),
    ('a_mano', array['publicada', 'por_aprobar', 'descartada']),
    ('publicada', array[]::text[]),
    ('descartada', array[]::text[])
$$;

create function public.guardia_de_estado() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.estado is distinct from old.estado then
    if not exists (select 1 from public.transiciones_de_pieza() t where t.de = old.estado and new.estado = any (t.a)) then
      raise exception using errcode = '23514', message = format('transicion_no_permitida %s -> %s', old.estado, new.estado);
    end if;
    -- Scheduling needs a valid signature for the current version (Puerta 2).
    if new.estado = 'programada' and not exists (
      select 1 from public.firmas f
       where f.pieza_id = new.id and f.vigente
         and f.huella = (select v.huella from public.versiones v where v.pieza_id = new.id order by v.numero desc limit 1)
    ) then
      raise exception using errcode = '23514', message = 'programar_sin_firma_vigente';
    end if;
    insert into public.eventos (pieza_id, de, a, por, motivo) values (new.id, old.estado, new.estado, auth.uid(), new.motivo);
  end if;
  return new;
end $$;
create trigger piezas_guardia before update on public.piezas
  for each row execute function public.guardia_de_estado();

-- RLS: members see their brands' pieces; every write by people goes through the RPCs below.
alter table public.piezas enable row level security;
alter table public.versiones enable row level security;
alter table public.firmas enable row level security;
alter table public.publicaciones enable row level security;
alter table public.eventos enable row level security;

create function public.marca_de_pieza(p_pieza uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select c.marca_id from public.piezas p join public.cuentas c on c.id = p.cuenta_id where p.id = p_pieza
$$;

create policy "miembros ven piezas" on public.piezas for select to authenticated
  using (public.es_miembro((select marca_id from public.cuentas where id = cuenta_id)));
create policy "miembros ven versiones" on public.versiones for select to authenticated
  using (public.es_miembro(public.marca_de_pieza(pieza_id)));
create policy "miembros ven firmas" on public.firmas for select to authenticated
  using (public.es_miembro(public.marca_de_pieza(pieza_id)));
create policy "miembros ven publicaciones" on public.publicaciones for select to authenticated
  using (public.es_miembro(public.marca_de_pieza(pieza_id)));
create policy "miembros ven eventos" on public.eventos for select to authenticated
  using (public.es_miembro(public.marca_de_pieza(pieza_id)));

revoke all on public.piezas, public.versiones, public.firmas, public.publicaciones, public.eventos from anon, authenticated;
grant select on public.piezas, public.versiones, public.firmas, public.publicaciones, public.eventos to authenticated;

-- Nullable parameters carry `default null` so the generated TypeScript types make them optional.
-- People's actions. Each checks ownership of the piece's brand (phase 1: owners only, D4).
create function public.crear_pieza(
  p_cuenta uuid, p_formato text, p_texto text,
  p_titulo text default null, p_archivo_ruta text default null, p_archivo_sha256 text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_marca uuid;
  v_pieza uuid;
begin
  select marca_id into v_marca from public.cuentas where id = p_cuenta;
  if v_marca is null or not public.es_dueno(v_marca) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_crea_piezas';
  end if;
  if p_formato = 'carrusel_pdf' and (p_archivo_ruta is null or p_titulo is null) then
    raise exception using errcode = '22023', message = 'carrusel_sin_archivo_o_titulo';
  end if;
  if p_archivo_ruta is not null and split_part(p_archivo_ruta, '/', 1) <> v_marca::text then
    raise exception using errcode = '42501', message = 'archivo_de_otra_marca';
  end if;
  insert into public.piezas (cuenta_id, formato, creada_por) values (p_cuenta, p_formato, auth.uid()) returning id into v_pieza;
  insert into public.versiones (pieza_id, numero, texto, titulo, archivo_ruta, archivo_sha256, creada_por)
  values (v_pieza, 1, p_texto, p_titulo, p_archivo_ruta, p_archivo_sha256, auth.uid());
  return v_pieza;
end $$;

create function public.nueva_version(
  p_pieza uuid, p_texto text,
  p_titulo text default null, p_archivo_ruta text default null, p_archivo_sha256 text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_estado text;
  v_numero integer;
  v_id uuid;
begin
  if not public.es_dueno(public.marca_de_pieza(p_pieza)) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_cambia_piezas';
  end if;
  select estado into v_estado from public.piezas where id = p_pieza for update;
  if v_estado not in ('por_aprobar', 'programada', 'a_mano') then
    raise exception using errcode = '22023', message = 'pieza_no_editable';
  end if;
  select coalesce(max(numero), 0) + 1 into v_numero from public.versiones where pieza_id = p_pieza;
  insert into public.versiones (pieza_id, numero, texto, titulo, archivo_ruta, archivo_sha256, creada_por)
  values (p_pieza, v_numero, p_texto, p_titulo, p_archivo_ruta, p_archivo_sha256, auth.uid()) returning id into v_id;
  return v_id;
end $$;

create function public.firmar_pieza(p_pieza uuid, p_huella text, p_programada_para timestamptz) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_version public.versiones;
  v_firma uuid;
begin
  if not public.es_dueno(public.marca_de_pieza(p_pieza)) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_firma';
  end if;
  perform 1 from public.piezas where id = p_pieza and estado = 'por_aprobar' for update;
  if not found then
    raise exception using errcode = '22023', message = 'pieza_no_esta_por_aprobar';
  end if;
  select * into v_version from public.versiones where pieza_id = p_pieza order by numero desc limit 1;
  if v_version.huella is distinct from p_huella then
    raise exception using errcode = '22023', message = 'firma_de_otra_version';
  end if;
  if p_programada_para is null or p_programada_para < now() + interval '1 minute' then
    raise exception using errcode = '22023', message = 'fecha_en_el_pasado';
  end if;
  update public.firmas set vigente = false where pieza_id = p_pieza and vigente;
  insert into public.firmas (pieza_id, version_id, huella, programada_para, firmada_por)
  values (p_pieza, v_version.id, v_version.huella, p_programada_para, auth.uid()) returning id into v_firma;
  update public.piezas set estado = 'programada', programada_para = p_programada_para, motivo = null where id = p_pieza;
  return v_firma;
end $$;

create function public.desprogramar_pieza(p_pieza uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_dueno(public.marca_de_pieza(p_pieza)) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_desprograma';
  end if;
  update public.firmas set vigente = false where pieza_id = p_pieza and vigente;
  update public.piezas set estado = 'por_aprobar', motivo = 'Desprogramada.' where id = p_pieza and estado = 'programada';
  if not found then
    raise exception using errcode = '22023', message = 'pieza_no_programada';
  end if;
end $$;

create function public.descartar_pieza(p_pieza uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_dueno(public.marca_de_pieza(p_pieza)) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_descarta';
  end if;
  update public.firmas set vigente = false where pieza_id = p_pieza and vigente;
  update public.piezas set estado = 'descartada', motivo = nullif(btrim(p_motivo), '') where id = p_pieza;
end $$;

-- «Ya lo publiqué»: closes a piece by hand with its LinkedIn link (a_mano or a doubtful send that did go out).
create function public.cerrar_a_mano(p_pieza uuid, p_enlace text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_dueno(public.marca_de_pieza(p_pieza)) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_cierra';
  end if;
  update public.piezas set estado = 'publicada', enlace = p_enlace, motivo = null
   where id = p_pieza and estado in ('a_mano', 'envio_dudoso');
  if not found then
    raise exception using errcode = '22023', message = 'pieza_no_espera_enlace';
  end if;
end $$;

-- «No salió»: a doubtful send that the person checked and did not go out goes by hand.
create function public.dudoso_a_mano(p_pieza uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_dueno(public.marca_de_pieza(p_pieza)) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_decide';
  end if;
  update public.piezas set estado = 'a_mano', motivo = 'Revisado: no salió. Publícala a mano.'
   where id = p_pieza and estado = 'envio_dudoso';
end $$;

-- The publisher (service role only): leases due pieces so two runs never take the same one.
create function public.tomar_para_publicar() returns setof public.piezas
language sql security definer set search_path = '' as $$
  update public.piezas p set arrendada_hasta = now() + interval '10 minutes'
   where p.id in (
     select id from public.piezas
      where estado = 'programada' and programada_para <= now()
        and (arrendada_hasta is null or arrendada_hasta < now())
      order by programada_para
      limit 10
      for update skip locked)
  returning p.*
$$;

revoke execute on function public.crear_pieza(uuid, text, text, text, text, text), public.nueva_version(uuid, text, text, text, text),
  public.firmar_pieza(uuid, text, timestamptz), public.desprogramar_pieza(uuid), public.descartar_pieza(uuid, text),
  public.cerrar_a_mano(uuid, text), public.dudoso_a_mano(uuid), public.tomar_para_publicar(), public.marca_de_pieza(uuid),
  public.transiciones_de_pieza(), public.normalizar_texto(text) from public, anon;
grant execute on function public.crear_pieza(uuid, text, text, text, text, text), public.nueva_version(uuid, text, text, text, text),
  public.firmar_pieza(uuid, text, timestamptz), public.desprogramar_pieza(uuid), public.descartar_pieza(uuid, text),
  public.cerrar_a_mano(uuid, text), public.dudoso_a_mano(uuid), public.marca_de_pieza(uuid) to authenticated;
revoke execute on function public.tomar_para_publicar() from authenticated;
grant execute on function public.tomar_para_publicar(), public.transiciones_de_pieza() to service_role;
