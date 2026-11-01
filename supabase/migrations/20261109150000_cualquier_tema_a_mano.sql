-- Federico picks any of the 9 themes by hand for any account (2026-11-01). Claude's carousels
-- (pedir_diseno_de_asignacion) still keep to the account's own family through tema_de_la_voz.

-- Mirrors IDS_DE_TEMA (lib/plantillas/temas.ts); tests/integration/disenos.test.ts keeps them equal.
create function public.tema_conocido(p_tema text) returns boolean
language sql immutable set search_path = '' as $$
  select p_tema in ('oscura', 'papel', 'magenta', 'wav-noche', 'wav-papel', 'wav-degradado',
                    'personal-claro', 'personal-grafito', 'personal-arena')
$$;

revoke execute on function public.tema_conocido(text) from public, anon;
grant execute on function public.tema_conocido(text) to authenticated, service_role;

-- Owners only (D4). The slides' content is checked by revisarCarrusel before this and again in the worker.
create or replace function public.pedir_diseno(
  p_cuenta uuid, p_tema text, p_titulo text, p_texto text, p_diseno jsonb, p_pieza uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_marca uuid;
  v_pieza public.piezas;
  v_base uuid;
  v_id uuid;
begin
  select c.marca_id into v_marca from public.cuentas c where c.id = p_cuenta;
  if v_marca is null or not public.es_dueno(v_marca) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_pide_disenos';
  end if;
  if not public.tema_conocido(p_tema) then
    raise exception using errcode = '22023', message = 'tema_desconocido';
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
