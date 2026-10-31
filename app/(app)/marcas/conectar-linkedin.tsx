import Link from "next/link"

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
    <Link
      href={`${ruta}?cuenta=${cuentaId}`}
      className="inline-flex min-h-11 items-center rounded-lg border border-borde px-3 text-sm"
    >
      {texto}
    </Link>
  )
}
