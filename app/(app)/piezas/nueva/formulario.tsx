"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { BYTES_MAXIMOS_DEL_CARRUSEL, CARACTERES_MAXIMOS_DEL_TEXTO } from "@/lib/piezas/limites"
import { rutaDePieza } from "@/lib/sesion/rutas"
import { createClient } from "@/lib/supabase/client"
import { crearPiezaAccion } from "./acciones"

export interface CuentaDelFormulario {
  id: string
  marcaId: string
  nombre: string
  marca: string
}

const CAMPO = "w-full rounded-lg border border-borde bg-background px-3 py-3"
const MB = 1024 * 1024

export function FormularioDePieza({ cuentas }: { cuentas: CuentaDelFormulario[] }) {
  const router = useRouter()
  const [cuentaId, setCuentaId] = useState(cuentas[0]?.id ?? "")
  const [formato, setFormato] = useState<"texto" | "carrusel_pdf">("texto")
  const [texto, setTexto] = useState("")
  const [titulo, setTitulo] = useState("")
  const [archivo, setArchivo] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()
  const largo = [...texto.replace(/\r\n/g, "\n")].length

  function elegirArchivo(elegido: File | null) {
    if (elegido && elegido.size > BYTES_MAXIMOS_DEL_CARRUSEL) {
      setArchivo(null)
      return setError(`El PDF pesa más de ${BYTES_MAXIMOS_DEL_CARRUSEL / MB} MB. Achícalo antes de subirlo.`)
    }
    setError(null)
    setArchivo(elegido)
  }

  async function subir(marcaId: string, pdf: File): Promise<string | null> {
    const ruta = `${marcaId}/${crypto.randomUUID()}.pdf`
    const { error: errorDeSubida } = await createClient()
      .storage.from("piezas")
      .upload(ruta, pdf, { contentType: "application/pdf" })
    if (errorDeSubida) {
      setError("No pude subir el PDF. Inténtalo de nuevo.")
      return null
    }
    return ruta
  }

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    const cuenta = cuentas.find((c) => c.id === cuentaId)
    if (!cuenta) return setError("Elige una cuenta.")
    if (formato === "carrusel_pdf" && !archivo) return setError("Falta el PDF del carrusel.")
    setError(null)
    iniciar(async () => {
      if (formato === "texto") {
        const resultado = await crearPiezaAccion({ cuentaId, formato, texto })
        return resultado.ok ? router.push(rutaDePieza(resultado.piezaId)) : setError(resultado.error)
      }
      if (!archivo) return
      const archivoRuta = await subir(cuenta.marcaId, archivo)
      if (!archivoRuta) return
      const resultado = await crearPiezaAccion({ cuentaId, formato, texto, titulo, archivoRuta })
      return resultado.ok ? router.push(rutaDePieza(resultado.piezaId)) : setError(resultado.error)
    })
  }

  if (cuentas.length === 0) return <p className="text-apagado">Primero agrega una cuenta en Marcas.</p>
  return (
    <form onSubmit={enviar} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm">Cuenta</span>
        <select value={cuentaId} onChange={(evento) => setCuentaId(evento.target.value)} className={CAMPO}>
          {cuentas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre} · {c.marca}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="space-y-1">
        <legend className="text-sm">Formato</legend>
        <label className="mr-4">
          <input type="radio" name="formato" checked={formato === "texto"} onChange={() => setFormato("texto")} /> Post
          de texto
        </label>
        <label>
          <input
            type="radio"
            name="formato"
            checked={formato === "carrusel_pdf"}
            onChange={() => setFormato("carrusel_pdf")}
          />{" "}
          Carrusel PDF
        </label>
      </fieldset>
      {formato === "carrusel_pdf" && (
        <>
          <label className="block space-y-1">
            <span className="text-sm">Título del carrusel</span>
            <input
              value={titulo}
              maxLength={100}
              onChange={(evento) => setTitulo(evento.target.value)}
              className={CAMPO}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm">PDF (hasta {BYTES_MAXIMOS_DEL_CARRUSEL / MB} MB)</span>
            <input
              type="file"
              accept="application/pdf"
              onChange={(evento) => elegirArchivo(evento.target.files?.[0] ?? null)}
              className={CAMPO}
            />
          </label>
        </>
      )}
      <div className="space-y-1">
        <label htmlFor="texto" className="block text-sm">
          Texto
        </label>
        <textarea
          id="texto"
          value={texto}
          rows={10}
          onChange={(evento) => setTexto(evento.target.value)}
          className={CAMPO}
          aria-describedby="contador"
        />
        <output
          id="contador"
          className={`block text-right text-sm ${largo > CARACTERES_MAXIMOS_DEL_TEXTO ? "text-peligro" : "text-apagado"}`}
        >
          {largo} / {CARACTERES_MAXIMOS_DEL_TEXTO}
        </output>
      </div>
      <button
        type="submit"
        disabled={pendiente}
        className="min-h-11 w-full rounded-lg bg-primario px-4 font-medium text-primario-texto disabled:opacity-60"
      >
        {pendiente ? "Guardando…" : "Crear pieza"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-peligro">
          {error}
        </p>
      )}
    </form>
  )
}
