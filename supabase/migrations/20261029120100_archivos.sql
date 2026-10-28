-- Files of pieces (carousel PDFs), private, one folder per brand: «<marca_id>/<uuid>.pdf».
-- Supabase Storage instead of the plano's R2 until template rendering needs R2 (decided 2026-10-28).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('piezas', 'piezas', false, 104857600, array['application/pdf']);

-- CASE guarantees the regex runs before the cast: a first folder that is not a uuid is denied, not an error.
create policy "miembros leen archivos de su marca" on storage.objects for select to authenticated
  using (
    bucket_id = 'piezas'
    and case
      when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
        then public.es_miembro(((storage.foldername(name))[1])::uuid)
      else false
    end
  );
create policy "duenos suben archivos a su marca" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'piezas'
    and case
      when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
        then public.es_dueno(((storage.foldername(name))[1])::uuid)
      else false
    end
  );
