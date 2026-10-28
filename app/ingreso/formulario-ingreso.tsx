"use client"

import { useState, useTransition } from "react"
import type { ResultadoIngreso } from "@/lib/ingreso/ingreso"

interface Props {
  pedirCodigo: (correo: string) => Promise<ResultadoIngreso>
  verificarCodigo: (correo: string, codigo: string) => Promise<ResultadoIngreso>
  aviso?: string
}

const CAMPO = "w-full rounded-lg border border-borde bg-background px-4 py-3 text-base"
const BOTON = "w-full min-h-11 rounded-lg bg-primario px-4 py-3 font-medium text-primario-texto disabled:opacity-60"

export function FormularioIngreso({ pedirCodigo, verificarCodigo, aviso }: Props) {
  const [paso, setPaso] = useState<"correo" | "codigo">("correo")
  const [correo, setCorreo] = useState("")
  const [codigo, setCodigo] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()

  function mandarCorreo(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    iniciar(async () => {
      const resultado = await pedirCodigo(correo)
      if (!resultado.ok) return setError(resultado.error)
      setError(null)
      setPaso("codigo")
    })
  }

  function mandarCodigo(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    iniciar(async () => {
      // On success the server action redirects to Inicio.
      const resultado = await verificarCodigo(correo, codigo)
      if (!resultado.ok) setError(resultado.error)
    })
  }

  return (
    <div className="space-y-4">
      {aviso && <p className="rounded-lg border border-borde p-3 text-sm">{aviso}</p>}
      {paso === "correo" ? (
        <form onSubmit={mandarCorreo} className="space-y-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Tu correo</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              className={CAMPO}
            />
          </label>
          <button type="submit" disabled={pendiente} className={BOTON}>
            Mandar código
          </button>
        </form>
      ) : (
        <form onSubmit={mandarCodigo} className="space-y-3">
          <p className="text-sm">Si tu correo está invitado, te llegó un código de 6 números.</p>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Código de 6 números</span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              className={`${CAMPO} tracking-[0.4em]`}
            />
          </label>
          <button type="submit" disabled={pendiente} className={BOTON}>
            Entrar
          </button>
          <button type="button" onClick={() => setPaso("correo")} className="w-full min-h-11 text-sm text-apagado">
            Usar otro correo
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm text-peligro">
          {error}
        </p>
      )}
    </div>
  )
}
