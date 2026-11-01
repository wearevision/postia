"use client"

import { Loader2, Lock } from "lucide-react"
import { useEffect, useRef, useState, useTransition } from "react"
import type { Resultado } from "@/lib/marcas/acciones"
import { FECHA_EN_EL_PASADO, fechaCorta, fechaLarga, instanteDesdeValorLocal, valorLocal } from "@/lib/piezas/fechas"
import { explicacionDeReserva } from "@/lib/piezas/textos"
import { useLectura } from "./lectura"

interface Props {
  piezaId: string
  huella: string
  /** The date it signs for: the planned date while it is still valid, else the next free slot. */
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
  /** Moves the planned date; the page then re-renders with the new fechaPropuesta and remounts this form. */
  planear: (entrada: { piezaId: string; planeadaPara: string }) => Promise<Resultado>
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
  fechaPropuesta,
  abiertaEn,
  ruta,
  cuenta,
  firmar,
  firmarParaReserva,
  planear,
  reescribiendo = false,
  esperaEntreIntentos = ESPERA_ENTRE_INTENTOS,
}: Props) {
  const [cambiando, setCambiando] = useState(false)
  const [fecha, setFecha] = useState(() => valorLocal(fechaPropuesta))
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()
  const [guardando, iniciarGuardado] = useTransition()
  const [cual, setCual] = useState<"fecha" | "reserva">("fecha")
  const [intento, setIntento] = useState(1)
  const [sinRed, setSinRed] = useState(false)
  const avisoDeRed = useRef<HTMLDivElement>(null)
  const campoDeFecha = useRef<HTMLInputElement>(null)
  // A saved signature keeps the button busy: the page swaps this form for the signed view when it re-renders.
  const [firmada, setFirmada] = useState(false)
  const ocupada = pendiente || firmada
  const lectura = useLectura()
  const bloqueada = ocupada || !lectura.puedeFirmar
  // Signing for a date needs the date it shows: an edited date not saved yet, or being saved, is not that date.
  const fechaSinGuardar = guardando || (cambiando && fecha !== valorLocal(fechaPropuesta))
  const motivos = [lectura.motivo && "motivo-de-lectura", fechaSinGuardar && "motivo-de-fecha"].filter(Boolean)
  const [enfocarFecha, setEnfocarFecha] = useState(false)

  useEffect(() => {
    if (sinRed) avisoDeRed.current?.focus()
  }, [sinRed])

  useEffect(() => {
    if (!enfocarFecha) return
    campoDeFecha.current?.focus()
    setEnfocarFecha(false)
  }, [enfocarFecha])

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
    setError(null)
    setSinRed(false)
    setCual(cualDeLas)
    iniciar(async () => {
      const resultado = await conReintentos(() =>
        cualDeLas === "fecha"
          ? firmar({ piezaId, huella, programadaPara: fechaPropuesta, abiertaEn })
          : firmarParaReserva({ piezaId, huella, abiertaEn }),
      )
      if (resultado === null) setSinRed(true)
      else if (resultado.ok) setFirmada(true)
      else {
        setError(resultado.error)
        if (resultado.error === FECHA_EN_EL_PASADO) {
          setCambiando(true)
          setEnfocarFecha(true)
        }
      }
    })
  }

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    if (fechaSinGuardar) return
    lanzar("fecha")
  }

  function cancelarFecha() {
    setCambiando(false)
    setFecha(valorLocal(fechaPropuesta))
    setError(null)
  }

  function guardarFecha() {
    const nueva = instanteDesdeValorLocal(fecha)
    if (!nueva) return setError("Elige la fecha y la hora.")
    setError(null)
    iniciarGuardado(async () => {
      const resultado = await planear({ piezaId, planeadaPara: nueva })
      if (!resultado.ok) setError(resultado.error)
    })
  }

  function volverALaPieza() {
    setSinRed(false)
    setCambiando(true)
    setEnfocarFecha(true)
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <section className="space-y-2">
        <p>
          Sale el <strong>{fechaLarga(fechaPropuesta)}</strong>
          <span className="block text-sm text-apagado">Hora de Chile.</span>
        </p>
        {cambiando ? (
          <div className="space-y-2">
            <label className="block space-y-1">
              <span className="text-sm">Fecha y hora de publicación</span>
              <input
                ref={campoDeFecha}
                type="datetime-local"
                value={fecha}
                onChange={(evento) => setFecha(evento.target.value)}
                onKeyDown={(evento) => {
                  // Enter would submit the form and sign for the old date: it saves the new one instead.
                  if (evento.key !== "Enter") return
                  evento.preventDefault()
                  guardarFecha()
                }}
                className="campo block min-h-12 w-full min-w-0 max-w-full appearance-none"
              />
            </label>
            <div className="flex gap-2">
              <button type="button" disabled={guardando} onClick={guardarFecha} className="boton flex-1">
                Guardar fecha
              </button>
              <button type="button" disabled={guardando} onClick={cancelarFecha} className="boton flex-1">
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setCambiando(true)} className="min-h-11 text-sm underline">
            Cambiar fecha
          </button>
        )}
      </section>
      {reescribiendo && (
        <p className="text-sm">Claude está reescribiendo. Si firmas ahora, esa versión no se aplica.</p>
      )}
      {lectura.motivo && (
        <p id="motivo-de-lectura" className="flex items-start gap-2 text-sm">
          <Lock aria-hidden="true" strokeWidth={1.75} className="mt-0.5 size-4 flex-none" />
          {lectura.motivo}
        </p>
      )}
      {fechaSinGuardar && (
        <p id="motivo-de-fecha" className="flex items-start gap-2 text-sm">
          <Lock aria-hidden="true" strokeWidth={1.75} className="mt-0.5 size-4 flex-none" />
          Guarda la fecha antes de firmar.
        </p>
      )}
      <button
        type="submit"
        disabled={bloqueada || fechaSinGuardar}
        aria-busy={ocupada && cual === "fecha"}
        aria-describedby={motivos.length > 0 ? motivos.join(" ") : undefined}
        className="boton-primario w-full gap-2"
      >
        {ocupada && cual === "fecha" ? <Ocupado /> : `Firmar para el ${fechaCorta(fechaPropuesta)}`}
      </button>
      {ruta === "a_mano" && <p className="text-sm text-apagado">Te aviso a la hora para publicarla a mano.</p>}
      <div className="space-y-1">
        <button
          type="button"
          disabled={bloqueada}
          onClick={() => lanzar("reserva")}
          aria-busy={ocupada && cual === "reserva"}
          aria-describedby={lectura.motivo ? "explicacion-de-reserva motivo-de-lectura" : "explicacion-de-reserva"}
          className="inline-flex min-h-11 items-center gap-2 font-medium underline disabled:cursor-not-allowed disabled:text-apagado disabled:no-underline"
        >
          {ocupada && cual === "reserva" ? <Ocupado /> : "Guardar en la reserva, sin fecha"}
        </button>
        <p id="explicacion-de-reserva" className="text-sm text-apagado">
          {explicacionDeReserva(ruta, cuenta)}
        </p>
      </div>
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
              ` Si la conexión no vuelve antes del ${fechaLarga(fechaPropuesta)}, la pieza no sale y vuelve a pedirte la firma.`}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => lanzar(cual)} className="boton-primario flex-1">
              Reintentar ahora
            </button>
            <button type="button" onClick={volverALaPieza} className="boton flex-1">
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
