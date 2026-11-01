-- D19 now publishes every day: the owner sets each account's weekly rhythm (reserve goal, Sunday engine) from Ajustes.
create function public.cambiar_ritmo(p_cuenta uuid, p_ritmo smallint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_cuenta public.cuentas;
begin
  select * into v_cuenta from public.cuentas where id = p_cuenta for update;
  if not found or not public.es_dueno(v_cuenta.marca_id) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_cambia_cuentas';
  end if;
  update public.cuentas set ritmo_semanal = p_ritmo where id = p_cuenta;
end $$;

revoke execute on function public.cambiar_ritmo(uuid, smallint) from public, anon, authenticated;
grant execute on function public.cambiar_ritmo(uuid, smallint) to authenticated;
