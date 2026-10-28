import type { EstadoDeConexion } from "@/lib/marcas/estado-conexion"

const dias = (n: number) => `${n} ${n === 1 ? "día" : "días"}`

function texto(estado: EstadoDeConexion): string {
  switch (estado.estado) {
    case "sin_conexion":
      return "Sin conectar"
    case "vencida":
      return "Vencida · vuelve a conectar"
    case "por_vencer":
      return `Vence en ${dias(estado.dias)} · renuévala`
    case "conectada":
      return `Conectada · vence en ${dias(estado.dias)}`
  }
}

export function EstadoDeConexionChip({ estado }: { estado: EstadoDeConexion }) {
  const alerta = estado.estado === "vencida" || estado.estado === "por_vencer"
  return (
    <span
      className={`rounded-full border px-2 py-1 text-xs ${alerta ? "border-peligro text-peligro" : "border-borde text-apagado"}`}
    >
      {texto(estado)}
    </span>
  )
}
