"use client"

import { useState } from "react"

export function NuevaInvestigacion({ abierta: inicial, children }: { abierta: boolean; children: React.ReactNode }) {
  const [abierta, setAbierta] = useState(inicial)
  if (abierta) return <>{children}</>
  return (
    <button type="button" onClick={() => setAbierta(true)} className="boton-primario w-full">
      Nueva investigación
    </button>
  )
}
