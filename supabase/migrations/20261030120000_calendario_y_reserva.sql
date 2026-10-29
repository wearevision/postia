-- C2: a proposed slot for pieces nobody signed yet, the reserve week (D21) and grouped notices (D26).
-- Plano: «Lógica del calendario» (proponerFecha, horarioLibreEnCuenta, usarReserva), «Estados de una pieza».
-- The C1 migrations are in production: anything they defined is changed here with alter / create or replace.

-- A proposed slot, never a signature: programada_para keeps meaning «the signed date».
alter table public.piezas add column planeada_para timestamptz;
-- When the publisher last failed to move an unsigned piece out of a slot that passed: it is skipped for an hour so a few
-- stuck pieces never starve the others, and it tells the person once (registrar_falla_de_espacio).
alter table public.piezas add column plan_fallo_en timestamptz;

-- While a piece is signed its plan is its signed date, so one column answers «which slot does this piece hold»
-- (the slot index below and lib/piezas/lectura.ts horariosOcupados rely on it). Leaving the signed states keeps the slot.
create function public.alinear_plan() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.estado in ('programada', 'publicando', 'publicada') then
    new.planeada_para := new.programada_para;
  end if;
  return new;
end $$;
create trigger piezas_alinear_plan before insert or update on public.piezas
  for each row execute function public.alinear_plan();

-- Pieces that went through a signature keep their day as plan; unsigned pieces start without one (a stale date of a
-- piece unscheduled before C2 could collide with a slot signed since).
update public.piezas set planeada_para = programada_para where programada_para is not null and estado <> 'por_aprobar';

-- One account never holds two pieces in one slot, signed or planned (plano: horarioLibreEnCuenta, only inside the account).
-- The C1 index piezas_un_horario_por_cuenta (signed pieces only) is now redundant: this one covers a superset of its
-- rows. It stays on purpose because C1 is in production and dropping it buys nothing.
create unique index piezas_un_plan_por_cuenta on public.piezas (cuenta_id, planeada_para)
  where estado in ('por_aprobar', 'programada', 'publicando', 'publicada');

-- Moving a proposed slot (plano: moverFecha). The slot index answers 23505 when the slot is taken.
create function public.planear_pieza(p_pieza uuid, p_fecha timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_dueno(public.marca_de_pieza(p_pieza)) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_planea';
  end if;
  if p_fecha is null or p_fecha < now() + interval '1 minute' then
    raise exception using errcode = '22023', message = 'fecha_en_el_pasado';
  end if;
  update public.piezas set planeada_para = p_fecha where id = p_pieza and estado = 'por_aprobar';
  if not found then
    raise exception using errcode = '22023', message = 'pieza_no_esta_por_aprobar';
  end if;
end $$;

revoke execute on function public.planear_pieza(uuid, timestamptz) from public, anon;
grant execute on function public.planear_pieza(uuid, timestamptz) to authenticated;
revoke execute on function public.alinear_plan() from public, anon, authenticated;

-- D21: «en_reserva» is signed without a date; the app gives it one when a signed piece is missing.
alter table public.piezas drop constraint piezas_estado_check;
alter table public.piezas add constraint piezas_estado_check check (estado in (
  'por_aprobar', 'en_reserva', 'programada', 'publicando', 'publicada', 'envio_dudoso', 'a_mano', 'error', 'descartada'
));

-- A reserve signature binds a huella without a date; cubrir_con_reserva writes the slot on it when it is used.
alter table public.firmas alter column programada_para drop not null;
alter table public.firmas add column para_reserva boolean not null default false;
alter table public.firmas add constraint firma_con_fecha_o_reserva check (para_reserva or programada_para is not null);

-- Same table as lib/piezas/estados.ts. create or replace keeps the C1 grants.
create or replace function public.transiciones_de_pieza() returns table (de text, a text[])
language sql immutable set search_path = '' as $$
  values
    ('por_aprobar', array['programada', 'en_reserva', 'descartada']),
    ('en_reserva', array['programada', 'por_aprobar', 'descartada']),
    ('programada', array['por_aprobar', 'publicando', 'a_mano', 'descartada']),
    ('publicando', array['publicada', 'envio_dudoso', 'a_mano', 'error']),
    ('error', array['programada', 'por_aprobar', 'descartada']),
    ('envio_dudoso', array['publicada', 'a_mano', 'descartada']),
    ('a_mano', array['publicada', 'por_aprobar', 'descartada']),
    ('publicada', array[]::text[]),
    ('descartada', array[]::text[])
$$;

create or replace function public.guardia_de_estado() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_huella text;
begin
  if new.estado is distinct from old.estado then
    if not exists (select 1 from public.transiciones_de_pieza() t where t.de = old.estado and new.estado = any (t.a)) then
      raise exception using errcode = '23514', message = format('transicion_no_permitida %s -> %s', old.estado, new.estado);
    end if;
    select v.huella into v_huella from public.versiones v where v.pieza_id = new.id order by v.numero desc limit 1;
    -- Scheduling needs the signature of the current version for exactly this date (Puerta 2). The date check is new in
    -- C2: a reserve piece only becomes programada once cubrir_con_reserva wrote its slot on the signature.
    if new.estado = 'programada' and not exists (
      select 1 from public.firmas f
       where f.pieza_id = new.id and f.vigente and f.huella = v_huella and f.programada_para = new.programada_para
    ) then
      raise exception using errcode = '23514', message = 'programar_sin_firma_vigente';
    end if;
    if new.estado = 'en_reserva' and not exists (
      select 1 from public.firmas f where f.pieza_id = new.id and f.vigente and f.para_reserva and f.huella = v_huella
    ) then
      raise exception using errcode = '23514', message = 'reservar_sin_firma_vigente';
    end if;
    -- Sending needs the signature of the current version for exactly this date (Puerta 2, Sale lo que se aprobó).
    if new.estado = 'publicando' and not exists (
      select 1 from public.firmas f
       where f.pieza_id = new.id and f.vigente and f.programada_para = new.programada_para and f.huella = v_huella
    ) then
      raise exception using errcode = '23514', message = 'publicar_sin_firma_vigente';
    end if;
    insert into public.eventos (pieza_id, de, a, por, motivo) values (new.id, old.estado, new.estado, auth.uid(), new.motivo);
  end if;
  return new;
end $$;

-- A new version drops any signature; scheduled, by-hand and reserve pieces go back to the gate (Sale lo que se aprobó).
create or replace function public.version_nueva_cae_firma() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.numero > 1 then
    update public.firmas set vigente = false where pieza_id = new.pieza_id and vigente;
    update public.piezas set estado = 'por_aprobar', arrendada_hasta = null,
           motivo = 'Cambió el texto o el archivo: hay que firmar de nuevo.'
     where id = new.pieza_id and estado in ('programada', 'a_mano', 'en_reserva');
  end if;
  return new;
end $$;

-- C1 body plus en_reserva among the editable states.
create or replace function public.nueva_version(
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
  if v_estado not in ('por_aprobar', 'en_reserva', 'programada', 'a_mano') then
    raise exception using errcode = '22023', message = 'pieza_no_editable';
  end if;
  select coalesce(max(numero), 0) + 1 into v_numero from public.versiones where pieza_id = p_pieza;
  insert into public.versiones (pieza_id, numero, texto, titulo, archivo_ruta, archivo_sha256, creada_por)
  values (p_pieza, v_numero, p_texto, p_titulo, p_archivo_ruta, p_archivo_sha256, auth.uid()) returning id into v_id;
  return v_id;
end $$;

create function public.firmar_para_reserva(p_pieza uuid, p_huella text) returns uuid
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
  update public.firmas set vigente = false where pieza_id = p_pieza and vigente;
  insert into public.firmas (pieza_id, version_id, huella, programada_para, para_reserva, firmada_por)
  values (p_pieza, v_version.id, v_version.huella, null, true, auth.uid()) returning id into v_firma;
  -- In the reserve a piece holds no slot; the one it had becomes free for another piece.
  update public.piezas set estado = 'en_reserva', planeada_para = null, programada_para = null,
         arrendada_hasta = null, motivo = null
   where id = p_pieza;
  return v_firma;
end $$;

create function public.sacar_de_reserva(p_pieza uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_dueno(public.marca_de_pieza(p_pieza)) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_saca_de_la_reserva';
  end if;
  perform 1 from public.piezas where id = p_pieza and estado = 'en_reserva' for update;
  if not found then
    raise exception using errcode = '22023', message = 'pieza_no_esta_en_reserva';
  end if;
  update public.firmas set vigente = false where pieza_id = p_pieza and vigente;
  update public.piezas set estado = 'por_aprobar', motivo = 'Salió de la reserva.' where id = p_pieza;
end $$;

revoke execute on function public.firmar_para_reserva(uuid, text), public.sacar_de_reserva(uuid) from public, anon;
grant execute on function public.firmar_para_reserva(uuid, text), public.sacar_de_reserva(uuid) to authenticated;

-- D21, plano usarReserva (service role only): a due piece nobody signed gives its slot to the oldest reserve piece of
-- its account and moves to p_siguiente (computed by the app with proponerFecha). One transaction: a taken p_siguiente
-- (23505) undoes everything. Returns the reserve piece used, or null when there was none to use.
create function public.cubrir_con_reserva(p_pendiente uuid, p_siguiente timestamptz) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_pendiente public.piezas;
  v_hueco timestamptz;
  v_reserva uuid;
begin
  select * into v_pendiente from public.piezas where id = p_pendiente for update;
  if not found or v_pendiente.estado <> 'por_aprobar' or v_pendiente.planeada_para is null
     or v_pendiente.planeada_para > now() then
    raise exception using errcode = '22023', message = 'pieza_no_espera_reserva';
  end if;
  if p_siguiente is null or p_siguiente < now() + interval '1 minute' then
    raise exception using errcode = '22023', message = 'fecha_en_el_pasado';
  end if;
  v_hueco := v_pendiente.planeada_para;
  -- The pending piece leaves the slot first: the slot index would otherwise see two pieces in it.
  update public.piezas set planeada_para = p_siguiente, plan_fallo_en = null,
         motivo = 'No alcanzó firma a tiempo: la corrí al siguiente espacio libre.'
   where id = p_pendiente;

  -- Past the slot's window the reserve piece would go out late («Ventana de atraso»): then no reserve is used.
  select p.id into v_reserva
    from public.piezas p
    join public.firmas f on f.pieza_id = p.id and f.vigente and f.para_reserva
   where p.cuenta_id = v_pendiente.cuenta_id and p.estado = 'en_reserva'
     and now() <= v_hueco + make_interval(mins => p.ventana_minutos)
   order by f.firmada_en, p.id
   limit 1
   for update of p, f skip locked;
  if v_reserva is null then
    return null;
  end if;

  -- Signature first: the guard checks that the signature's date is the piece's date. reservar_envio checks it again.
  update public.firmas set programada_para = v_hueco where pieza_id = v_reserva and vigente;
  update public.piezas set estado = 'programada', programada_para = v_hueco, arrendada_hasta = null,
         motivo = 'Salió de la reserva para cubrir un espacio sin firma.'
   where id = v_reserva;
  return v_reserva;
end $$;

-- The publisher's way back to the gate (service role only). The cause decides, and the publisher says which:
--  * p_a_la_reserva = true (timing: the slot's window passed): a piece that came out of the reserve (its current
--    signature is a reserve one for the current version) returns to en_reserva with that signature intact and no dates;
--    any other piece goes to por_aprobar.
--  * p_a_la_reserva = false (the piece itself: file changed, unreadable, missing PDF): the piece goes to por_aprobar and
--    a reserve signature is dropped, so it cannot be picked again and fail again.
-- Two moves in one transaction because the state table has no programada -> en_reserva edge. Returns the new state.
create function public.devolver_pieza(p_pieza uuid, p_motivo text, p_a_la_reserva boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_huella text;
  v_firma_de_reserva boolean;
begin
  perform 1 from public.piezas where id = p_pieza for update;
  if not found then
    raise exception using errcode = '22023', message = 'pieza_no_existe';
  end if;
  update public.piezas set estado = 'por_aprobar', motivo = p_motivo, arrendada_hasta = null where id = p_pieza;
  select v.huella into v_huella from public.versiones v where v.pieza_id = p_pieza order by v.numero desc limit 1;
  select exists (
    select 1 from public.firmas f where f.pieza_id = p_pieza and f.vigente and f.para_reserva and f.huella = v_huella
  ) into v_firma_de_reserva;
  if not v_firma_de_reserva then
    return 'por_aprobar';
  end if;
  if not p_a_la_reserva then
    update public.firmas set vigente = false where pieza_id = p_pieza and vigente and para_reserva;
    return 'por_aprobar';
  end if;
  update public.firmas set programada_para = null where pieza_id = p_pieza and vigente and para_reserva;
  update public.piezas set estado = 'en_reserva', planeada_para = null, programada_para = null,
         motivo = 'Volvió a la reserva: no alcanzó a salir en su espacio.'
   where id = p_pieza;
  return 'en_reserva';
end $$;

-- Service role only. Writes why a due unsigned piece could not be moved and when; true the first time it happens.
create function public.registrar_falla_de_espacio(p_pieza uuid, p_motivo text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_primera boolean;
begin
  select plan_fallo_en is null into v_primera from public.piezas where id = p_pieza and estado = 'por_aprobar' for update;
  if not found then
    return false;
  end if;
  update public.piezas set plan_fallo_en = now(), motivo = p_motivo where id = p_pieza;
  return v_primera;
end $$;

-- Service role only: Supabase's default privileges grant execute to anon and authenticated otherwise.
revoke execute on function public.registrar_falla_de_espacio(uuid, text) from public, anon, authenticated;
grant execute on function public.registrar_falla_de_espacio(uuid, text) to service_role;
revoke execute on function public.cubrir_con_reserva(uuid, timestamptz), public.devolver_pieza(uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.cubrir_con_reserva(uuid, timestamptz), public.devolver_pieza(uuid, text, boolean) to service_role;

-- D26: non-urgent notices wait here for the 9:00 and 17:00 digest (trigger/resumen.ts). Service role only.
create table public.avisos_pendientes (
  id uuid primary key default gen_random_uuid(),
  marca_id uuid not null references public.marcas (id) on delete cascade,
  titulo text not null check (length(titulo) between 1 and 120),
  cuerpo text not null check (length(cuerpo) between 1 and 300),
  url text not null check (url ~ '^/[^/]'),
  creado_en timestamptz not null default now(),
  enviado_en timestamptz
);
create index avisos_pendientes_sin_enviar on public.avisos_pendientes (marca_id) where enviado_en is null;

alter table public.avisos_pendientes enable row level security;
-- No policies: people never see the queue. The revoke matters because Supabase grants new tables to anon and authenticated.
revoke all on public.avisos_pendientes from anon, authenticated;
