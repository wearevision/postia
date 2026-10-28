import { parseArgs } from "node:util"
import { invitar } from "@/lib/equipo/invitar"
import { createAdminClient } from "@/lib/supabase/admin"

async function main() {
  const { values } = parseArgs({
    options: { correo: { type: "string" }, marca: { type: "string" }, voz: { type: "string" } },
  })
  const { correo, marca, voz } = values
  if (!correo || !marca || (voz !== "yo" && voz !== "nosotros")) {
    console.error("Uso: pnpm invitar --correo <correo> --marca <nombre> --voz yo|nosotros")
    process.exitCode = 1
    return
  }
  await invitar(createAdminClient(), { correo, marca, voz })
  console.log(`Listo: ${correo} es dueño de «${marca}».`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
