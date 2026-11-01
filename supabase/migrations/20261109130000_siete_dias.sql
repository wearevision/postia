-- D19 changed on 2026-11-01: posts go out every day of the week. An assignment's date is refused only when it is
-- missing or in the past; the hours stay in TypeScript (proponerFecha).
create or replace function public.fecha_de_asignacion_valida(p timestamptz) returns boolean
language sql stable set search_path = '' as $$
  select p is not null and p >= now() + interval '1 minute'
$$;
