import Link from "next/link"
import { notFound } from "next/navigation"
import { fechaLarga } from "@/lib/piezas/fechas"
import { RUTA_DE_VOZ, rutaDeVoz } from "@/lib/sesion/rutas"
import { createClient } from "@/lib/supabase/server"
import { lineaDeMarca } from "@/lib/voz/lectura"
import { NOMBRE_DE_SECCION, SECCIONES, type SeccionesDeLinea } from "@/lib/voz/linea"
import { guardarLineaAccion } from "./acciones"
import { EditorDeLinea } from "./editor"

const VACIA: SeccionesDeLinea = {
  deQueHablamos: "",
  tono: "",
  formatos: "",
  temasVetados: "",
  temasAVigilar: "",
  ejemplos: "",
}

export default async function LineaDeMarca({
  params,
  searchParams,
}: {
  params: Promise<{ marcaId: string }>
  searchParams: Promise<{ version?: string | string[] }>
}) {
  const { marcaId } = await params
  const { version } = await searchParams
  // lineaDeMarca falls back to the current version for anything that is not one of its versions.
  const pedida = typeof version === "string" ? Number(version) : undefined
  const linea = await lineaDeMarca(await createClient(), marcaId, pedida)
  if (!linea) notFound()
  const { marca, actual, vigente, historial } = linea

  return (
    <section className="mx-auto max-w-md space-y-5">
      <header className="space-y-1">
        <Link href={RUTA_DE_VOZ} className="inline-block min-h-11 py-3 text-sm text-apagado underline">
          Voz y línea editorial
        </Link>
        <h1 className="text-2xl font-semibold">{marca.nombre}</h1>
        <p className="text-apagado">
          Habla como «{marca.voz}». {vigente ? `Versión vigente: ${vigente}.` : "Todavía no tiene línea editorial."}
        </p>
      </header>

      {actual !== null && actual.version < vigente ? (
        <div className="space-y-4">
          <p>
            Estás viendo la versión {actual.version}, del {fechaLarga(actual.creadaEn)}. Es solo para leer.{" "}
            <Link href={rutaDeVoz(marca.id)} className="underline">
              Volver a la vigente
            </Link>
          </p>
          {SECCIONES.map((s) => (
            <div key={s} className="space-y-1">
              <h2 className="text-sm font-medium">{NOMBRE_DE_SECCION[s]}</h2>
              <p className="whitespace-pre-wrap tarjeta p-3 text-sm">{actual.secciones[s] || "Vacía."}</p>
            </div>
          ))}
          <h2 className="text-sm font-medium">Pilares</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {actual.pilares.map((p) => (
              <li key={p.id ?? p.nombre}>
                {p.nombre} ·{" "}
                {p.porSemana === 0.5 ? "1 cada dos semanas" : `${p.porSemana.toLocaleString("es-CL")} por semana`}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <EditorDeLinea
          // Not the version: a remount would drop «Guardada como versión N.» when the save revalidates the page.
          key={marca.id}
          marcaId={marca.id}
          base={vigente}
          secciones={actual?.secciones ?? VACIA}
          pilares={actual?.pilares ?? []}
          guardar={guardarLineaAccion}
        />
      )}

      {historial.length > 1 && (
        <nav aria-label="Versiones" className="space-y-2">
          <h2 className="text-sm font-medium">Versiones anteriores</h2>
          <ul className="text-sm">
            {historial.slice(1).map((h) => (
              <li key={h.version}>
                <Link href={rutaDeVoz(marca.id, h.version)} className="block min-h-11 py-3 underline">
                  Versión {h.version} · {fechaLarga(h.creadaEn)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </section>
  )
}
