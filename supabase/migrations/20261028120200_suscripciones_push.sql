-- Devices where a member asked for notices. Whoever has an endpoint and its keys can push to that phone, so only the
-- owner sees their own and the sender (service role) reads them.
create table public.suscripciones_push (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 2048),
  p256dh text not null check (length(p256dh) between 1 and 512),
  auth text not null check (length(auth) between 1 and 512),
  user_agent text check (length(user_agent) <= 300),
  creada_en timestamptz not null default now()
);

alter table public.suscripciones_push enable row level security;

create policy "cada miembro ve sus aparatos" on public.suscripciones_push for select to authenticated
  using (user_id = auth.uid());
create policy "cada miembro suscribe su aparato" on public.suscripciones_push for insert to authenticated
  with check (user_id = auth.uid() and public.tiene_acceso());
create policy "cada miembro quita su aparato" on public.suscripciones_push for delete to authenticated
  using (user_id = auth.uid());

revoke all on public.suscripciones_push from anon, authenticated;
grant select, insert, delete on public.suscripciones_push to authenticated;
