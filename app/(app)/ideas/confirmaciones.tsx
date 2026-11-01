"use client"

import { X } from "lucide-react"
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
  cerrar: (clave: number) => void
}

const SIN_AVISOS: Avisos = { confirmaciones: [], avisar: () => {}, cerrar: () => {} }

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
  const [cerrar] = useState(() => (clave: number) => {
    setConfirmaciones((previas) => previas.filter((c) => c.clave !== clave))
  })
  return <AvisosContexto.Provider value={{ confirmaciones, avisar, cerrar }}>{children}</AvisosContexto.Provider>
}

export function useAvisar() {
  return useContext(AvisosContexto).avisar
}

/** Floats above the bottom bar: the approved card may have been far down the list, out of the top of the page. */
export function Confirmaciones() {
  const { confirmaciones, cerrar } = useContext(AvisosContexto)
  if (confirmaciones.length === 0) return null
  return (
    <div
      data-avisos=""
      className="fixed inset-x-3.5 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-[402px] space-y-2"
    >
      {confirmaciones.map((c) => (
        <output key={c.clave} className="flex items-start gap-2 tarjeta p-3 text-sm shadow-relieve">
          <span className="flex-1">
            {c.tipo === "idea" ? (
              <>
                {`Aprobada · Claude la escribe para ${c.cuentas.join(", ")}, ${fechaCorta(c.primera)}`}
                <Link
                  href={`${rutaConFiltro(undefined, null)}#idea-${c.ideaId}`}
                  className="ml-2 inline-block min-h-11 py-3 underline"
                >
                  Ver
                </Link>
              </>
            ) : (
              `Aprobaste ${c.aprobadas} · se escriben en unos minutos`
            )}
          </span>
          <button
            type="button"
            aria-label="Cerrar aviso"
            onClick={() => cerrar(c.clave)}
            className="-m-2 inline-flex min-h-11 min-w-11 items-center justify-center text-apagado"
          >
            <X aria-hidden="true" strokeWidth={1.75} className="size-4" />
          </button>
        </output>
      ))}
    </div>
  )
}
