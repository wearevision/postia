import { TriangleAlert } from "lucide-react"

/** A piece that was signed and then changed: says the signature dropped, what changed, and that it needs signing again. */
export function FirmaCaida({ cambio }: { cambio: string | null }) {
  return (
    <section aria-label="La firma se cayó" className="flex gap-3 rounded-lg border border-control p-3 shadow-hundido">
      <TriangleAlert
        aria-hidden="true"
        fill="currentColor"
        strokeWidth={1.75}
        className="mt-0.5 size-5 flex-none text-primario"
      />
      <div className="space-y-1 text-sm">
        <p className="font-semibold">Tu firma anterior se cayó.</p>
        <p>{cambio ? `${cambio} ` : ""}Hay que firmar esta versión de nuevo.</p>
      </div>
    </section>
  )
}
