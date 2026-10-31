"use client"

import { useActionState } from "react"
import type { Resultado } from "@/lib/marcas/acciones"

export function Desconectar({
  cuentaId,
  desconectar,
}: {
  cuentaId: string
  desconectar: (previo: Resultado | null, datos: FormData) => Promise<Resultado>
}) {
  const [resultado, accion, pendiente] = useActionState(desconectar, null)
  return (
    <form action={accion}>
      <input type="hidden" name="cuentaId" value={cuentaId} />
      <button type="submit" disabled={pendiente} className="min-h-11 px-3 text-sm text-apagado">
        Desconectar
      </button>
      {resultado && !resultado.ok && (
        <p role="alert" className="text-sm text-peligro">
          No pude desconectar: {resultado.error} La conexión sigue activa.
        </p>
      )}
    </form>
  )
}
