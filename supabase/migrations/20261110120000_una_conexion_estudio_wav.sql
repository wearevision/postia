-- One «Estudio WAV» connection (docs/superpowers/plans/2026-11-09-rendimiento-4-api.md, task 1). LinkedIn keeps one
-- valid access token per member and app, and a consent with other scopes invalidates the previous tokens: connecting
-- the profile's analytics (r_member_postAnalytics) as a second «Estudio WAV» connection broke the page's token, and
-- renewing the page broke the analytics. The page's consent now asks for r_member_postAnalytics too, and the profile's
-- analytics read with the token of that one connection. conexiones_de_analiticas and conectar_analiticas go.

-- The rule, in one place (not callable by anyone: the security definer functions below use it). The connection that
-- reads a profile account's analytics is the most recently connected «Estudio WAV» connection that carries
-- r_member_postAnalytics and was connected by an owner of the profile account's brand. A page account has none here:
-- its figures come through its own publishing connection (credencial_de_cuenta).
create function public.conexion_de_analiticas(p_cuenta uuid) returns table (conexion uuid, expira_en timestamptz)
language sql stable security definer set search_path = '' as $$
  select x.id, x.expira_en
    from public.cuentas c
    join public.miembros m on m.marca_id = c.marca_id and m.rol = 'dueno'
    join public.conexiones x on x.conectada_por = m.user_id
   where c.id = p_cuenta
     and c.tipo = 'persona'
     and x.app = 'estudio_wav'
     and 'r_member_postAnalytics' = any (x.scopes)
   order by x.conectada_en desc, x.id
   limit 1
$$;

-- The profile's analytics token (service role only; the page's comes from credencial_de_cuenta). Same return shape.
create or replace function public.credencial_de_analiticas(p_cuenta uuid) returns table (token text, expira_en timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.decrypted_secret, a.expira_en
    from public.conexion_de_analiticas(p_cuenta) a
    join vault.decrypted_secrets s on s.name = 'conexion:' || a.conexion
$$;

-- Can PostIA read this account's figures right now? A page through its publishing connection (it carries
-- rw_organization_admin), a profile through conexion_de_analiticas; an expired one does not count.
create or replace function public.analiticas_conectadas(p_cuenta uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.cuentas c
     where c.id = p_cuenta
       and ((c.tipo = 'persona' and exists (select 1 from public.conexion_de_analiticas(c.id) a
                                             where a.expira_en > now()))
         or (c.tipo = 'empresa' and exists (select 1 from public.conexiones x
                                             where x.id = c.conexion_id and x.expira_en > now()))))
$$;

-- Ajustes and Rendimiento (a member of the profile's brand): when the connection that reads the profile's analytics
-- runs out, or null when there is none. Never the token.
create function public.analiticas_del_perfil(p_cuenta uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select a.expira_en
    from public.cuentas c
    cross join lateral public.conexion_de_analiticas(c.id) a
   where c.id = p_cuenta and public.es_miembro(c.marca_id)
$$;

-- The separate connection goes. Its rows go first so its trigger deletes each Vault secret ('analiticas:<cuenta id>');
-- the sweep after it catches any secret left without a row.
delete from public.conexiones_de_analiticas;
delete from vault.secrets where name like 'analiticas:%';
drop trigger conexiones_de_analiticas_sueltan_su_secreto on public.conexiones_de_analiticas;
drop table public.conexiones_de_analiticas;
drop function public.soltar_secreto_de_analiticas();
drop function public.conectar_analiticas(uuid, text, text[], timestamptz);

revoke execute on function public.conexion_de_analiticas(uuid), public.credencial_de_analiticas(uuid),
  public.analiticas_conectadas(uuid), public.analiticas_del_perfil(uuid)
  from public, anon, authenticated;
grant execute on function public.credencial_de_analiticas(uuid) to service_role;
grant execute on function public.analiticas_del_perfil(uuid) to authenticated;
