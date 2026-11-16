-- WR3 moved to research.wearevision.cl on 2026-11-14 (wr3.wearevision.cl now 301s there) and its paginas.json
-- lists the new host, so a WR3 destination must accept it. The old host stays valid: it still redirects, and a
-- row saved before the move must not break the constraint.

alter table public.piezas drop constraint destino_valido;

alter table public.piezas add constraint destino_valido check (
  (destino is null and destino_url is null and codigo_ref is null)
  or (
    destino is not null and destino_url is not null and codigo_ref is not null
    and codigo_ref ~ '^[23456789abcdefghjkmnpqrstuvwxyz]{3}$'
    and (
      (destino = 'wr3' and (destino_url like 'https://research.wearevision.cl/%'
                            or destino_url like 'https://wr3.wearevision.cl/%'))
      or (destino = 'wav' and destino_url like 'https://wearevision.cl/%')
    )
  )
);
