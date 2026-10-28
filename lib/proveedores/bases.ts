import { FallaDeConfiguracion } from "@/lib/dominio/falla"

type Entorno = Record<string, string | undefined>

/**
 * A provider's API address. Local E2E can point it at a fake with an environment variable; a deployed app refuses the
 * override, because Federico's token would travel to that address.
 */
export function baseDe(entorno: Entorno, variable: string, porDefecto: string): string {
  const valor = entorno[variable]
  if (!valor) return porDefecto
  if (entorno.VERCEL || entorno.NODE_ENV === "production") {
    throw new FallaDeConfiguracion(
      `${variable} no puede estar definida en producción: las llaves irían a otra dirección.`,
    )
  }
  return valor.replace(/\/+$/, "")
}
