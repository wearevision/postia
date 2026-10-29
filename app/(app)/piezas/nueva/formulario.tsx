"use client"

import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"
import type { Resultado } from "@/lib/marcas/acciones"
import { sha256Hex } from "@/lib/piezas/hash-cliente"
import { BYTES_MAXIMOS_DEL_CARRUSEL, CARACTERES_MAXIMOS_DEL_TEXTO } from "@/lib/piezas/limites"
import { rutaDePieza } from "@/lib/sesion/rutas"
import { createClient } from "@/lib/supabase/client"

export interface CuentaDelFormulario {
  id: string
  marcaId: string
  nombre: string
  marca: string
}

export interface PilarDelFormulario {
  id: string
  marcaId: string
  nombre: string
}

interface Props {
  cuentas: CuentaDelFormulario[]
  pilares?: PilarDelFormulario[]
  crear: (entrada: unknown) => Promise<Resultado<{ piezaId: string }>>
  subir?: (marcaId: string, pdf: File) => Promise<string | null>
}

const CAMPO = "w-full rounded-lg border border-borde bg-background px-3 py-3"
const OPCION = "flex min-h-11 items-center gap-2"
const MB = 1024 * 1024

async function subirDesdeElNavegador(marcaId: string, pdf: File): Promise<string | null> {
  const ruta = `${marcaId}/${crypto.randomUUID()}.pdf`
  const { error } = await createClient().storage.from("piezas").upload(ruta, pdf, { contentType: "application/pdf" })
  return error ? null : ruta
}

export function FormularioDePieza({ cuentas, pilares = [], crear, subir = subirDesdeElNavegador }: Props) {
  const router = useRouter()
  const [cuentaId, setCuentaId] = useState(cuentas[0]?.id ?? "")
  const [pilarId, setPilarId] = useState("")
  const [formato, setFormato] = useState<"texto" | "carrusel_pdf">("texto")
  const [texto, setTexto] = useState("")
  const [titulo, setTitulo] = useState("")
  const [archivo, setArchivo] = useState<File | null>(null)
  // A retry after the server refused must not upload the same file again.
  const [subido, setSubido] = useState<{ archivo: File; ruta: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()
  const entradaDeArchivo = useRef<HTMLInputElement>(null)
  const largo = [...texto.replace(/\r\n/g, "\n")].length
  const marcaId = cuentas.find((c) => c.id === cuentaId)?.marcaId
  const pilaresDeLaCuenta = pilares.filter((p) => p.marcaId === marcaId)

  function elegirArchivo(elegido: File | null) {
    if (elegido && elegido.size > BYTES_MAXIMOS_DEL_CARRUSEL) {
      setArchivo(null)
      if (entradaDeArchivo.current) entradaDeArchivo.current.value = ""
      return setError(`El PDF pesa más de ${BYTES_MAXIMOS_DEL_CARRUSEL / MB} MB. Achícalo antes de subirlo.`)
    }
    setError(null)
    setArchivo(elegido)
  }

  function errorDeLosDatos(): string | null {
    if (!cuentas.some((c) => c.id === cuentaId)) return "Elige una cuenta."
    if (!texto.trim()) return "Falta el texto."
    if (largo > CARACTERES_MAXIMOS_DEL_TEXTO) {
      return `El texto pasa los ${CARACTERES_MAXIMOS_DEL_TEXTO} caracteres de LinkedIn.`
    }
    if (formato === "carrusel_pdf" && !titulo.trim()) return "Falta el título del carrusel."
    if (formato === "carrusel_pdf" && !archivo) return "Falta el PDF del carrusel."
    return null
  }

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    const malo = errorDeLosDatos()
    if (malo) return setError(malo)
    const cuenta = cuentas.find((c) => c.id === cuentaId)
    if (!cuenta) return
    setError(null)
    // The pillar key is always sent, null for none, so the action never mistakes a missing field for a choice.
    const pilar = pilaresDeLaCuenta.some((p) => p.id === pilarId) ? pilarId : null
    iniciar(async () => {
      let resultado: Resultado<{ piezaId: string }>
      if (formato === "texto") {
        resultado = await crear({ cuentaId, formato, texto, pilarId: pilar })
      } else {
        if (!archivo) return
        let archivoRuta = subido?.archivo === archivo ? subido.ruta : null
        if (!archivoRuta) {
          archivoRuta = await subir(cuenta.marcaId, archivo)
          if (!archivoRuta) return setError("No pude subir el PDF. Inténtalo de nuevo.")
          setSubido({ archivo, ruta: archivoRuta })
        }
        resultado = await crear({
          cuentaId,
          formato,
          texto,
          titulo,
          archivoRuta,
          archivoSha256: await sha256Hex(archivo),
          pilarId: pilar,
        })
      }
      if (resultado.ok) router.push(rutaDePieza(resultado.piezaId))
      else setError(resultado.error)
    })
  }

  if (cuentas.length === 0) return <p className="text-apagado">Primero agrega una cuenta en Marcas.</p>
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
              {c.nombre} · {c.marca}
            </option>
          ))}
        </select>
      </label>
      {pilaresDeLaCuenta.length > 0 && (
        <label className="block space-y-1">
          <span className="text-sm">Pilar</span>
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
      <fieldset className="space-y-1">
        <legend className="text-sm">Formato</legend>
        <label className={OPCION}>
          <input type="radio" name="formato" checked={formato === "texto"} onChange={() => setFormato("texto")} />
          Post de texto
        </label>
        <label className={OPCION}>
          <input
            type="radio"
            name="formato"
            checked={formato === "carrusel_pdf"}
            onChange={() => setFormato("carrusel_pdf")}
          />
          Carrusel PDF
        </label>
      </fieldset>
      {formato === "carrusel_pdf" && (
        <>
          <label className="block space-y-1">
            <span className="text-sm">Título del carrusel</span>
            <input
              required
              value={titulo}
              maxLength={100}
              onChange={(evento) => setTitulo(evento.target.value)}
              className={CAMPO}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm">PDF (hasta {BYTES_MAXIMOS_DEL_CARRUSEL / MB} MB)</span>
            <input
              ref={entradaDeArchivo}
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
          aria-live="off"
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
