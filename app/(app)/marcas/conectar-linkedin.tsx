interface Props {
  cuentaId: string
  tipo: string
  conectada: boolean
}

// A profile connects through «Estudio WAV Perfil»; a page through «Estudio WAV» (Community Management).
export function ConectarLinkedin({ cuentaId, tipo, conectada }: Props) {
  const pagina = tipo === "empresa"
  const ruta = pagina ? "/api/linkedin/pagina/conectar" : "/api/linkedin/conectar"
  const texto = pagina
    ? conectada
      ? "Renovar página"
      : "Conectar página de LinkedIn"
    : conectada
      ? "Renovar LinkedIn"
      : "Conectar LinkedIn"
  return (
    // A route handler that redirects to LinkedIn: a plain anchor so it is never prefetched (each prefetch began an OAuth flow).
    <a href={`${ruta}?cuenta=${cuentaId}`} className="boton px-3 text-sm">
      {texto}
    </a>
  )
}
