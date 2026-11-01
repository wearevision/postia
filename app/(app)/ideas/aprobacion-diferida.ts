"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export const ESPERA_PARA_DESHACER_MS = 10_000

/**
 * Holds an action for a few seconds so it can be undone; unmounting cancels it, so leaving never sends it.
 * `restante` counts the whole seconds left (null when nothing is held) so the screen can tick down.
 */
export function useAccionDiferida(espera = ESPERA_PARA_DESHACER_MS) {
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cuenta = useRef<ReturnType<typeof setInterval> | null>(null)
  const [restante, setRestante] = useState<number | null>(null)

  const detener = useCallback(() => {
    if (temporizador.current) clearTimeout(temporizador.current)
    if (cuenta.current) clearInterval(cuenta.current)
    temporizador.current = null
    cuenta.current = null
  }, [])

  const cancelar = useCallback(() => {
    detener()
    setRestante(null)
  }, [detener])

  const programar = useCallback(
    (accion: () => void) => {
      detener()
      setRestante(Math.ceil(espera / 1000))
      cuenta.current = setInterval(() => setRestante((s) => (s === null || s <= 1 ? s : s - 1)), 1000)
      temporizador.current = setTimeout(() => {
        detener()
        setRestante(null)
        accion()
      }, espera)
    },
    [detener, espera],
  )

  // An iPhone PWA freezes JS in the background without unmounting: the expired timer would fire on return and
  // approve with no countdown on screen, so leaving the app cancels.
  useEffect(() => {
    const alSalir = () => {
      if (document.visibilityState === "hidden") cancelar()
    }
    document.addEventListener("visibilitychange", alSalir)
    window.addEventListener("pagehide", cancelar)
    return () => {
      document.removeEventListener("visibilitychange", alSalir)
      window.removeEventListener("pagehide", cancelar)
      detener()
    }
  }, [cancelar, detener])

  return { esperando: restante !== null, restante, programar, cancelar }
}
