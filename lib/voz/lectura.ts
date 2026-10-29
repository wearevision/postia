import { z } from "zod"
import { leerEstado } from "@/lib/piezas/lectura"
import type { Db } from "@/lib/supabase/database"
import { type Balance, balanceDePilares, DIAS_DE_LECTURA, DIAS_PLANEADOS } from "./balance"
import type { PilarDeLinea, SeccionesDeLinea } from "./linea"

const DIA_MS = 86_400_000

export interface VersionDeLinea {
  version: number
  creadaEn: string
  secciones: SeccionesDeLinea
  pilares: PilarDeLinea[]
}

export interface LineaDeMarca {
  marca: { id: string; nombre: string; voz: "yo" | "nosotros" }
  /** The version shown: the current one unless an older one was asked for. Null before the first save. */
  actual: VersionDeLinea | null
  vigente: number
  historial: { version: number; creadaEn: string }[]
}

const FotoDePilares = z.array(
  z.object({
    id: z.uuid(),
    nombre: z.string(),
    deQueHabla: z.string(),
    material: z.string(),
    porSemana: z.number(),
  }),
)

function fallo(accion: string, error: { message: string }): never {
  throw new Error(`${accion}: ${error.message}`, { cause: error })
}

export async function lineaDeMarca(db: Db, marcaId: string, version?: number): Promise<LineaDeMarca | null> {
  if (!z.uuid().safeParse(marcaId).success) return null
  const [marca, versiones] = await Promise.all([
    db.from("marcas").select("id, nombre, voz").eq("id", marcaId).maybeSingle(),
    db
      .from("lineas_editoriales")
      .select("version, creada_en")
      .eq("marca_id", marcaId)
      .order("version", { ascending: false }),
  ])
  if (marca.error) fallo("No pude leer la marca", marca.error)
  if (versiones.error) fallo("No pude leer las versiones de la línea", versiones.error)
  if (!marca.data) return null
  const vigente = versiones.data[0]?.version ?? 0
  const pedida =
    version !== undefined && Number.isInteger(version) && version >= 1 && version <= vigente ? version : vigente
  let actual: VersionDeLinea | null = null
  if (pedida > 0) {
    const { data, error } = await db
      .from("lineas_editoriales")
      .select("*")
      .eq("marca_id", marcaId)
      .eq("version", pedida)
      .single()
    if (error) fallo("No pude leer la línea editorial", error)
    actual = {
      version: data.version,
      creadaEn: data.creada_en,
      secciones: {
        deQueHablamos: data.de_que_hablamos,
        tono: data.tono,
        formatos: data.formatos,
        temasVetados: data.temas_vetados,
        temasAVigilar: data.temas_a_vigilar,
        ejemplos: data.ejemplos,
      },
      pilares: FotoDePilares.parse(data.pilares),
    }
  }
  return {
    marca: { id: marca.data.id, nombre: marca.data.nombre, voz: marca.data.voz === "nosotros" ? "nosotros" : "yo" },
    actual,
    vigente,
    historial: versiones.data.map((v) => ({ version: v.version, creadaEn: v.creada_en })),
  }
}

export async function marcasConLinea(db: Db): Promise<{ id: string; nombre: string; version: number }[]> {
  const [marcas, lineas] = await Promise.all([
    db.from("marcas").select("id, nombre").order("nombre"),
    db.from("lineas_editoriales").select("marca_id, version"),
  ])
  if (marcas.error) fallo("No pude leer las marcas", marcas.error)
  if (lineas.error) fallo("No pude leer las líneas editoriales", lineas.error)
  return marcas.data.map((m) => ({
    id: m.id,
    nombre: m.nombre,
    version: Math.max(0, ...lineas.data.filter((l) => l.marca_id === m.id).map((l) => l.version)),
  }))
}

export async function pilaresActivos(db: Db): Promise<{ id: string; marcaId: string; nombre: string }[]> {
  const { data, error } = await db.from("pilares").select("id, marca_id, nombre").eq("activo", true).order("orden")
  if (error) fallo("No pude leer los pilares", error)
  return data.map((p) => ({ id: p.id, marcaId: p.marca_id, nombre: p.nombre }))
}

export interface BalanceDeCuenta {
  cuentaId: string
  cuenta: string
  marcaId: string
  balance: Balance
}

/** D20 for every account with a weekly rhythm. Works with a person's client (RLS) and with the service role. */
export async function balancePorCuenta(db: Db, ahora: number): Promise<BalanceDeCuenta[]> {
  const desde = new Date(ahora - DIAS_DE_LECTURA * DIA_MS).toISOString()
  const hasta = new Date(ahora + DIAS_PLANEADOS * DIA_MS).toISOString()
  const [cuentas, pilares, piezas] = await Promise.all([
    db.from("cuentas").select("id, nombre, marca_id").gt("ritmo_semanal", 0).order("nombre"),
    db.from("pilares").select("id, marca_id, nombre, por_semana, creado_en").eq("activo", true).order("orden"),
    db
      .from("piezas")
      .select("cuenta_id, pilar_id, estado, planeada_para")
      .in("estado", ["por_aprobar", "programada", "publicando", "publicada"])
      .gte("planeada_para", desde)
      .lt("planeada_para", hasta),
  ])
  if (cuentas.error) fallo("No pude leer las cuentas", cuentas.error)
  if (pilares.error) fallo("No pude leer los pilares", pilares.error)
  if (piezas.error) fallo("No pude leer las piezas", piezas.error)
  return cuentas.data.map((c) => ({
    cuentaId: c.id,
    cuenta: c.nombre,
    marcaId: c.marca_id,
    balance: balanceDePilares(
      pilares.data
        .filter((p) => p.marca_id === c.marca_id)
        .map((p) => ({ id: p.id, nombre: p.nombre, porSemana: Number(p.por_semana), creadoEn: p.creado_en })),
      piezas.data.flatMap((p) =>
        p.cuenta_id === c.id && p.planeada_para
          ? [{ pilarId: p.pilar_id, instante: p.planeada_para, estado: leerEstado(p.estado) }]
          : [],
      ),
      ahora,
    ),
  }))
}
