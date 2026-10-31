"use client"

import { Loader2, Lock } from "lucide-react"
import { useEffect, useRef, useState, useTransition } from "react"
import type { Resultado } from "@/lib/marcas/acciones"
import { fechaLarga, instanteDesdeValorLocal, valorLocal } from "@/lib/piezas/fechas"
import { explicacionDeReserva } from "@/lib/piezas/textos"
import { FinDelTexto, useLectura } from "./lectura"

interface Props {
  piezaId: string
  huella: string
  texto: string
  fechaPropuesta: string
  /** When the server rendered the page: a signature is refused if an exception was marked after it. */
  abiertaEn: string
  ruta: "api" | "metricool" | "a_mano"
  cuenta: string
  firmar: (entrada: {
    piezaId: string
    huella: string
    programadaPara: string
    abiertaEn: string
  }) => Promise<Resultado>
  firmarParaReserva: (entrada: { piezaId: string; huella: string; abiertaEn: string }) => Promise<Resultado>
  /** A rewrite is open: signing now keeps this version and Claude's is dropped as obsolete. */
  reescribiendo?: boolean
  /** Pause between automatic attempts after the connection drops, in milliseconds. */
  esperaEntreIntentos?: number
}

/** Attempts made on a dropped connection before the person is asked to decide. */
const INTENTOS = 3
const ESPERA_ENTRE_INTENTOS = 3000

const esperar = (milisegundos: number) => new Promise<void>((resolver) => setTimeout(resolver, milisegundos))

export function FirmaDePieza({
  piezaId,
  huella,
  texto,
  fechaPropuesta,
  abiertaEn,
  ruta,
  cuenta,
  firmar,
  firmarParaReserva,
  reescribiendo = false,
  esperaEntreIntentos = ESPERA_ENTRE_INTENTOS,
}: Props) {
  const [fecha, setFecha] = useState(() => valorLocal(fechaPropuesta))
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()
  const [cual, setCual] = useState<"fecha" | "reserva">("fecha")
  const [intento, setIntento] = useState(1)
  const [sinRed, setSinRed] = useState(false)
  const avisoDeRed = useRef<HTMLDivElement>(null)
  const campoDeFecha = useRef<HTMLInputElement>(null)
  const lectura = useLectura()
  const bloqueada = pendiente || !lectura.puedeFirmar
  const instante = instanteDesdeValorLocal(fecha)

  useEffect(() => {
    if (sinRed) avisoDeRed.current?.focus()
  }, [sinRed])

  // A rejected call means the answer never arrived (the server answers refusals as a value), so only that is retried.
  async function conReintentos(accion: () => Promise<Resultado>): Promise<Resultado | null> {
    for (let n = 1; n <= INTENTOS; n++) {
      setIntento(n)
      try {
        return await accion()
      } catch {
        if (n < INTENTOS) await esperar(esperaEntreIntentos)
      }
    }
    return null
  }

  function lanzar(cualDeLas: "fecha" | "reserva") {
    if (cualDeLas === "fecha" && !instante) return setError("Elige la fecha y la hora.")
    setError(null)
    setSinRed(false)
    setCual(cualDeLas)
    iniciar(async () => {
      const resultado = await conReintentos(() =>
        cualDeLas === "fecha" && instante
          ? firmar({ piezaId, huella, programadaPara: instante, abiertaEn })
          : firmarParaReserva({ piezaId, huella, abiertaEn }),
      )
      if (resultado === null) setSinRed(true)
      else if (!resultado.ok) setError(resultado.error)
    })
  }

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    lanzar("fecha")
  }

  function volverALaPieza() {
    setSinRed(false)
    campoDeFecha.current?.focus()
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <p className="whitespace-pre-wrap rounded-lg border border-borde p-3">{texto}</p>
      <FinDelTexto />
      <label className="block space-y-1">
        <span className="text-sm">Fecha y hora de publicación</span>
        <input
          ref={campoDeFecha}
          type="datetime-local"
          value={fecha}
          onChange={(evento) => setFecha(evento.target.value)}
          className="w-full rounded-lg border border-borde bg-background px-3 py-3"
        />
      </label>
      {instante && (
        <p>
          Sale el <strong>{fechaLarga(instante)}</strong>
          <span className="block text-sm text-apagado">Hora de Chile.</span>
        </p>
      )}
      {reescribiendo && (
        <p className="text-sm">Claude está reescribiendo. Si firmas ahora, esa versión no se aplica.</p>
      )}
      {lectura.motivo && (
        <p id="motivo-de-lectura" className="flex items-start gap-2 text-sm">
          <Lock aria-hidden="true" strokeWidth={1.75} className="mt-0.5 size-4 flex-none" />
          {lectura.motivo}
        </p>
      )}
      <button
        type="submit"
        disabled={bloqueada}
        aria-busy={pendiente && cual === "fecha"}
        aria-describedby={lectura.motivo ? "motivo-de-lectura" : undefined}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primario px-4 font-medium text-primario-texto disabled:cursor-not-allowed disabled:border disabled:border-dashed disabled:border-control disabled:bg-borde disabled:text-foreground disabled:shadow-hundido"
      >
        {pendiente && cual === "fecha" ? (
          <Ocupado />
        ) : ruta === "a_mano" ? (
          "Firmar: te aviso a la hora para publicarla a mano"
        ) : (
          "Firmar y programar"
        )}
      </button>
      <button
        type="button"
        disabled={bloqueada}
        onClick={() => lanzar("reserva")}
        aria-busy={pendiente && cual === "reserva"}
        aria-describedby={lectura.motivo ? "explicacion-de-reserva motivo-de-lectura" : "explicacion-de-reserva"}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-borde px-4 font-medium disabled:cursor-not-allowed disabled:border-dashed disabled:border-control disabled:bg-borde disabled:shadow-hundido"
      >
        {pendiente && cual === "reserva" ? <Ocupado /> : "Firmar para la reserva"}
      </button>
      <p id="explicacion-de-reserva" className="text-sm text-apagado">
        {explicacionDeReserva(ruta, cuenta)}
      </p>
      <output aria-live="polite" className="sr-only">
        {pendiente ? (intento > 1 ? `Reintentando solo · ${intento} de ${INTENTOS}` : "Firmando…") : ""}
      </output>
      {error && (
        <p role="alert" className="text-sm text-peligro">
          {error}
        </p>
      )}
      {sinRed && (
        <div ref={avisoDeRed} role="alert" tabIndex={-1} className="space-y-3 rounded-lg border border-control p-3">
          <p className="font-medium">No se pudo guardar tu firma.</p>
          <p className="text-sm">
            Todavía no se publicó nada y tu texto está intacto.
            {cual === "fecha" &&
              instante &&
              ` Si la conexión no vuelve antes del ${fechaLarga(instante)}, la pieza no sale y vuelve a pedirte la firma.`}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => lanzar(cual)}
              className="min-h-11 flex-1 rounded-lg bg-primario px-4 font-medium text-primario-texto"
            >
              Reintentar ahora
            </button>
            <button
              type="button"
              onClick={volverALaPieza}
              className="min-h-11 flex-1 rounded-lg border border-borde px-4 font-medium"
            >
              Volver a la pieza
            </button>
          </div>
        </div>
      )}
    </form>
  )
}

function Ocupado() {
  return (
    <>
      <Loader2 aria-hidden="true" strokeWidth={1.75} className="size-4 animate-spin motion-reduce:animate-none" />
      Firmando…
    </>
  )
}
