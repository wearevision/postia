"use client"

import { useState, useTransition } from "react"
import { type Resultado, RITMO_INVALIDO } from "@/lib/marcas/acciones"

interface Props {
  cuentaId: string
  nombre: string
  ritmo: number
  cambiar: (cuentaId: string, ritmoSemanal: number) => Promise<Resultado>
}

export function RitmoDeCuenta({ cuentaId, nombre, ritmo, cambiar }: Props) {
  const [valor, setValor] = useState(String(ritmo))
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()
  const cambiado = valor !== String(ritmo)

  function guardar(evento: React.FormEvent) {
    evento.preventDefault()
    const nuevo = Number(valor)
    if (!Number.isInteger(nuevo) || nuevo < 0 || nuevo > 21) return setError(RITMO_INVALIDO)
    setError(null)
    iniciar(async () => {
      const resultado = await cambiar(cuentaId, nuevo)
      if (!resultado.ok) setError(resultado.error)
    })
  }

  return (
    <form onSubmit={guardar} noValidate className="space-y-1">
      <div className="flex items-end gap-2">
        <label className="space-y-1">
          <span className="block text-sm">Publicaciones por semana de {nombre}</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={21}
            value={valor}
            onChange={(evento) => setValor(evento.target.value)}
            className="campo block min-h-11 w-24"
          />
        </label>
        {cambiado && (
          <button type="submit" disabled={pendiente} className="boton min-h-11">
            Guardar ritmo
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
    </form>
  )
}
