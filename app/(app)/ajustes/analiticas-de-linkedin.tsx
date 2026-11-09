import { estadoDeAnaliticas } from "@/lib/marcas/estado-analiticas"

interface Props {
  cuentaId: string
  conexion: { expira_en: string } | null
  ahora: number
}

// Reading the figures of the profile's own posts: «Estudio WAV» (r_member_postAnalytics), apart from publishing.
export function AnaliticasDeLinkedin({ cuentaId, conexion, ahora }: Props) {
  const { texto, boton } = estadoDeAnaliticas(conexion, ahora)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-sm text-apagado">{texto}</p>
      {boton && (
        // A route handler that redirects to LinkedIn: a plain anchor so it is never prefetched.
        <a
          href={`/api/linkedin/pagina/conectar?cuenta=${cuentaId}&proposito=analiticas`}
          className="boton px-3 text-sm"
        >
          {boton}
        </a>
      )}
    </div>
  )
}
