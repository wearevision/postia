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

  test("finds a client written in NFD, with a no-break space, a newline or two spaces between words", () => {
    const r = prepararRevision([excepcion()], HOY)
    const nfd = "Con Banco Ñuñoa.".normalize("NFD")
    expect(r.clientes(nfd)).toEqual([
      { tipo: "cliente", cliente: "Banco Ñuñoa", excepcion: "no_nombrar", fragmento: "Banco Ñuñoa" },
    ])
    expect(r.clientes("Con Banco\u00a0Ñuñoa.")[0]?.fragmento).toBe("Banco\u00a0Ñuñoa")
    expect(r.clientes("Con Banco\nÑuñoa.")[0]?.fragmento).toBe("Banco\nÑuñoa")
    expect(r.clientes("Con Banco  Ñuñoa.")[0]?.fragmento).toBe("Banco  Ñuñoa")
  })

  test("treats the typographic apostrophe as the straight one", () => {
    const r = prepararRevision([excepcion({ cliente: "HENDRICK'S" })], HOY)
    expect(r.clientes("Con Hendrick’s en la barra.")).toEqual([
      { tipo: "cliente", cliente: "HENDRICK'S", excepcion: "no_nombrar", fragmento: "Hendrick’s" },
    ])
  })

  test("finds a client whose exception was typed in NFD", () => {
    const r = prepararRevision([excepcion({ cliente: "Banco Ñuñoa".normalize("NFD") })], HOY)
    expect(r.clientes("Con banco ñuñoa.")).toHaveLength(1)
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

  test("flags Chilean and foreign currency marks", () => {
    const precios = (texto: string) => r.revisar(texto, "yo").map((h) => h.fragmento)
    expect(precios("Fueron CLP$1.000.000.")).toEqual(["CLP$1.000.000"])
    expect(precios("Unos MM$30 en total.")).toEqual(["MM$30"])
    expect(precios("Costó M$ 500.000.")).toEqual(["M$ 500.000"])
    expect(precios("Fueron US$ 5.000.")).toEqual(["US$ 5.000"])
    expect(precios("Costó €500.")).toEqual(["€500"])
    expect(precios("Costó 500 euros.")).toEqual(["500 euros"])
    expect(precios("Costó EUR 500 y 300 EUR.")).toEqual(["EUR 500", "300 EUR"])
  })

  test("reports one finding for an amount two patterns see", () => {
    expect(r.revisar("Costó $500 USD.", "yo")).toEqual([{ tipo: "precio", fragmento: "$500" }])
  })

  test("orders findings as they appear in the text", () => {
    expect(r.revisar("El presupuesto: $100. Con Banco Ñuñoa.", "yo").map((h) => h.fragmento)).toEqual([
      "presupuesto",
      "$100",
      "Banco Ñuñoa",
    ])
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

  test("catches other ways of claiming the track record", () => {
    const trayectoria = (texto: string) => r.revisar(texto, "nosotros").map((h) => h.fragmento)
    expect(trayectoria("Tenemos 20 años de experiencia.")).toEqual(["20 años de experiencia"])
    expect(trayectoria("Con veinte años de trayectoria.")).toEqual(["veinte años de trayectoria"])
    expect(trayectoria("Somos más de 25 años.")).toEqual(["más de 25 años"])
    expect(trayectoria("Ya son 200+ proyectos.")).toEqual(["200+ proyectos"])
    expect(trayectoria("Somos más  de 20 años.")).toEqual(["más  de 20 años"])
    expect(trayectoria("Hace 2 años de experiencia y 120 años de historia.")).toEqual([])
  })

  test("allows WAV and Federico however their handle is written", () => {
    const texto = "@Federico_Elgueta @federico-elgueta @FedericoElgueta @WAV @wearevision @wav.cl @Fede @copec_chile"
    expect(r.revisar(texto, "yo").map((h) => h.fragmento)).toEqual(["@Fede", "@copec_chile"])
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
    // 50 ms leaves room for a loaded CI runner; a quadratic regression takes seconds.
    expect(performance.now() - inicio).toBeLessThan(50)
  })
})
