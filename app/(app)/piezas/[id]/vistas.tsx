export function VistasDelCarrusel({ vistas }: { vistas: string[] }) {
  return (
    <ol aria-label="Láminas del carrusel" className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
      {vistas.map((src, i) => (
        <li key={src} className="w-[85%] flex-none snap-center">
          {/* biome-ignore lint/performance/noImgElement: signed Supabase URLs of the exact published images; no Next image optimizer on Cloudflare */}
          <img
            src={src}
            alt={`Lámina ${i + 1} de ${vistas.length}`}
            width={1080}
            height={1350}
            className="h-auto w-full rounded-lg border border-borde"
          />
        </li>
      ))}
    </ol>
  )
}
