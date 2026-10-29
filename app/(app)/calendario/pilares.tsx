import { lineaDeAlerta, SEMANAS_DE_PROPORCION } from "@/lib/voz/balance"
import type { BalanceDeCuenta } from "@/lib/voz/lectura"

/** D20: each account's pillars against their four-week target, and the ones two weeks without coming out. */
export function PilaresDelCalendario({ balances }: { balances: BalanceDeCuenta[] }) {
  const conPilares = balances.filter((b) => b.balance.filas.length > 0)
  if (conPilares.length === 0) return null
  return (
    <section aria-labelledby="pilares" className="space-y-3">
      <h2 id="pilares" className="text-lg font-semibold">
        Pilares · últimas {SEMANAS_DE_PROPORCION} semanas
      </h2>
      {conPilares.map(({ cuentaId, cuenta, balance }) => (
        <div key={cuentaId} className="space-y-1 rounded-lg border border-borde p-3 text-sm">
          <p className="font-medium">{cuenta}</p>
          <ul className="space-y-1">
            {balance.filas.map((f) => (
              <li key={f.pilarId}>
                {`${f.nombre}: ${f.salieron} de ${f.meta.toLocaleString("es-CL")}`}
                {f.planeadas > 0 && ` · ${f.planeadas} en camino`}
              </li>
            ))}
          </ul>
          {balance.filas
            .filter((f) => f.alerta)
            .map((f) => (
              <p key={f.pilarId} className="font-medium">
                {lineaDeAlerta(f.nombre, f.diasSinSalir, cuenta)}
              </p>
            ))}
          {balance.sinPilar > 0 && (
            <p className="text-apagado">
              {balance.sinPilar === 1 ? "1 pieza sin pilar." : `${balance.sinPilar} piezas sin pilar.`}
            </p>
          )}
        </div>
      ))}
    </section>
  )
}
