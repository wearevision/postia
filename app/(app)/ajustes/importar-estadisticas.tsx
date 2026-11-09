"use client"

import { useState, useTransition } from "react"
import type { Resultado } from "@/lib/marcas/acciones"
import type { ResultadoDeImportacion } from "@/lib/rendimiento/acciones"
import type { Exportacion } from "@/lib/rendimiento/exportacion"
import { leerArchivosDeLinkedin } from "@/lib/rendimiento/lector"

type Entrada = { cuentaId: string; exportacion: Exportacion; confirmado?: true }

export function ImportarEstadisticas({
  cuentas,
  leer = leerArchivosDeLinkedin,
  importar,
}: {
  cuentas: readonly { id: string; nombre: string }[]
  /** The browser reader; a server page cannot pass it, so it is the default and tests replace it. */
  leer?: (archivos: File[]) => Promise<Resultado<Exportacion>>
  importar: (entrada: Entrada) => Promise<ResultadoDeImportacion>
}) {
  const [cuentaId, setCuentaId] = useState(cuentas[0]?.id ?? "")
  const [archivos, setArchivos] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState<string | null>(null)
  const [pendienteDeConfirmar, setPendienteDeConfirmar] = useState<Entrada | null>(null)
  const [pendiente, iniciar] = useTransition()

  function enviar(entrada: Entrada) {
    iniciar(async () => {
      const r = await importar(entrada)
      if (r.ok) {
        setPendienteDeConfirmar(null)
        setListo(`Listo: ${r.publicaciones} publicaciones, ${r.dePostia} de PostIA y ${r.anteriores} anteriores.`)
        return
      }
      setError(r.error)
      setPendienteDeConfirmar(r.confirmar ? { ...entrada, confirmado: true } : null)
    })
  }

  function importarArchivo(evento: React.FormEvent) {
    evento.preventDefault()
    setError(null)
    setListo(null)
    if (archivos.length === 0) return setError("Elige el archivo que descargaste de LinkedIn.")
    iniciar(async () => {
      const leido = await leer(archivos)
      if (!leido.ok) return setError(leido.error)
      const { ok: _, ...exportacion } = leido
      enviar({ cuentaId, exportacion })
    })
  }

  if (cuentas.length === 0) return null
  return (
    <form onSubmit={importarArchivo} className="space-y-3 tarjeta p-4">
      <h2 className="font-medium">Importar estadísticas</h2>
      <p className="text-sm text-apagado">
        En LinkedIn, abre Analytics de tu perfil y exporta el último año. Sube aquí ese archivo.
      </p>
      {cuentas.length > 1 && (
        <label className="block space-y-1 text-sm">
          <span>Cuenta</span>
          <select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} className="campo w-full">
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block space-y-1 text-sm">
        <span>Archivo de LinkedIn</span>
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => setArchivos([...(e.target.files ?? [])])}
          className="block w-full"
        />
      </label>
      <button type="submit" disabled={pendiente} className="boton w-full py-3">
        Importar
      </button>
      {error && (
        <p role="alert" className="text-sm text-peligro">
          {error}
        </p>
      )}
      {pendienteDeConfirmar && (
        <button
          type="button"
          disabled={pendiente}
          onClick={() => enviar(pendienteDeConfirmar)}
          className="boton w-full py-3"
        >
          Importar igual
        </button>
      )}
      {listo && <output className="block text-sm">{listo}</output>}
    </form>
  )
}
