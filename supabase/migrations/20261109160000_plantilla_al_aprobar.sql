-- Federico picks a carousel's template when he approves its idea (2026-11-01), before anything is designed.
-- The assignment keeps it and Claude's design request must use it. Assignments approved before this (tema null)
-- keep the old rule: Claude picks within the account's family.

alter table public.asignaciones
  add column tema text check (tema is null or public.tema_conocido(tema)),
  add constraint asignaciones_tema_solo_en_carruseles check (tema is null or formato = 'carrusel_pdf');

-- 20261106120000_series.sql's body; each item may carry «tema», only for a carousel and only one of the nine.
create or replace function public.aprobar_idea(p_idea uuid, p_asignaciones jsonb) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare
  v_idea public.ideas;
  v_item jsonb;
  v_cuenta uuid;
  v_fecha timestamptz;
  v_marca uuid;
  v_cuentas uuid[] := '{}';
  v_fechas timestamptz[] := '{}';
  v_tema text;
  v_temas text[] := '{}';
  v_id uuid;
  v_ids uuid[] := '{}';
begin
  if not public.es_dueno_de_alguna() then
    raise exception using errcode = '42501', message = 'solo_el_dueno_aprueba';
  end if;
  if p_asignaciones is null or jsonb_typeof(p_asignaciones) <> 'array'
     or jsonb_array_length(p_asignaciones) not between 1 and 10 then
    raise exception using errcode = '22023', message = 'asignaciones_invalidas';
  end if;
  select * into v_idea from public.ideas where id = p_idea for update;
  if not found or v_idea.estado <> 'propuesta' then
    raise exception using errcode = '22023', message = 'idea_no_esta_propuesta';
  end if;
  if exists (select 1 from public.trabajos_de_investigacion
              where idea_id = p_idea and tipo = 'otra_idea' and estado in ('pendiente', 'trabajando')) then
    raise exception using errcode = '22023', message = 'trabajo_en_curso';
  end if;
  for v_item in select e from jsonb_array_elements(p_asignaciones) with ordinality as x(e, n) order by n loop
    begin
      v_cuenta := (v_item ->> 'cuenta')::uuid;
      v_fecha := (v_item ->> 'planeada_para')::timestamptz;
    exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
      raise exception using errcode = '22023', message = 'asignaciones_invalidas';
    end;
    v_tema := v_item ->> 'tema';
    if v_cuenta is null
       or (v_tema is not null and (v_idea.formato <> 'carrusel_pdf' or not public.tema_conocido(v_tema))) then
      raise exception using errcode = '22023', message = 'asignaciones_invalidas';
    end if;
    select marca_id into v_marca from public.cuentas where id = v_cuenta;
    if v_marca is null or not public.es_dueno(v_marca) then
      raise exception using errcode = '42501', message = 'solo_el_dueno_aprueba';
    end if;
    if not public.fecha_de_asignacion_valida(v_fecha) then
      raise exception using errcode = '22023', message = 'fecha_no_valida';
    end if;
    if v_cuenta = any (v_cuentas)
       or exists (select 1 from public.asignaciones where idea_id = p_idea and cuenta_id = v_cuenta) then
      raise exception using errcode = '22023', message = 'cuenta_repetida';
    end if;
    v_cuentas := v_cuentas || v_cuenta;
    v_fechas := v_fechas || v_fecha;
    v_temas := v_temas || v_tema;
  end loop;
  -- The insert trigger locks each account's slots (horario_de_asignacion_libre). Taking them all first, in one order,
  -- keeps two approvals that share accounts from each holding one and waiting on the other.
  for v_cuenta in select c from unnest(v_cuentas) c order by c loop
    perform pg_advisory_xact_lock(hashtext('horario:' || v_cuenta::text));
  end loop;
  for n in 1 .. cardinality(v_cuentas) loop
    begin
      insert into public.asignaciones (idea_id, cuenta_id, formato, planeada_para, tema)
      values (p_idea, v_cuentas[n], v_idea.formato, v_fechas[n], v_temas[n])
      returning id into v_id;
    exception when unique_violation then
      raise exception using errcode = '23505', message = 'horario_ocupado';
    end;
    v_ids := v_ids || v_id;
  end loop;
  update public.ideas set estado = 'aprobada', aprobada_por = auth.uid() where id = p_idea;
  return v_ids;
end $$;

-- 20261106120000_series.sql's body; a chosen theme replaces the family check.
create or replace function public.pedir_diseno_de_asignacion(
  p_asignacion uuid, p_tema text, p_titulo text, p_texto text, p_diseno jsonb, p_linea_version integer,
  p_planeada_para timestamptz
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_asignacion public.asignaciones;
  v_idea public.ideas;
  v_voz text;
  v_id uuid;
begin
  select * into v_asignacion from public.asignaciones where id = p_asignacion for update;
  if not found or v_asignacion.estado <> 'escribiendo' or v_asignacion.formato <> 'carrusel_pdf' then
    raise exception using errcode = '22023', message = 'asignacion_no_esta_escribiendo';
  end if;
  select * into v_idea from public.ideas where id = v_asignacion.idea_id;
  if v_idea.aprobada_por is null then
    raise exception using errcode = '22023', message = 'idea_sin_aprobador';
  end if;
  if v_asignacion.tema is not null then
    if p_tema is distinct from v_asignacion.tema then
      raise exception using errcode = '22023', message = 'tema_no_elegido';
    end if;
  else
    select m.voz into v_voz from public.cuentas c join public.marcas m on m.id = c.marca_id
     where c.id = v_asignacion.cuenta_id;
    if not public.tema_de_la_voz(p_tema, v_voz) then
      raise exception using errcode = '22023', message = 'tema_de_otra_marca';
    end if;
  end if;
  insert into public.pedidos_de_diseno (cuenta_id, tema, titulo, texto, diseno, pedido_por, asignacion_id,
                                        planeada_para, origen, linea_version)
  values (v_asignacion.cuenta_id, p_tema, btrim(p_titulo), btrim(p_texto), p_diseno, v_idea.aprobada_por,
          p_asignacion, p_planeada_para, 'claude', p_linea_version)
  returning id into v_id;
  update public.asignaciones set pedido_de_diseno_id = v_id, arrendado_hasta = null where id = p_asignacion;
  return v_id;
end $$;
