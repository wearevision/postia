export interface LectoresDeConteos {
  informes: () => Promise<number>
  ideas: () => Promise<number>
}

export interface ConteosDeInicio {
  informes: number | null
  ideas: number | null
}

// A failing count must not take Inicio down with it: that line is left out and the cause is logged.
async function sinCaerse(leer: () => Promise<number>, contexto: string): Promise<number | null> {
  try {
    return await leer()
  } catch (falla) {
    console.error(contexto, falla)
    return null
  }
}

export async function leerConteos(lectores: LectoresDeConteos): Promise<ConteosDeInicio> {
  const [informes, ideas] = await Promise.all([
    sinCaerse(lectores.informes, "No pude contar los informes por aprobar para Inicio"),
    sinCaerse(lectores.ideas, "No pude contar las ideas por revisar para Inicio"),
  ])
  return { informes, ideas }
}
