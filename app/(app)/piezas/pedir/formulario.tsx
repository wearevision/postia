"use client"

import { useState, useTransition } from "react"
import type { Resultado } from "@/lib/marcas/acciones"

interface Props {
  cuentas: { id: string; nombre: string; marcaId: string }[]
  pilares: { id: string; marcaId: string; nombre: string }[]
  pedir: (entrada: {
    cuentaId: string
    encargo: string
    material: string
    pilarId: string | null
  }) => Promise<Resultado<{ pedidoId: string }>>
}

const CAMPO = "campo w-full"

export function FormularioDePedido({ cuentas, pilares, pedir }: Props) {
  const [cuentaId, setCuentaId] = useState(cuentas[0]?.id ?? "")
  const [pilarId, setPilarId] = useState("")
  const [encargo, setEncargo] = useState("")
  const [material, setMaterial] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState(false)
  const [pendiente, iniciar] = useTransition()
  const marcaId = cuentas.find((c) => c.id === cuentaId)?.marcaId
  const pilaresDeLaCuenta = pilares.filter((p) => p.marcaId === marcaId)

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setError(null)
    setListo(false)
    iniciar(async () => {
      const resultado = await pedir({ cuentaId, encargo, material, pilarId: pilarId || null })
      if (!resultado.ok) return setError(resultado.error)
      setEncargo("")
      setMaterial("")
      setListo(true)
    })
  }

  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm">Cuenta</span>
        <select
          value={cuentaId}
          onChange={(evento) => {
            setCuentaId(evento.target.value)
            setPilarId("")
          }}
          className={CAMPO}
        >
          {cuentas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </label>
      {pilaresDeLaCuenta.length > 0 && (
        <label className="block space-y-1">
          <span className="text-sm">Pilar (opcional)</span>
          <select value={pilarId} onChange={(evento) => setPilarId(evento.target.value)} className={CAMPO}>
            <option value="">Sin pilar</option>
            {pilaresDeLaCuenta.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block space-y-1">
        <span className="text-sm">¿De qué trata el post?</span>
        <textarea
          value={encargo}
          onChange={(evento) => setEncargo(evento.target.value)}
          rows={4}
          maxLength={2000}
          className={CAMPO}
        />
      </label>
      <div className="space-y-1">
        <label htmlFor="material" className="block text-sm">
          Material (opcional)
        </label>
        <p id="material-ayuda" className="text-sm text-apagado">
          Notas, una cita o una fuente con su enlace. Claude cita solo lo que esté aquí. No pegues publicaciones ni
          datos de otras personas o páginas de LinkedIn.
        </p>
        <textarea
          id="material"
          aria-describedby="material-ayuda"
          value={material}
          onChange={(evento) => setMaterial(evento.target.value)}
          rows={5}
          maxLength={8000}
          className={CAMPO}
        />
      </div>
      <button type="submit" disabled={pendiente} className="boton-primario w-full">
        Pedir a Claude
      </button>
      {error && (
        <p role="alert" className="text-sm text-peligro">
          {error}
        </p>
      )}
      {listo && <p className="text-sm">Listo. Claude lo escribe en unos minutos y la pieza aparece en Por firmar.</p>}
    </form>
  )
}
