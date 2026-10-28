import { FallaDeConfiguracion } from "@/lib/dominio/falla"

/**
 * A required environment value. The caller passes the value, not the name to look up, so `NEXT_PUBLIC_*` reads stay
 * literal (`process.env.NEXT_PUBLIC_X`) and Next can inline them into the browser bundle.
 */
export function exigirEnv(nombre: string, valor: string | undefined): string {
  const limpio = valor?.trim()
  if (!limpio) throw new FallaDeConfiguracion(`Falta la variable de entorno ${nombre}.`)
  return limpio
}
