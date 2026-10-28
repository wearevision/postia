"use client"

import { useEffect, useState, useTransition } from "react"
import { type EstadoDeAvisos, estadoDeAvisos } from "@/lib/avisos/dispositivo"
import { type PuertoDeAvisos, puertoDelNavegador } from "@/lib/avisos/navegador"
import type { SuscripcionDelNavegador } from "@/lib/avisos/tipos"

interface Props {
  claveVapid: string | null
  guardar: (suscripcion: SuscripcionDelNavegador) => Promise<{ ok: true } | { ok: false; error: string }>
  probar: () => Promise<string>
  puerto?: PuertoDeAvisos
}

const BOTON = "min-h-11 w-full rounded-lg bg-primario px-4 font-medium text-primario-texto disabled:opacity-60"

export function AvisosDelCelular({ claveVapid, guardar, probar, puerto }: Props) {
  const [aparato] = useState(() => puerto ?? puertoDelNavegador())
  const [estado, setEstado] = useState<EstadoDeAvisos | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()

  useEffect(() => {
    aparato.leer().then((datos) => setEstado(estadoDeAvisos({ ...datos, configurado: claveVapid !== null })))
  }, [aparato, claveVapid])

  function activar() {
    if (!claveVapid) return
    iniciar(async () => {
      const resultado = await aparato.activar(claveVapid)
      if (resultado.estado === "denegada") return setEstado("denegado")
      const guardado = await guardar(resultado.suscripcion)
      if (!guardado.ok) return setMensaje(guardado.error)
      setEstado("activo")
    })
  }

  if (estado === null) return null
  return (
    <section className="space-y-3 rounded-lg border border-borde p-4">
      <h2 className="font-medium">Avisos en tu celular</h2>
      {estado === "instalar" && (
        <p className="text-sm">
          En Safari toca Compartir y luego «Agregar a inicio». Abre PostIA desde ahí y vuelve a esta pantalla.
        </p>
      )}
      {estado === "no_disponible" && <p className="text-sm text-apagado">Este navegador no puede recibir avisos.</p>}
      {estado === "denegado" && (
        <p className="text-sm">Bloqueaste los avisos. Actívalos en Ajustes del iPhone › Notificaciones › PostIA.</p>
      )}
      {estado === "listo" && (
        <button type="button" onClick={activar} disabled={pendiente} className={BOTON}>
          Activar avisos
        </button>
      )}
      {estado === "activo" && (
        <button
          type="button"
          onClick={() => iniciar(async () => setMensaje(await probar()))}
          disabled={pendiente}
          className={BOTON}
        >
          Mandar aviso de prueba
        </button>
      )}
      {mensaje && <output className="block text-sm">{mensaje}</output>}
    </section>
  )
}
