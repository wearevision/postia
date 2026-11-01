"use client"

import Link from "next/link"
import { createContext, useContext, useRef, useState } from "react"
import { fechaCorta } from "@/lib/piezas/fechas"
import { rutaConFiltro } from "@/lib/series/filtro"

type Confirmacion =
  | { tipo: "idea"; ideaId: string; cuentas: readonly string[]; primera: string }
  | { tipo: "serie"; aprobadas: number }

type ConClave = Confirmacion & { clave: number }

interface Avisos {
  confirmaciones: readonly ConClave[]
  avisar: (confirmacion: Confirmacion) => void
}

const SIN_AVISOS: Avisos = { confirmaciones: [], avisar: () => {} }

const AvisosContexto = createContext<Avisos>(SIN_AVISOS)

/**
 * Approving takes the idea out of «Por revisar» and the revalidation unmounts its card, so the confirmation cannot
 * live in the card: it lives here, above the list, which the revalidated page re-renders in place.
 */
export function ConfirmacionesProvider({ children }: { children: React.ReactNode }) {
  const [confirmaciones, setConfirmaciones] = useState<readonly ConClave[]>([])
  const siguiente = useRef(0)
  const [avisar] = useState(() => (confirmacion: Confirmacion) => {
    const clave = siguiente.current++
    setConfirmaciones((previas) => [{ ...confirmacion, clave }, ...previas])
  })
  return <AvisosContexto.Provider value={{ confirmaciones, avisar }}>{children}</AvisosContexto.Provider>
}

export function useAvisar() {
  return useContext(AvisosContexto).avisar
}

export function Confirmaciones() {
  const { confirmaciones } = useContext(AvisosContexto)
  if (confirmaciones.length === 0) return null
  return (
    <div className="space-y-2">
      {confirmaciones.map((c) =>
        c.tipo === "idea" ? (
          <output key={c.clave} className="block space-y-1 tarjeta p-3 text-sm">
            {`Aprobada · Claude la escribe para ${c.cuentas.join(", ")}, ${fechaCorta(c.primera)}`}
            <Link
              href={`${rutaConFiltro(undefined, null)}#idea-${c.ideaId}`}
              className="ml-2 inline-block min-h-11 py-3 underline"
            >
              Ver
            </Link>
          </output>
        ) : (
          <output key={c.clave} className="block tarjeta p-3 text-sm">
            {`Aprobaste ${c.aprobadas} · se escriben en unos minutos`}
          </output>
        ),
      )}
    </div>
  )
}
