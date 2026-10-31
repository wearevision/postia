"use client"

import { useActionState } from "react"
import { agregarCuentaAccion } from "./acciones"

const CAMPO = "campo"

export function FormularioCuenta({ marcaId }: { marcaId: string }) {
  const [resultado, enviar, pendiente] = useActionState(agregarCuentaAccion, null)
  return (
    <form action={enviar} className="space-y-2">
      <input type="hidden" name="marcaId" value={marcaId} />
      <input
        name="nombre"
        required
        maxLength={80}
        placeholder="Nombre de la cuenta de LinkedIn"
        aria-label="Nombre de la cuenta"
        className={`w-full ${CAMPO}`}
      />
      <div className="flex gap-2">
        <select name="tipo" aria-label="Tipo" className={`flex-1 ${CAMPO}`} defaultValue="persona">
          <option value="persona">Perfil</option>
          <option value="empresa">Página</option>
        </select>
        <select name="ruta" aria-label="Cómo sale" className={`flex-1 ${CAMPO}`} defaultValue="api">
          <option value="api">Sale sola (API)</option>
          <option value="a_mano">A mano</option>
          <option value="metricool">Metricool</option>
        </select>
        <input
          name="ritmoSemanal"
          type="number"
          min={0}
          max={21}
          defaultValue={3}
          aria-label="Publicaciones por semana"
          className="campo w-16 px-2"
        />
      </div>
      <button type="submit" disabled={pendiente} className="boton w-full">
        Agregar cuenta
      </button>
      {resultado && !resultado.ok && (
        <p role="alert" className="text-sm text-peligro">
          {resultado.error}
        </p>
      )}
    </form>
  )
}
