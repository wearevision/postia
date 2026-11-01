"use client"

import { useState } from "react"
import { FormularioDeInvestigacion } from "./formulario"

type Props = Omit<React.ComponentProps<typeof FormularioDeInvestigacion>, "alPedir"> & { abierta: boolean }

/** Collapses once a research is asked for: the new card at the top of the page is what Federico came to see. */
export function NuevaInvestigacion({ abierta: inicial, ...formulario }: Props) {
  const [abierta, setAbierta] = useState(inicial)
  if (abierta) return <FormularioDeInvestigacion {...formulario} alPedir={() => setAbierta(false)} />
  return (
    <button type="button" onClick={() => setAbierta(true)} className="boton-primario w-full">
      Nueva investigación
    </button>
  )
}
