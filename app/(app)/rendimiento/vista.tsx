import Link from "next/link"
import { periodoLegible } from "@/lib/rendimiento/formato"
import type { AprendizajesDeCuenta, CuentaConRendimiento, RendimientoDeCuenta } from "@/lib/rendimiento/lectura"
import { RUTA_DE_AJUSTES, rutaDeRendimiento } from "@/lib/sesion/rutas"
import { type AccionesDeAprendizajes, Aprendizajes } from "./aprendizajes"
import { Publicaciones } from "./publicaciones"
import { Publico } from "./publico"
import { Tendencia } from "./tendencia"

const NUMERO = new Intl.NumberFormat("es-CL")

export function VistaDeRendimiento({
  cuentas,
  cuentaId,
  datos,
  aprendizajes,
  acciones,
}: {
  cuentas: CuentaConRendimiento[]
  cuentaId: string
  datos: RendimientoDeCuenta
  aprendizajes: AprendizajesDeCuenta
  acciones: AccionesDeAprendizajes
}) {
  const sinDatos = datos.publicaciones.length === 0 && datos.meses.length === 0 && datos.publico.length === 0
  const importacion = datos.ultimaImportacion
  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-semibold">Rendimiento</h1>
      {cuentas.length > 1 && (
        <nav aria-label="Cuenta" className="flex flex-wrap gap-2">
          {cuentas.map((c) => (
            <Link
              key={c.id}
              href={rutaDeRendimiento(c.id)}
              aria-current={c.id === cuentaId ? "page" : undefined}
              className="boton rounded-full text-sm text-apagado aria-[current=page]:font-semibold aria-[current=page]:text-primario aria-[current=page]:shadow-hundido"
            >
              {c.nombre}
            </Link>
          ))}
        </nav>
      )}
      {sinDatos ? (
        <div className="space-y-3">
          <p className="text-apagado">Todavía no hay estadísticas de esta cuenta.</p>
          <Link href={RUTA_DE_AJUSTES} className="boton w-full py-3">
            Importar estadísticas
          </Link>
        </div>
      ) : (
        <>
          <header className="space-y-1 text-sm">
            {importacion && <p>Datos del {periodoLegible(importacion.desde, importacion.hasta)}</p>}
            {datos.seguidoresTotal !== null && (
              <p className="text-apagado">{NUMERO.format(datos.seguidoresTotal)} seguidores</p>
            )}
          </header>
          {datos.muestraChica && (
            <output className="block tarjeta p-3 text-sm">
              Todavía son pocas publicaciones con interacciones para sacar conclusiones.
            </output>
          )}
          <Aprendizajes key={cuentaId} cuentaId={cuentaId} datos={aprendizajes} acciones={acciones} />
          {datos.publicaciones.length > 0 && <Publicaciones publicaciones={datos.publicaciones} />}
          <Tendencia meses={datos.meses} />
          <Publico filas={datos.publico} />
        </>
      )}
    </div>
  )
}
