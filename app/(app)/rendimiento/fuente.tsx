"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import type { Resultado } from "@/lib/marcas/acciones"
import type { FuenteDeCifras } from "@/lib/rendimiento/formato"
import type { AnaliticasDeCuenta } from "@/lib/rendimiento/lectura"
import { RUTA_DE_AJUSTES } from "@/lib/sesion/rutas"

export function FuenteDeLasCifras({
  cuentaId,
  analiticas,
  fuente,
  actualizar,
}: {
  cuentaId: string
  analiticas: AnaliticasDeCuenta
  fuente: FuenteDeCifras
  actualizar: (cuentaId: string) => Promise<Resultado>
}) {
  const [aviso, setAviso] = useState<Resultado | null>(null)
  const [pendiente, iniciar] = useTransition()
  const { conectada, esDueno, leyendo, ultimoFallo, tipo } = analiticas

  function pedir() {
    setAviso(null)
    iniciar(async () => setAviso(await actualizar(cuentaId)))
  }

  return (
    <div className="space-y-1 text-sm">
      {fuente.api && <p>{fuente.api}</p>}
      {fuente.importacion && <p>{fuente.importacion}</p>}
      {fuente.nota && <p className="text-apagado">{fuente.nota}</p>}
      {!conectada && tipo === "persona" && (
        <Link href={RUTA_DE_AJUSTES} className="inline-block min-h-11 py-3 text-apagado underline">
          Para leer las analíticas de tu perfil, renueva la página de WAV en Ajustes
        </Link>
      )}
      {conectada && leyendo && <output className="block text-apagado">Leyendo LinkedIn…</output>}
      {conectada && !leyendo && ultimoFallo && (
        <p className="text-peligro">La última lectura de LinkedIn no salió: {ultimoFallo}</p>
      )}
      {conectada && esDueno && (
        <div className="space-y-1 pt-1">
          <button type="button" disabled={leyendo || pendiente} onClick={pedir} className="boton w-full py-3">
            Actualizar desde LinkedIn
          </button>
          {aviso?.ok === true && !leyendo && (
            <output className="block text-apagado">Listo. Las cifras llegan en unos minutos.</output>
          )}
          {aviso?.ok === false && (
            <p role="alert" className="text-peligro">
              {aviso.error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
