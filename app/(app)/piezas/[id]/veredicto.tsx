import { type Hallazgo, mensajeDe } from "@/lib/clientes/revision"

/** Gate 1 review without AI: it shows, it never blocks. The person signing decides. Null: it could not run. */
export function Veredicto({ hallazgos }: { hallazgos: Hallazgo[] | null }) {
  if (hallazgos === null) {
    return (
      <p role="alert" className="tarjeta p-3 text-sm">
        No pude revisar los clientes. Revísalo tú antes de firmar.
      </p>
    )
  }
  if (hallazgos.length === 0) {
    return (
      <p className="text-sm text-apagado">
        Revisión sin IA: no encontré clientes con excepción, menciones con @ ni precios.
      </p>
    )
  }
  return (
    <section aria-labelledby="veredicto" className="space-y-2 tarjeta p-3">
      <h2 id="veredicto" className="font-medium">
        Revisa antes de firmar
      </h2>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {/* The same words found twice say the same thing: one line each. */}
        {[...new Set(hallazgos.map(mensajeDe))].map((mensaje) => (
          <li key={mensaje}>{mensaje}</li>
        ))}
      </ul>
      <p className="text-sm text-apagado">Puedes firmar igual: tú decides.</p>
    </section>
  )
}
