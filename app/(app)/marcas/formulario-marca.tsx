"use client"

import { useActionState } from "react"
import { crearMarcaAccion } from "./acciones"

export function FormularioMarca() {
  const [resultado, enviar, pendiente] = useActionState(crearMarcaAccion, null)
  return (
    <form action={enviar} className="space-y-3 tarjeta p-4">
      <h2 className="font-medium">Nueva marca</h2>
      <label className="block space-y-1">
        <span className="text-sm">Nombre</span>
        <input name="nombre" required maxLength={80} className="campo w-full" />
      </label>
      <fieldset className="space-y-1">
        <legend className="text-sm">Habla como</legend>
        <label className="mr-4 inline-flex min-h-11 items-center gap-2">
          <input type="radio" name="voz" value="yo" defaultChecked /> «yo»
        </label>
        <label className="inline-flex min-h-11 items-center gap-2">
          <input type="radio" name="voz" value="nosotros" /> «nosotros»
        </label>
      </fieldset>
      <button type="submit" disabled={pendiente} className="boton-primario w-full">
        Crear marca
      </button>
      {resultado && !resultado.ok && (
        <p role="alert" className="text-sm text-peligro">
          {resultado.error}
        </p>
      )}
    </form>
  )
}
