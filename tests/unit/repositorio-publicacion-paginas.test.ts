import { createClient } from "@supabase/supabase-js"
import { HttpResponse, http } from "msw"
import { describe, expect, test } from "vitest"
import { repositorioDePublicacion } from "@/lib/publicacion/repositorio"
import type { Database } from "@/lib/supabase/database.types"
import { servidor } from "../msw"

// paginasDe never touches the database: a client that points nowhere is enough.
const db = () =>
  createClient<Database>("http://127.0.0.1:1", "clave", { auth: { persistSession: false, autoRefreshToken: false } })

describe("publisher ports: paginasDe", () => {
  test("reads each site's paginas.json once per run", async () => {
    const lecturas = { wr3: 0, wav: 0 }
    servidor.use(
      http.get("https://wr3.wearevision.cl/paginas.json", () => {
        lecturas.wr3++
        return HttpResponse.json([{ url: "https://wr3.wearevision.cl/", titulo: "WR3", tema: "x" }])
      }),
      http.get("https://wearevision.cl/paginas.json", () => {
        lecturas.wav++
        return HttpResponse.json([{ url: "https://wearevision.cl/", titulo: "WAV", tema: "x" }])
      }),
    )
    const corrida = repositorioDePublicacion(db())
    expect(await Promise.all([corrida.paginasDe("wr3"), corrida.paginasDe("wr3")])).toEqual([
      ["https://wr3.wearevision.cl/"],
      ["https://wr3.wearevision.cl/"],
    ])
    expect(await corrida.paginasDe("wav")).toEqual(["https://wearevision.cl/"])
    expect(await corrida.paginasDe("wr3")).toEqual(["https://wr3.wearevision.cl/"])
    expect(lecturas).toEqual({ wr3: 1, wav: 1 })

    await repositorioDePublicacion(db()).paginasDe("wr3")
    expect(lecturas.wr3).toBe(2)
  })
})
