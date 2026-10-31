"use client"

import Link from "next/link"
import { useActionState } from "react"
import type { Resultado } from "@/lib/marcas/acciones"
import { RUTA_DE_AJUSTES } from "@/lib/sesion/rutas"

type Agregar = (previo: Resultado | null, datos: FormData) => Promise<Resultado>

const CAMPO = "campo"

export function FormularioCuenta({ marcaId, agregar }: { marcaId: string; agregar: Agregar }) {
  const [resultado, enviar, pendiente] = useActionState(agregar, null)
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
      {resultado?.ok && (
        // biome-ignore lint/a11y/useSemanticElements: jsdom drops element children inside <output>, so the link would be untestable
        <p role="status" className="text-sm">
          Cuenta agregada. Conéctala en{" "}
          <Link href={RUTA_DE_AJUSTES} className="underline">
            Ajustes
          </Link>
          .
        </p>
      )}
      {resultado && !resultado.ok && (
        <p role="alert" className="text-sm text-peligro">
          {resultado.error}
        </p>
      )}
    </form>
  )
}
