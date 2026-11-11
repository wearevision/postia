-- supabase/migrations/20261110140000_destino_ajustes.sql
-- Review fixes for the piece destination (20261110130000):
-- * The CHECK let a destination through with a NULL page or code (a NULL comparison does not fail a CHECK).
-- * poner_destino now writes over the version the person saw (p_numero_esperado): the text it receives was read
--   outside this transaction, so a correction landing in between must not be overwritten.
-- * The link in the text must start with the destination page and carry the code, not just carry the code.

alter table public.piezas drop constraint destino_valido;

alter table public.piezas add constraint destino_valido check (
  (destino is null and destino_url is null and codigo_ref is null)
  or (
    destino is not null and destino_url is not null and codigo_ref is not null
    and codigo_ref ~ '^[23456789abcdefghjkmnpqrstuvwxyz]{3}$'
    and (
      (destino = 'wr3' and destino_url like 'https://wr3.wearevision.cl/%')
      or (destino = 'wav' and destino_url like 'https://wearevision.cl/%')
    )
  )
);

drop function public.poner_destino(uuid, text, text, text, text);

create function public.poner_destino(
  p_pieza uuid, p_texto text, p_numero_esperado integer,
  p_destino text default null, p_destino_url text default null, p_codigo text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_pieza public.piezas;
  v_ultima public.versiones;
  v_id uuid;
begin
  if not public.es_dueno(public.marca_de_pieza(p_pieza)) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_cambia_piezas';
  end if;
  select * into v_pieza from public.piezas where id = p_pieza for update;
  if v_pieza.estado not in ('por_aprobar', 'en_reserva', 'programada', 'a_mano') then
    raise exception using errcode = '22023', message = 'pieza_no_editable';
  end if;
  select * into v_ultima from public.versiones where pieza_id = p_pieza order by numero desc limit 1;
  if v_ultima.numero is distinct from p_numero_esperado then
    raise exception using errcode = '22023', message = 'version_cambiada';
  end if;
  if p_destino is not null then
    if p_destino_url is null or p_codigo is null then
      raise exception using errcode = '22023', message = 'destino_incompleto';
    end if;
    if v_pieza.codigo_ref is not null and v_pieza.codigo_ref <> p_codigo then
      raise exception using errcode = '22023', message = 'codigo_cambiado';
    end if;
    if not exists (
      select 1 from regexp_split_to_table(p_texto, '\s+') as palabra
      where starts_with(palabra, p_destino_url || '?') and position(('utm_content=' || p_codigo) in palabra) > 0
    ) then
      raise exception using errcode = '22023', message = 'falta_el_enlace';
    end if;
  end if;
  update public.piezas set destino = p_destino, destino_url = p_destino_url, codigo_ref = p_codigo where id = p_pieza;
  insert into public.versiones (pieza_id, numero, texto, titulo, archivo_ruta, archivo_sha256, tema, diseno, creada_por)
  values (p_pieza, v_ultima.numero + 1, p_texto, v_ultima.titulo, v_ultima.archivo_ruta, v_ultima.archivo_sha256,
          v_ultima.tema, v_ultima.diseno, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.poner_destino(uuid, text, integer, text, text, text) from public, anon;
grant execute on function public.poner_destino(uuid, text, integer, text, text, text) to authenticated;
