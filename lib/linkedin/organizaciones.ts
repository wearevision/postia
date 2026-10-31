import { z } from "zod"
import { baseDe } from "@/lib/proveedores/bases"
import { cabeceras, llamar } from "./api"

// Organization Access Control by Role and Organization Lookup, li-lms-2026-10 (checked on learn.microsoft.com on
// 2026-10-31). Both need rw_organization_admin; the lookup of an administered page answers 403 to anyone else.
const BASE_API = "https://api.linkedin.com"
const MAXIMO_DE_PAGINAS = 50
const URN_DE_ORGANIZACION = /^urn:li:organization:([0-9]+)$/

const base = () => baseDe(process.env, "LINKEDIN_API_BASE_URL", BASE_API)

const Roles = z.object({
  elements: z.array(
    z.object({
      role: z.string().optional(),
      state: z.string().optional(),
      organization: z.string().optional(),
      // Older examples name the field organizationTarget.
      organizationTarget: z.string().optional(),
    }),
  ),
})

/** The pages where the token's member is an approved ADMINISTRATOR, the only role allowed to upload a page's PDF. */
export async function paginasQueAdministra(entrada: { token: string }): Promise<string[]> {
  const consulta = new URLSearchParams({
    q: "roleAssignee",
    role: "ADMINISTRATOR",
    state: "APPROVED",
    count: String(MAXIMO_DE_PAGINAS),
  })
  const respuesta = await llamar(
    `${base()}/rest/organizationAcls?${consulta.toString()}`,
    { method: "GET", headers: cabeceras(entrada.token) },
    "organizationAcls",
    entrada.token,
  )
  const leida = Roles.safeParse(await respuesta.json())
  if (!leida.success) throw new Error("LinkedIn devolvió una respuesta inesperada en organizationAcls.")
  // The filters are in the query; they are checked again so a looser answer never links the wrong page.
  const urns = leida.data.elements
    .filter((fila) => fila.role === "ADMINISTRATOR" && fila.state === "APPROVED")
    .map((fila) => fila.organization ?? fila.organizationTarget ?? "")
    .filter((urn) => URN_DE_ORGANIZACION.test(urn))
  return [...new Set(urns)]
}

/** The page's name, for the connect screen only: organization data may be kept 8 weeks, so PostIA never stores it. */
export async function nombreDePagina(entrada: { token: string; organizacion: string }): Promise<string> {
  const id = URN_DE_ORGANIZACION.exec(entrada.organizacion)?.[1]
  if (!id) throw new Error("La página debe ser un urn:li:organization con su número.")
  const respuesta = await llamar(
    `${base()}/rest/organizations/${id}`,
    { method: "GET", headers: cabeceras(entrada.token) },
    "la consulta de la página",
    entrada.token,
  )
  const leida = z.object({ localizedName: z.string().trim().min(1) }).safeParse(await respuesta.json())
  if (!leida.success) throw new Error("LinkedIn devolvió una respuesta inesperada al consultar la página.")
  return leida.data.localizedName
}
