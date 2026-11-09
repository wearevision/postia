-- Rendimiento, block API (docs/superpowers/plans/2026-11-09-rendimiento-4-api.md, task 1): the owner authorizes
-- «Estudio WAV» to read the analytics of their own posts (r_member_postAnalytics, Community Management API). It is a
-- connection of its own, apart from `conexiones` (which publishes): one per profile account, with its token in Vault as
-- 'analiticas:<cuenta id>'. Owners only.

create table public.conexiones_de_analiticas (
  cuenta_id uuid primary key references public.cuentas (id) on delete cascade,
  scopes text[] not null check ('r_member_postAnalytics' = any (scopes)),
  expira_en timestamptz not null,
  conectada_en timestamptz not null default now(),
  conectada_por uuid not null references auth.users (id)
);
create index conexiones_de_analiticas_por_persona on public.conexiones_de_analiticas (conectada_por);

alter table public.conexiones_de_analiticas enable row level security;
create policy "duenos ven las analiticas de sus cuentas" on public.conexiones_de_analiticas for select to authenticated
  using (exists (select 1 from public.cuentas c
                  where c.id = conexiones_de_analiticas.cuenta_id and public.es_dueno(c.marca_id)));
-- Written only by conectar_analiticas; the token is never a column.
revoke all on public.conexiones_de_analiticas from anon, authenticated;
grant select on public.conexiones_de_analiticas to authenticated;

create function public.conectar_analiticas(p_cuenta uuid, p_token text, p_scopes text[], p_expira_en timestamptz)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_cuenta public.cuentas;
begin
  select * into v_cuenta from public.cuentas where id = p_cuenta for update;
  if not found or not public.es_dueno(v_cuenta.marca_id) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_conecta';
  end if;
  -- The page's figures come through its publishing connection; this one is the member's own posts.
  if v_cuenta.tipo <> 'persona' then
    raise exception using errcode = '22023', message = 'cuenta_no_es_perfil';
  end if;
  if p_scopes is null or not ('r_member_postAnalytics' = any (p_scopes)) then
    raise exception using errcode = '22023', message = 'permisos_analiticas';
  end if;
  if nullif(btrim(p_token), '') is null or p_expira_en is null or p_expira_en <= now() then
    raise exception using errcode = '22023', message = 'conexion_incompleta';
  end if;

  insert into public.conexiones_de_analiticas as c (cuenta_id, scopes, expira_en, conectada_por)
  values (p_cuenta, p_scopes, p_expira_en, auth.uid())
  on conflict (cuenta_id) do update
    set scopes = excluded.scopes, expira_en = excluded.expira_en, conectada_en = now(),
        conectada_por = excluded.conectada_por;
  perform public.guardar_secreto('analiticas:' || p_cuenta, btrim(p_token));
end $$;

-- The secret follows its row, also when the account is deleted and the row goes by cascade.
create function public.soltar_secreto_de_analiticas() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from vault.secrets where name = 'analiticas:' || old.cuenta_id;
  return old;
end $$;

create trigger conexiones_de_analiticas_sueltan_su_secreto
  before delete on public.conexiones_de_analiticas
  for each row execute function public.soltar_secreto_de_analiticas();

revoke execute on function public.conectar_analiticas(uuid, text, text[], timestamptz),
  public.soltar_secreto_de_analiticas() from public, anon, authenticated;
grant execute on function public.conectar_analiticas(uuid, text, text[], timestamptz) to authenticated;
