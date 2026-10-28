"use client"

import { useActionState } from "react"
import { crearMarcaAccion } from "./acciones"

export function FormularioMarca() {
  const [resultado, enviar, pendiente] = useActionState(crearMarcaAccion, null)
  return (
    <form action={enviar} className="space-y-3 rounded-lg border border-borde p-4">
      <h2 className="font-medium">Nueva marca</h2>
      <label className="block space-y-1">
        <span className="text-sm">Nombre</span>
        <input
          name="nombre"
          required
          maxLength={80}
          className="w-full rounded-lg border border-borde bg-background px-3 py-3"
        />
      </label>
      <fieldset className="space-y-1">
        <legend className="text-sm">Habla como</legend>
        <label className="mr-4">
          <input type="radio" name="voz" value="yo" defaultChecked /> «yo»
        </label>
        <label>
          <input type="radio" name="voz" value="nosotros" /> «nosotros»
        </label>
      </fieldset>
      <button
        type="submit"
        disabled={pendiente}
        className="min-h-11 w-full rounded-lg bg-primario px-4 font-medium text-primario-texto"
      >
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
