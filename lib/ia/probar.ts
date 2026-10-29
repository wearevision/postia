import type { PedidoAClaude, RespuestaDeClaude } from "./claude"

type Pedir = (
  paso: { clave: string; paso: string; marcaId: string | null },
  pedido: PedidoAClaude,
) => Promise<RespuestaDeClaude>

/** Production check of key, ledger and cap: about US$0.02, only when Federico types GASTAR in the payload. */
export async function probarClaude(
  carga: { confirmacion?: string },
  runId: string,
  pedir: Pedir,
): Promise<{ hecho: false } | { hecho: true; texto: string }> {
  if (carga.confirmacion !== "GASTAR") return { hecho: false }
  const respuesta = await pedir(
    { clave: `probar-claude:${runId}`, paso: "probar", marcaId: null },
    {
      sistema: "Respondes en español, en una palabra.",
      mensajes: [{ role: "user", content: "Responde solo: listo" }],
      maxTokens: 1024,
      esfuerzo: "low",
    },
  )
  return { hecho: true, texto: respuesta.texto }
}
