"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export const ESPERA_PARA_DESHACER_MS = 10_000

/** Holds an action for a few seconds so it can be undone; unmounting cancels it, so leaving never sends it. */
export function useAccionDiferida(espera = ESPERA_PARA_DESHACER_MS) {
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [esperando, setEsperando] = useState(false)

  const cancelar = useCallback(() => {
    if (temporizador.current) clearTimeout(temporizador.current)
    temporizador.current = null
    setEsperando(false)
  }, [])

  const programar = useCallback(
    (accion: () => void) => {
      cancelar()
      setEsperando(true)
      temporizador.current = setTimeout(() => {
        temporizador.current = null
        setEsperando(false)
        accion()
      }, espera)
    },
    [cancelar, espera],
  )

  useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current)
    },
    [],
  )

  return { esperando, programar, cancelar }
}
