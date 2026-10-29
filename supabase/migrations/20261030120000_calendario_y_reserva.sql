-- C2: a proposed slot for pieces nobody signed yet, the reserve week (D21) and grouped notices (D26).
-- Plano: «Lógica del calendario» (proponerFecha, horarioLibreEnCuenta, usarReserva), «Estados de una pieza».
-- The C1 migrations are in production: anything they defined is changed here with alter / create or replace.

-- A proposed slot, never a signature: programada_para keeps meaning «the signed date».
alter table public.piezas add column planeada_para timestamptz;

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
