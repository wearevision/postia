-- supabase/migrations/20261110130000_destino_de_piezas.sql
-- Step 3 of «PostIA y las webs»: a piece can link to a page of WR3 or wearevision.cl, with a reference code.
-- The link lives in the text (D22); these columns only say which page and which code, for the publish check.

alter table public.piezas
  add column destino text,
  add column destino_url text,
  add column codigo_ref text;

alter table public.piezas add constraint destino_valido check (
  (destino is null and destino_url is null and codigo_ref is null)
  or (
    codigo_ref ~ '^[23456789abcdefghjkmnpqrstuvwxyz]{3}$'
    and (
      (destino = 'wr3' and destino_url like 'https://wr3.wearevision.cl/%')
      or (destino = 'wav' and destino_url like 'https://wearevision.cl/%')
    )
  )
);

create unique index piezas_codigo_ref_unico on public.piezas (codigo_ref) where codigo_ref is not null;

-- nueva_version copies only text, title and file: a template carousel would lose its theme and design. This writes the
-- version from the latest one, so the versions trigger drops a signature exactly as for any other change.
create or replace function public.poner_destino(
  p_pieza uuid, p_texto text,
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
  if p_destino is not null then
    if v_pieza.codigo_ref is not null and v_pieza.codigo_ref <> p_codigo then
      raise exception using errcode = '22023', message = 'codigo_cambiado';
    end if;
    if position(('utm_content=' || p_codigo) in p_texto) = 0 then
      raise exception using errcode = '22023', message = 'falta_el_enlace';
    end if;
  end if;
  select * into v_ultima from public.versiones where pieza_id = p_pieza order by numero desc limit 1;
  update public.piezas set destino = p_destino, destino_url = p_destino_url, codigo_ref = p_codigo where id = p_pieza;
  insert into public.versiones (pieza_id, numero, texto, titulo, archivo_ruta, archivo_sha256, tema, diseno, creada_por)
  values (p_pieza, v_ultima.numero + 1, p_texto, v_ultima.titulo, v_ultima.archivo_ruta, v_ultima.archivo_sha256,
          v_ultima.tema, v_ultima.diseno, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.poner_destino(uuid, text, text, text, text) from public, anon;
grant execute on function public.poner_destino(uuid, text, text, text, text) to authenticated;
