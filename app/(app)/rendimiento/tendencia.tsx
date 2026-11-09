import { cifra, mesLegible } from "@/lib/rendimiento/formato"
import type { MesDeRendimiento } from "@/lib/rendimiento/lectura"

export function Tendencia({ meses }: { meses: MesDeRendimiento[] }) {
  if (meses.length === 0) return null
  return (
    <section aria-labelledby="titulo-tendencia" className="space-y-3">
      <h2 id="titulo-tendencia" className="text-lg font-semibold">
        Tendencia
      </h2>
      <div className="overflow-x-auto">
        <table aria-label="Tendencia por mes" className="w-full text-left text-sm">
          <thead className="text-apagado">
            <tr>
              <th scope="col" className="py-2 pr-3 font-medium">
                Mes
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                Impresiones
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                Interacciones
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                Nuevos seguidores
              </th>
              <th scope="col" className="py-2 pl-2 text-right font-medium">
                Visitas
              </th>
            </tr>
          </thead>
          <tbody>
            {meses.map((m) => (
              <tr key={m.mes} className="border-t border-borde">
                <th scope="row" className="py-2 pr-3 font-medium">
                  {mesLegible(m.mes)}
                </th>
                <td className="px-2 py-2 text-right">{cifra(m.impresiones)}</td>
                <td className="px-2 py-2 text-right">{cifra(m.interacciones)}</td>
                <td className="px-2 py-2 text-right">{cifra(m.seguidoresNuevos)}</td>
                <td className="py-2 pl-2 text-right">{cifra(m.visitas)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
