import { describe, expect, test } from "vitest"
import { type Excepcion, mensajeDe, prepararRevision } from "@/lib/clientes/revision"

const HOY = "2026-11-02"

function excepcion(cambios: Partial<Excepcion> = {}): Excepcion {
  return { cliente: "Banco Ñuñoa", alias: [], tipo: "no_nombrar", hasta: null, ...cambios }
}

describe("clientes", () => {
  test("finds a client with an exception ignoring case and accents and returns the original words", () => {
    const r = prepararRevision([excepcion()], HOY)
    expect(r.clientes("Trabajamos con banco nunoa en 2019.")).toEqual([
      { tipo: "cliente", cliente: "Banco Ñuñoa", excepcion: "no_nombrar", fragmento: "banco nunoa" },
    ])
  })

  test("respects word edges, so a longer word is not a mention", () => {
    const r = prepararRevision([excepcion({ cliente: "Mistral" })], HOY)
    expect(r.clientes("Mistralidad no es una marca.")).toEqual([])
    expect(r.clientes("El booth de Mistral.")).toHaveLength(1)
  })

  test("finds aliases and reports the client's name", () => {
    const r = prepararRevision([excepcion({ cliente: "Anglo American", alias: ["Anglo"] })], HOY)
    expect(r.clientes("Con Anglo en terreno.")[0]).toMatchObject({ cliente: "Anglo American", fragmento: "Anglo" })
  })

  test("ignores exceptions about images, removed by date, or whose date already passed", () => {
    const r = prepararRevision(
      [
        excepcion({ cliente: "Sin Logo SA", tipo: "sin_logo" }),
        excepcion({ cliente: "Vencida", hasta: "2026-11-01" }),
        excepcion({ cliente: "Vigente", hasta: HOY, tipo: "confidencial" }),
      ],
      HOY,
    )
    expect(r.clientes("Sin Logo SA, Vencida y Vigente.").map((h) => h.tipo === "cliente" && h.cliente)).toEqual([
      "Vigente",
    ])
  })

  test("with no exceptions it finds nothing and compiles nothing", () => {
    expect(prepararRevision([], HOY).clientes("Cualquier texto.")).toEqual([])
  })
})

describe("revisar at gate 1", () => {
  const r = prepararRevision([excepcion()], HOY)

  test("flags @mentions other than WAV and Federico, and not an email", () => {
    const hallazgos = r.revisar("Gracias @copec y @wav y @FedericoElgueta. Escribe a hola@wav.cl", "yo")
    expect(hallazgos).toEqual([{ tipo: "mencion", fragmento: "@copec" }])
  })

  test("flags prices, amounts with currency and budgets", () => {
    const hallazgos = r.revisar("Costó $1.200.000, unos 30 millones de pesos, 500 UF. El presupuesto fue justo.", "yo")
    expect(hallazgos.map((h) => h.fragmento)).toEqual(["$1.200.000", "30 millones de pesos", "500 UF", "presupuesto"])
  })

  test("does not flag counts that are not money", () => {
    expect(r.revisar("3 mil asistentes y 2 millones de visitas.", "yo")).toEqual([])
  })

  test("flags the track record claimed by a «nosotros» voice unless Federico is named", () => {
    expect(r.revisar("Tenemos más de 20 años y +200 proyectos.", "nosotros").map((h) => h.tipo)).toEqual([
      "trayectoria",
      "trayectoria",
    ])
    expect(r.revisar("Federico Elgueta suma más de 20 años.", "nosotros")).toEqual([])
    expect(r.revisar("Llevo más de 20 años.", "yo")).toEqual([])
  })

  test("includes client exceptions too", () => {
    expect(r.revisar("Con Banco Ñuñoa.", "yo")[0]?.tipo).toBe("cliente")
  })
})

describe("mensajeDe", () => {
  test("words each finding for the person who signs", () => {
    expect(mensajeDe({ tipo: "cliente", cliente: "Copec", excepcion: "confidencial", fragmento: "copec" })).toBe(
      "Nombra a Copec, que es confidencial.",
    )
    expect(mensajeDe({ tipo: "cliente", cliente: "Copec", excepcion: "no_nombrar", fragmento: "Copec" })).toBe(
      "Nombra a Copec, que no se nombra.",
    )
    expect(mensajeDe({ tipo: "mencion", fragmento: "@copec" })).toBe("@copec: solo WAV y Federico se mencionan con @.")
    expect(mensajeDe({ tipo: "precio", fragmento: "$100" })).toBe("«$100»: nunca se publican precios ni presupuestos.")
    expect(mensajeDe({ tipo: "trayectoria", fragmento: "más de 20 años" })).toBe(
      "«más de 20 años» es la trayectoria de Federico: atribúyela a él, no a WAV.",
    )
  })
})

describe("CPU budget", () => {
  // The Worker has 10 ms of CPU per request; a quadratic pattern spends it all on one long run of digits.
  test("reviews 3,000-char adversarial texts in linear time", () => {
    const excepciones = Array.from({ length: 200 }, (_, i) =>
      excepcion({ cliente: `Cliente Numero ${i} SA`, alias: [`CN${i}`] }),
    )
    const r = prepararRevision(excepciones, HOY)
    const adversarios = [
      "1".repeat(3000),
      "1.".repeat(1500),
      `$${"1,".repeat(1499)}`,
      `@${"a.".repeat(1499)}`,
      "Cliente Numero ".repeat(200),
      "mas de ".repeat(428),
    ]
    r.revisar("calentar", "nosotros")
    const inicio = performance.now()
    for (const texto of adversarios) r.revisar(texto, "nosotros")
    expect(performance.now() - inicio).toBeLessThan(8)
  })
})
