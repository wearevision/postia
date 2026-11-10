# Casos on wearevision.cl Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** wearevision.cl gets a «Casos» section (`/casos/` and `/casos/<slug>/`) with about 20 cases chosen by Federico, each with «Lo que aprendió Federico», listed in `paginas.json` and `sitemap.xml`, and a build that refuses any case breaking the project rules.

**Architecture:** Spec `docs/superpowers/specs/2026-11-10-postia-y-webs-design.md`, Parte 1 (step 2 of «Orden de construcción»). Cases live in `wav-web2/data/casos.json`; `build.mjs` validates them and renders static HTML from template functions (no framework). Federico chooses cases, confirms photo permissions and corrects lessons in a one-time review page published as a claude.ai Artifact with the `db` capability; an importer turns his decisions into `data/casos.json` and converts the chosen frames to webp. Code (Tasks 2-6) and Federico's review (Tasks 1, 7) run in parallel; Task 8 joins them.

**Tech Stack:** Node 24 ESM, `node:test`, `cwebp` (`/opt/homebrew/bin/cwebp`), wrangler (deploy only, gated), claude.ai Artifact + `db` capability, `ArtifactData` tool.

---

## Context the engineer needs

- **Repo:** `~/Projects/wav-web2` (github `wearevision/wav-web2`, private). Work on a new branch `casos` from `main`. Tests: `node --test` (runs `test/*.test.mjs`). Build: `node build.mjs` writes `dist/`. Preview: `python3 -m http.server 4174 --directory dist` (POSTIA `.claude/launch.json` config «wav-web2»). Deploy: `pnpm deploy` — **only with Federico's explicit OK**.
- **Source data (read-only, never modified):**
  - `~/Projects/POSTIA/data/casos/casos.json`: `{ source, rules, cases: [...] }`, 105 cases. Fields: `slug, client, title (UPPERCASE), year, country, city, industry, workTypes[], capabilities[], summary, role, citableClaim, era ("trayectoria" for all 105), exception (null, or a reason string; 1 case has «evento privado»)`.
  - `~/Projects/wav-repository/data/cases/<slug>/frames/frame-<n>.jpg` (1280×720, ~40 KB). **Only 34 of the 105 cases have frames** (71 have none). wav-repository is never written to.
- **Project rules that bind the content** (POSTIA `CLAUDE.md`): a case before August 2025 is Federico's trajectory, never «WAV hizo»; never prices or budgets; clients with an exception are never named; a photo with people only with permission; quote, don't copy.
- **Spec delta (decided while planning):** a case with no photo cannot go on the site (the page is built around a photo). Cases without frames show in the review page as «sin fotos» and cannot be chosen. If Federico wants one of them, he sends photos and that case is added later by hand.
- **Existing helpers in wav-web2:** `origen.js` exports `tituloCorto(title)` (drops « — »-separated brand parts) used by `paginas.mjs` `pagina(rel, html)` → `{url, titulo, tema}`. `paginas.mjs` `texto()` decodes `&amp; &quot; &#39; &lt; &gt;`, so templates must escape with exactly those entities.
- **Styling:** `styles.css` tokens `--ink --paper --muted --line --blue --pink --gutter`, classes `.eyebrow`, `.section-pad`, `.site-header`, `.brand`, `.main-nav`, `.header-contact`. Case pages do **not** load `script.js` (language switch, reveal, videos): never use `.reveal` there (it starts at `opacity: 0`).

## File structure (wav-web2)

| File | Responsibility |
|---|---|
| `casos-validar.mjs` | `erroresDe(caso)`, `validarCasos(casos)`: the rules that fail the build |
| `casos-plantillas.mjs` | `escapar`, `descripcion`, `paginaCaso(caso)`, `paginaIndice(casos)`: HTML strings |
| `casos.css` | Styles only for `/casos/` pages |
| `sitemap.mjs` | `sitemap(urls)` → XML |
| `robots.txt` | Points Google to the sitemap |
| `data/casos.json` | The published cases (starts as `[]`) |
| `build.mjs` (modify) | Validate, render case pages, write `sitemap.xml`, extend `paginas.json` |
| `herramientas/importar-revision.mjs` | `oracion`, `armarCasos`, `copiasDeFotos` + CLI that writes `data/casos.json` and the webp photos |
| `herramientas/revision/armar.mjs` | Builds the one-time review page HTML with inline thumbnails |
| `herramientas/revision/plantilla.html` | The review page (markup, style, script) |
| `index.html` (modify, Task 8) | «Casos» in the menu, «Ver casos» in Trabajo |

`data/casos.json` shape (one element):

```json
{
  "slug": "51-ice-auspicio-evento-y-activacion-bolivia-2020",
  "client": "51 ICE",
  "title": "Auspicio, evento y activación en Bolivia",
  "year": 2020,
  "country": "Bolivia",
  "industry": "Bebidas / Licores",
  "workTypes": ["Activación de marca", "Auspicio de evento"],
  "summary": "…",
  "role": "…",
  "era": "trayectoria",
  "exception": null,
  "aprendizajes": ["…", "…"],
  "fotos": ["/assets/casos/51-ice-auspicio-evento-y-activacion-bolivia-2020/1.webp"],
  "permisoFotos": true
}
```

---

### Task 1: Review page (Federico's round 1) — controller task

Runs first and in parallel with Tasks 2-6, because Federico's time is the bottleneck. The **controller** (main session) publishes the Artifact; it must load the `artifact-design` and `artifact-capabilities` skills before publishing.

**Files:**
- Create: `herramientas/revision/armar.mjs`, `herramientas/revision/plantilla.html`
- Create: `herramientas/importar-revision.mjs` (only `oracion` in this task; Task 6 completes it)
- Test: `test/importar-revision.test.mjs`

- [ ] **Step 1: Branch**

```bash
cd ~/Projects/wav-web2 && git checkout main && git pull && git checkout -b casos
```

- [ ] **Step 2: Write the failing test for `oracion`**

`test/importar-revision.test.mjs`:

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { oracion } from "../herramientas/importar-revision.mjs";

test("an uppercase title becomes sentence case", () => {
  assert.equal(oracion("AUSPICIO EVENTO Y ACTIVACIÓN BOLIVIA"), "Auspicio evento y activación bolivia");
});

test("surrounding spaces are dropped", () => {
  assert.equal(oracion("  LANZAMIENTO  "), "Lanzamiento");
});
```

- [ ] **Step 3: Run it**

Run: `node --test test/importar-revision.test.mjs`
Expected: FAIL, `Cannot find module '.../herramientas/importar-revision.mjs'`.

- [ ] **Step 4: Implement `oracion`**

`herramientas/importar-revision.mjs`:

```js
// Turns Federico's decisions from the review page into data/casos.json and the case photos.
export function oracion(texto) {
  const s = texto.trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
```

- [ ] **Step 5: Run it**

Run: `node --test test/importar-revision.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 6: Write the review page template**

`herramientas/revision/plantilla.html` (the builder replaces `__DATOS__`):

```html
<title>Revisión de casos</title>
<style>
  :root { --bg: #f7f6f2; --fg: #16161a; --muted: #6b6a70; --line: #dddbd3; --accent: #0077b6; --ok: #1b7f3b; --card: #ffffff; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #0d0d10; --fg: #f0ede6; --muted: #a4a3a7; --line: #2c2c33; --accent: #4cc3ff; --ok: #5fd38a; --card: #16161b; } }
  :root[data-theme="dark"] { --bg: #0d0d10; --fg: #f0ede6; --muted: #a4a3a7; --line: #2c2c33; --accent: #4cc3ff; --ok: #5fd38a; --card: #16161b; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, sans-serif; }
  header { position: sticky; top: 0; z-index: 2; background: var(--bg); border-bottom: 1px solid var(--line); padding: 12px 16px; }
  header h1 { margin: 0; font-size: 1.1rem; }
  #estado { margin: 4px 0 0; color: var(--muted); font-size: .9rem; }
  nav { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
  nav button { border: 1px solid var(--line); background: var(--card); color: var(--fg); border-radius: 999px; padding: 4px 12px; font: inherit; font-size: .85rem; }
  nav button[aria-pressed="true"] { border-color: var(--accent); color: var(--accent); }
  main { padding: 16px; display: grid; gap: 16px; max-width: 760px; margin: 0 auto; }
  article { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 14px; }
  article.elegido { border-color: var(--ok); }
  .fotos { display: flex; gap: 6px; overflow-x: auto; margin: 8px 0; }
  .fotos label { flex: 0 0 auto; position: relative; }
  .fotos img { width: 150px; height: 84px; object-fit: cover; border-radius: 6px; display: block; }
  .fotos input { position: absolute; top: 4px; left: 4px; }
  h2 { margin: 0; font-size: 1rem; }
  .meta, .sinfotos { color: var(--muted); font-size: .85rem; }
  details { margin: 6px 0; font-size: .9rem; }
  .controles { display: grid; gap: 8px; margin-top: 8px; }
  .controles label { display: flex; gap: 8px; align-items: flex-start; }
  input[type="text"], textarea { width: 100%; box-sizing: border-box; font: inherit; padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); }
  textarea { min-height: 3.2em; }
  .aviso { color: var(--accent); font-size: .85rem; }
</style>
<header>
  <h1>Casos para wearevision.cl</h1>
  <p id="estado">Conectando…</p>
  <nav>
    <button type="button" data-filtro="confotos" aria-pressed="true">Con fotos</button>
    <button type="button" data-filtro="elegidos" aria-pressed="false">Elegidos</button>
    <button type="button" data-filtro="sinfotos" aria-pressed="false">Sin fotos</button>
  </nav>
</header>
<main id="lista"></main>
<script id="datos" type="application/json">__DATOS__</script>
<script>
  const CASOS = JSON.parse(document.getElementById("datos").textContent);
  const decisiones = {};
  const borradores = {};
  let db = null;
  let filtro = "confotos";
  const pendientes = new Map();

  const base = (c) => ({ elegido: false, permisoFotos: false, fotos: [], titulo: c.titulo, aprendizajes: [], aprobado: false, nota: "" });
  const decision = (c) => ({ ...base(c), ...(decisiones[c.slug] ?? {}) });

  function estado(texto) { document.getElementById("estado").textContent = texto; }

  function contar() {
    const elegidos = CASOS.filter((c) => decision(c).elegido).length;
    const aprobados = CASOS.filter((c) => decision(c).elegido && decision(c).aprobado).length;
    estado(db ? `Elegidos: ${elegidos} de unos 20 · Aprobados: ${aprobados}` : "Solo lectura: abre esta página con tu cuenta de claude.ai para guardar.");
  }

  async function guardar(slug, cambios) {
    const c = CASOS.find((x) => x.slug === slug);
    decisiones[slug] = { ...decision(c), ...cambios };
    contar();
    if (!db) return;
    clearTimeout(pendientes.get(slug));
    pendientes.set(slug, setTimeout(async () => {
      try { await db.doc(`decisiones/${slug}`).set(decisiones[slug]); }
      catch (e) { estado(`No se guardó ${c.cliente}: ${e.code ?? e.message}`); }
      finally { pendientes.delete(slug); }
    }, 600));
  }

  function el(tag, props = {}, ...hijos) {
    const n = document.createElement(tag);
    Object.assign(n, props);
    for (const h of hijos) n.append(h);
    return n;
  }

  function tarjeta(c) {
    const d = decision(c);
    const a = el("article", { className: d.elegido ? "elegido" : "" });
    a.append(el("h2", { textContent: `${c.cliente} — ${d.titulo}` }));
    a.append(el("p", { className: "meta", textContent: `${c.anio} · ${c.pais} · ${c.industria}` }));
    a.append(el("details", {}, el("summary", { textContent: "Resumen y rol" }), el("p", { textContent: c.resumen }), el("p", { textContent: c.rol })));
    if (c.miniaturas.length === 0) {
      a.append(el("p", { className: "sinfotos", textContent: "Sin fotos: no puede ir a la web por ahora." }));
      return a;
    }
    const fotos = el("div", { className: "fotos" });
    c.miniaturas.forEach((src, i) => {
      const caja = el("input", { type: "checkbox", checked: d.fotos.includes(i), title: "Usar esta foto" });
      caja.addEventListener("change", () => {
        const actual = decision(c).fotos.filter((n) => n !== i);
        guardar(c.slug, { fotos: caja.checked ? [...actual, i].sort((x, y) => x - y) : actual });
      });
      fotos.append(el("label", {}, el("img", { src, alt: `Foto ${i + 1} de ${c.cliente}` }), caja));
    });
    a.append(fotos);
    const controles = el("div", { className: "controles" });
    const elegir = el("input", { type: "checkbox", checked: d.elegido });
    elegir.addEventListener("change", () => { guardar(c.slug, { elegido: elegir.checked }); pintar(); });
    controles.append(el("label", {}, elegir, "Va a la web"));
    if (d.elegido) {
      const permiso = el("input", { type: "checkbox", checked: d.permisoFotos });
      permiso.addEventListener("change", () => guardar(c.slug, { permisoFotos: permiso.checked }));
      controles.append(el("label", {}, permiso, "Las personas de las fotos marcadas dieron permiso"));
      const titulo = el("input", { type: "text", value: d.titulo });
      titulo.addEventListener("input", () => guardar(c.slug, { titulo: titulo.value }));
      controles.append(el("label", {}, "Título", titulo));
      const propuestos = d.aprendizajes.length ? d.aprendizajes : (borradores[c.slug] ?? []);
      if (propuestos.length === 0) {
        controles.append(el("p", { className: "aviso", textContent: "Aprendizajes: Claude los propone después de que elijas." }));
      } else {
        const textos = [0, 1, 2].map((i) => {
          const t = el("textarea", { value: propuestos[i] ?? "", placeholder: i === 2 ? "Tercero (opcional)" : "" });
          t.addEventListener("input", () => guardar(c.slug, { aprendizajes: textos.map((x) => x.value.trim()).filter(Boolean), aprobado: false }));
          return t;
        });
        controles.append(el("p", { className: "meta", textContent: "Lo que aprendió Federico (2 o 3)" }), ...textos);
        const aprobar = el("input", { type: "checkbox", checked: d.aprobado });
        aprobar.addEventListener("change", () => guardar(c.slug, { aprobado: aprobar.checked, aprendizajes: textos.map((x) => x.value.trim()).filter(Boolean) }));
        controles.append(el("label", {}, aprobar, "Apruebo este caso tal como está"));
      }
      const nota = el("input", { type: "text", value: d.nota, placeholder: "Nota para Claude (opcional)" });
      nota.addEventListener("input", () => guardar(c.slug, { nota: nota.value }));
      controles.append(nota);
    }
    a.append(controles);
    return a;
  }

  function pintar() {
    const visibles = CASOS.filter((c) =>
      filtro === "sinfotos" ? c.miniaturas.length === 0 : filtro === "elegidos" ? decision(c).elegido : c.miniaturas.length > 0,
    );
    document.getElementById("lista").replaceChildren(...visibles.map(tarjeta));
    contar();
  }

  for (const b of document.querySelectorAll("nav button")) {
    b.addEventListener("click", () => {
      filtro = b.dataset.filtro;
      for (const x of document.querySelectorAll("nav button")) x.setAttribute("aria-pressed", String(x === b));
      pintar();
    });
  }

  pintar();
  (async () => {
    db = await claude.use("db");
    if (!db) { contar(); return; }
    const espera = setTimeout(() => estado("No pude leer lo guardado todavía; lo que marques se guarda igual."), 10000);
    const fin = () => clearTimeout(espera);
    db.collection("decisiones").onSnapshot((s) => {
      if (!s.metadata.fromCache) fin();
      // A card with a write still waiting keeps its local state; the snapshot would undo the typing.
      for (const d of s.docs) if (!pendientes.has(d.id)) decisiones[d.id] = d.data();
      if (!document.activeElement?.matches("input[type=text], textarea")) pintar(); else contar();
    }, (e) => { fin(); estado(`Error al leer: ${e.code}`); });
    db.collection("borradores").onSnapshot((s) => {
      for (const d of s.docs) borradores[d.id] = d.data().aprendizajes ?? [];
      if (!document.activeElement?.matches("input[type=text], textarea")) pintar();
    }, () => {});
  })();
</script>
```

- [ ] **Step 7: Write the builder**

`herramientas/revision/armar.mjs`:

```js
// One-time: builds the review page with every PostIA case and inline thumbnails of its frames.
// Usage: node herramientas/revision/armar.mjs <casos.json de PostIA> <wav-repository/data/cases> <salida.html>
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { oracion } from "../importar-revision.mjs";

const [fichasPath, framesDir, salida] = process.argv.slice(2);
const { cases } = JSON.parse(readFileSync(fichasPath, "utf8"));

const miniatura = (jpg) =>
  `data:image/webp;base64,${execFileSync("cwebp", ["-quiet", "-q", "55", "-resize", "480", "0", jpg, "-o", "-"]).toString("base64")}`;

const frames = (slug) => {
  const dir = join(framesDir, slug, "frames");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^frame-\d+\.jpg$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
    .map((f) => miniatura(join(dir, f)));
};

const datos = cases
  .filter((c) => c.exception === null)
  .map((c) => ({
    slug: c.slug,
    cliente: c.client,
    titulo: oracion(c.title),
    anio: c.year,
    pais: c.country,
    industria: c.industry,
    resumen: c.summary,
    rol: c.role,
    miniaturas: frames(c.slug),
  }))
  .sort((a, b) => b.miniaturas.length - a.miniaturas.length || b.anio - a.anio);

const json = JSON.stringify(datos).replace(/</g, "\\u003c");
const plantilla = readFileSync(new URL("./plantilla.html", import.meta.url), "utf8");
writeFileSync(salida, plantilla.replace("__DATOS__", () => json));
console.log(`${datos.length} casos (${datos.filter((d) => d.miniaturas.length).length} con fotos) → ${salida}`);
```

Note: the miniature index `i` shown in the page is the position in the sorted `frame-<n>.jpg` list, which equals `n` because frames are numbered from 0 without gaps; Task 6 relies on this (`frame-${i}.jpg`). Step 8 checks it.

- [ ] **Step 8: Build the page and check frame numbering**

```bash
cd ~/Projects/wav-web2
for d in ../wav-repository/data/cases/*/frames; do n=$(ls $d | wc -l); m=$(ls $d | sed -E 's/frame-([0-9]+).jpg/\1/' | sort -n | tail -1); [ "$n" -eq $((m+1)) ] || echo "GAP $d"; done
node herramientas/revision/armar.mjs ../POSTIA/data/casos/casos.json ../wav-repository/data/cases "$SCRATCH/revision-casos.html"
ls -lh "$SCRATCH/revision-casos.html"
```

Expected: no `GAP` lines; `104 casos (34 con fotos)`; file under 16 MB (about 2 MB). `$SCRATCH` is the session scratchpad. If a GAP appears, stop and switch Task 6 to keep the real frame names.

- [ ] **Step 9: Publish (controller)**

Load `artifact-design` and `artifact-capabilities`. Publish `$SCRATCH/revision-casos.html` with `capabilities: {db: {}}`, `icon: "checklist"`, description «Elegir unos 20 casos para wearevision.cl, confirmar permisos de fotos y corregir aprendizajes.». Then run one `ArtifactData` `list` of `decisiones` (expect empty) to verify the page's collection exists/answers, and open it in the browser pane at 375 px width to check the cards render and a checkbox saves (then un-tick it).

- [ ] **Step 10: Commit**

```bash
git add herramientas test/importar-revision.test.mjs
git commit -m "feat(casos): build the one-time review page for choosing cases"
```

- [ ] **Step 11: Hand to Federico (round 1)**

Message: link, «marca unos 20 casos con "Va a la web", las fotos que sirven, el permiso de las personas y corrige el título. Avísame cuando termines.» Tasks 2-6 continue meanwhile.

---

### Task 2: Case validation rules

**Files:**
- Create: `casos-validar.mjs`
- Test: `test/casos-validar.test.mjs`

- [ ] **Step 1: Write the failing tests**

`test/casos-validar.test.mjs`:

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { erroresDe, validarCasos } from "../casos-validar.mjs";

const caso = (cambios = {}) => ({
  slug: "copec-85",
  client: "Copec",
  title: "Aniversario 85",
  year: 2019,
  country: "Chile",
  industry: "Energía",
  workTypes: ["Evento corporativo"],
  summary: "Federico Elgueta lideró la producción del aniversario.",
  role: "Federico Elgueta dirigió la producción integral.",
  era: "trayectoria",
  exception: null,
  aprendizajes: ["Un aniversario se recuerda por un momento, no por la agenda.", "El ensayo general es parte del evento."],
  fotos: ["/assets/casos/copec-85/1.webp"],
  permisoFotos: true,
  ...cambios,
});

test("a case that follows every rule has no errors", () => {
  assert.deepEqual(erroresDe(caso()), []);
});

test("handles a case with an exception by refusing it", () => {
  assert.deepEqual(erroresDe(caso({ exception: "evento privado" })), ["copec-85: tiene excepción (evento privado)"]);
});

test("handles missing photo permission by refusing it", () => {
  assert.deepEqual(erroresDe(caso({ permisoFotos: false })), ["copec-85: falta confirmar el permiso de las fotos"]);
});

test("handles a case without photos by refusing it", () => {
  assert.deepEqual(erroresDe(caso({ fotos: [] })), ["copec-85: no tiene fotos"]);
});

test("handles fewer than 2 or more than 3 lessons by refusing them", () => {
  assert.deepEqual(erroresDe(caso({ aprendizajes: ["Uno."] })), ["copec-85: necesita 2 o 3 aprendizajes (tiene 1)"]);
  assert.deepEqual(erroresDe(caso({ aprendizajes: ["a", "b", "c", "d"] })), ["copec-85: necesita 2 o 3 aprendizajes (tiene 4)"]);
});

test("handles money in any text by refusing it", () => {
  for (const texto of ["Costó $5.000.000", "US$ 20 mil", "40 millones CLP", "Con un presupuesto ajustado"]) {
    assert.deepEqual(erroresDe(caso({ summary: texto })), ["copec-85: menciona montos o presupuestos"], texto);
  }
});

test("handles «WAV» in a trajectory case by refusing it", () => {
  assert.deepEqual(erroresDe(caso({ role: "WAV produjo el evento." })), ["copec-85: un caso de trayectoria no puede decir «WAV»"]);
  assert.deepEqual(erroresDe(caso({ era: "wav", year: 2024, aprendizajes: ["WAV aprendió.", "b"] })), [
    "copec-85: un caso de trayectoria no puede decir «WAV»",
  ]);
});

test("a WAV-era case from 2025 on may name WAV", () => {
  assert.deepEqual(erroresDe(caso({ era: "wav", year: 2025, role: "WAV produjo el evento." })), []);
});

test("handles a malformed slug by refusing it", () => {
  assert.deepEqual(erroresDe(caso({ slug: "Copec 85" })), ["Copec 85: el slug no es válido"]);
});

test("validarCasos lists every problem, repeated slugs included", () => {
  assert.throws(() => validarCasos([caso(), caso({ permisoFotos: false })]), {
    message: "Casos con problemas:\n- copec-85: falta confirmar el permiso de las fotos\n- copec-85: slug repetido",
  });
});

test("validarCasos accepts an empty list", () => {
  assert.doesNotThrow(() => validarCasos([]));
});
```

- [ ] **Step 2: Run them**

Run: `node --test test/casos-validar.test.mjs`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`casos-validar.mjs`:

```js
// The rules that keep a case off wearevision.cl (spec 2026-11-10-postia-y-webs, Parte 1). The build
// stops on any of them, so a case that breaks a project rule can never be published by accident.
const MONTOS = /\$|\bCLP\b|presupuesto/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function erroresDe(caso) {
  const s = caso.slug;
  const errores = [];
  if (!SLUG.test(s ?? "")) errores.push(`${s}: el slug no es válido`);
  if (caso.exception !== null) errores.push(`${s}: tiene excepción (${caso.exception})`);
  if (caso.permisoFotos !== true) errores.push(`${s}: falta confirmar el permiso de las fotos`);
  if (!Array.isArray(caso.fotos) || caso.fotos.length === 0) errores.push(`${s}: no tiene fotos`);
  const aprendizajes = caso.aprendizajes ?? [];
  if (aprendizajes.length < 2 || aprendizajes.length > 3)
    errores.push(`${s}: necesita 2 o 3 aprendizajes (tiene ${aprendizajes.length})`);
  const textos = [caso.title, caso.summary, caso.role, ...aprendizajes];
  if (textos.some((t) => MONTOS.test(t ?? ""))) errores.push(`${s}: menciona montos o presupuestos`);
  // WAV was born in August 2025: anything earlier is Federico's trajectory, never «WAV hizo».
  const trayectoria = caso.era === "trayectoria" || caso.year < 2025;
  if (trayectoria && [caso.summary, caso.role, ...aprendizajes].some((t) => /\bWAV\b/.test(t ?? "")))
    errores.push(`${s}: un caso de trayectoria no puede decir «WAV»`);
  return errores;
}

export function validarCasos(casos) {
  const errores = casos.flatMap(erroresDe);
  const vistos = new Set();
  for (const c of casos) {
    if (vistos.has(c.slug)) errores.push(`${c.slug}: slug repetido`);
    vistos.add(c.slug);
  }
  if (errores.length) throw new Error(`Casos con problemas:\n- ${errores.join("\n- ")}`);
}
```

- [ ] **Step 4: Run them**

Run: `node --test test/casos-validar.test.mjs`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add casos-validar.mjs test/casos-validar.test.mjs
git commit -m "feat(casos): rules that stop the build on a case that breaks project rules"
```

---

### Task 3: Case page templates

**Files:**
- Create: `casos-plantillas.mjs`
- Test: `test/casos-plantillas.test.mjs`

- [ ] **Step 1: Write the failing tests**

`test/casos-plantillas.test.mjs`:

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { descripcion, escapar, paginaCaso, paginaIndice } from "../casos-plantillas.mjs";
import { pagina } from "../paginas.mjs";

const caso = (cambios = {}) => ({
  slug: "copec-85",
  client: "Copec",
  title: "Aniversario 85 <años>",
  year: 2019,
  country: "Chile",
  industry: "Energía",
  workTypes: ["Evento corporativo"],
  summary: "Federico Elgueta lideró el aniversario. Hubo 3.000 invitados.",
  role: "Federico Elgueta dirigió la producción.",
  era: "trayectoria",
  exception: null,
  aprendizajes: ["Primero & segundo.", "Otro aprendizaje."],
  fotos: ["/assets/casos/copec-85/1.webp", "/assets/casos/copec-85/2.webp"],
  permisoFotos: true,
  ...cambios,
});

test("escapar uses the entities paginas.mjs decodes", () => {
  assert.equal(escapar(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
});

test("descripcion keeps the first sentence, at most 160 characters", () => {
  assert.equal(descripcion("Una frase. Otra frase."), "Una frase.");
  assert.equal(descripcion("x".repeat(200)).length, 158);
  assert.ok(descripcion("x".repeat(200)).endsWith("…"));
});

test("a trajectory case page says whose trajectory it is and lists the lessons", () => {
  const html = paginaCaso(caso());
  assert.match(html, /<p class="eyebrow">Trayectoria de Federico Elgueta<\/p>/);
  assert.match(html, /<h1>Copec — Aniversario 85 &lt;años&gt;<\/h1>/);
  assert.match(html, /<h2>Lo que aprendió Federico<\/h2>\s*<ul>\s*<li>Primero &amp; segundo\.<\/li>\s*<li>Otro aprendizaje\.<\/li>/);
  assert.match(html, /<img src="\/assets\/casos\/copec-85\/1\.webp" alt="Copec — Aniversario 85 &lt;años&gt;"/);
  assert.match(html, /<img src="\/assets\/casos\/copec-85\/2\.webp" alt="" loading="lazy"/);
});

test("a WAV-era case page is labeled as a WAV case", () => {
  assert.match(paginaCaso(caso({ era: "wav", year: 2025 })), /<p class="eyebrow">Caso WAV<\/p>/);
});

test("a case page loads origen.js, analytics and has a WhatsApp link origen.js can rewrite", () => {
  const html = paginaCaso(caso());
  assert.match(html, /<script type="module" src="\/origen.js"><\/script>/);
  assert.match(html, /static\.cloudflareinsights\.com\/beacon\.min\.js" data-cf-beacon='\{"token": "54b031f6085a4726a9304142899c829a"\}'/);
  assert.match(html, /<a class="caso-cta" href="https:\/\/wa\.me\/56931994857\?text=/);
  assert.match(html, /<link rel="canonical" href="https:\/\/wearevision\.cl\/casos\/copec-85\/" \/>/);
});

test("paginas.json gets the case as client · title, with its first sentence as topic", () => {
  assert.deepEqual(pagina("casos/copec-85/index.html", paginaCaso(caso())), {
    url: "https://wearevision.cl/casos/copec-85/",
    titulo: "Copec · Aniversario 85 <años>",
    tema: "Federico Elgueta lideró el aniversario.",
  });
});

test("the index lists cases newest first and links each one", () => {
  const html = paginaIndice([caso({ slug: "viejo", year: 2012, client: "Antiguo" }), caso()]);
  assert.ok(html.indexOf('href="/casos/copec-85/"') < html.indexOf('href="/casos/viejo/"'));
  assert.equal(pagina("casos/index.html", html).titulo, "Casos");
});
```

- [ ] **Step 2: Run them**

Run: `node --test test/casos-plantillas.test.mjs`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`casos-plantillas.mjs`:

```js
// HTML for /casos/ and /casos/<slug>/. Spanish only (spec: «Fuera de esta versión»), so these pages
// skip script.js and its language switch; origen.js still writes PostIA's code into WhatsApp.
const SITIO = "https://wearevision.cl";
const WHATSAPP = "https://wa.me/56931994857?text=Hola%20WAV%2C%20quiero%20conversar%20sobre%20un%20proyecto.";
const BEACON = `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "54b031f6085a4726a9304142899c829a"}'></script>`;

export const escapar = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function descripcion(texto) {
  const primera = texto.split(/(?<=\.)\s/)[0];
  return primera.length <= 160 ? primera : `${primera.slice(0, 157).trimEnd()}…`;
}

const nombre = (c) => `${c.client} — ${c.title}`;

function documento({ titulo, desc, ruta, imagen, cuerpo }) {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#07070a" />
    <meta name="description" content="${escapar(desc)}" />
    <meta property="og:title" content="${escapar(titulo)}" />
    <meta property="og:description" content="${escapar(desc)}" />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="${SITIO}${imagen}" />
    <link rel="canonical" href="${SITIO}${ruta}" />
    <title>${escapar(titulo)}</title>
    <link rel="icon" href="/assets/brand/wav-logo.svg" type="image/svg+xml" />
    <link rel="preload" href="/assets/fonts/favorit-regular.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="stylesheet" href="/styles.css" />
    <link rel="stylesheet" href="/casos.css" />
    <script type="module" src="/origen.js"></script>
    ${BEACON}
  </head>
  <body>
    <header class="site-header" aria-label="Navegación principal">
      <a class="brand" href="/" aria-label="WAV, volver al inicio">
        <img src="/assets/brand/wav-logo.svg" alt="WAV" width="42" height="42" />
        <span>We Are Vision</span>
      </a>
      <nav class="main-nav" aria-label="Secciones">
        <a href="/#trabajo">Trabajo</a>
        <a href="/casos/">Casos</a>
        <a href="https://wr3.wearevision.cl/">WR3 · Investigación</a>
      </nav>
      <div class="header-actions">
        <a class="header-contact" href="${WHATSAPP}" target="_blank" rel="noreferrer"><span>Conversemos</span><span aria-hidden="true">↗</span></a>
      </div>
    </header>
    <main id="main">
${cuerpo}
    </main>
    <footer>
      <img src="/assets/brand/wav-logo.svg" alt="" width="34" height="34" />
      <p>WAV — We Are Vision</p>
      <p>Santiago, Chile</p>
    </footer>
  </body>
</html>
`;
}

export function paginaCaso(c) {
  const [principal, ...resto] = c.fotos;
  const cuerpo = `      <article class="caso section-pad">
        <p class="eyebrow">${c.era === "wav" ? "Caso WAV" : "Trayectoria de Federico Elgueta"}</p>
        <h1>${escapar(nombre(c))}</h1>
        <p class="caso-meta">${c.year} · ${escapar(c.country)} · ${escapar(c.industry)}</p>
        <img class="caso-principal" src="${principal}" alt="${escapar(nombre(c))}" width="1280" height="720" />
        <section>
          <h2>Contexto</h2>
          <p>${escapar(c.summary)}</p>
        </section>
        <section>
          <h2>Rol de Federico</h2>
          <p>${escapar(c.role)}</p>
        </section>
        <section class="caso-aprendizajes">
          <h2>Lo que aprendió Federico</h2>
          <ul>
${c.aprendizajes.map((a) => `            <li>${escapar(a)}</li>`).join("\n")}
          </ul>
        </section>
${resto.length ? `        <div class="caso-galeria">\n${resto.map((f) => `          <img src="${f}" alt="" loading="lazy" width="1280" height="720" />`).join("\n")}\n        </div>\n` : ""}        <a class="caso-cta" href="${WHATSAPP}" target="_blank" rel="noreferrer">Conversemos sobre tu proyecto ↗</a>
        <p><a class="caso-volver" href="/casos/">← Todos los casos</a></p>
      </article>`;
  return documento({
    titulo: `${c.client} · ${c.title} — WAV We Are Vision`,
    desc: descripcion(c.summary),
    ruta: `/casos/${c.slug}/`,
    imagen: principal,
    cuerpo,
  });
}

export function paginaIndice(casos) {
  const orden = [...casos].sort((a, b) => b.year - a.year || a.client.localeCompare(b.client, "es"));
  const tarjetas = orden
    .map(
      (c) => `          <li>
            <a href="/casos/${c.slug}/">
              <img src="${c.fotos[0]}" alt="" loading="lazy" width="1280" height="720" />
              <span class="casos-cliente">${escapar(c.client)}</span>
              <span class="casos-titulo">${escapar(c.title)}</span>
              <span class="casos-anio">${c.year}</span>
            </a>
          </li>`,
    )
    .join("\n");
  const cuerpo = `      <section class="casos section-pad">
        <p class="eyebrow">Trayectoria de Federico Elgueta</p>
        <h1>Casos</h1>
        <p class="casos-intro">Proyectos que Federico Elgueta lideró antes y durante WAV, con lo que aprendió en cada uno.</p>
        <ul class="casos-grilla">
${tarjetas}
        </ul>
      </section>`;
  return documento({
    titulo: "Casos — WAV We Are Vision",
    desc: "Proyectos de experiencia de marca que lideró Federico Elgueta y lo que aprendió en cada uno.",
    ruta: "/casos/",
    imagen: orden[0]?.fotos[0] ?? "/assets/media/hero-poster.jpg",
    cuerpo,
  });
}
```

Note «antes y durante WAV» in the intro is true only once a WAV-era case exists; until then (all 105 are trajectory) Task 8 Step 4 changes the copy if no chosen case has `era: "wav"`.

- [ ] **Step 4: Run them**

Run: `node --test test/casos-plantillas.test.mjs`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add casos-plantillas.mjs test/casos-plantillas.test.mjs
git commit -m "feat(casos): templates for the case pages and the index"
```

---

### Task 4: Sitemap and robots.txt

**Files:**
- Create: `sitemap.mjs`, `robots.txt`
- Test: `test/sitemap.test.mjs`

- [ ] **Step 1: Write the failing test**

`test/sitemap.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { sitemap } from "../sitemap.mjs";

test("sitemap lists every URL once in a urlset", () => {
  assert.equal(
    sitemap(["https://wearevision.cl/", "https://wearevision.cl/casos/"]),
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://wearevision.cl/</loc></url>
  <url><loc>https://wearevision.cl/casos/</loc></url>
</urlset>
`,
  );
});

test("robots.txt points to the sitemap", () => {
  const robots = readFileSync(new URL("../robots.txt", import.meta.url), "utf8");
  assert.match(robots, /^Sitemap: https:\/\/wearevision\.cl\/sitemap\.xml$/m);
});
```

- [ ] **Step 2: Run it**

Run: `node --test test/sitemap.test.mjs`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`sitemap.mjs`:

```js
// sitemap.xml for Google: the same public pages PostIA can link to.
export function sitemap(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}
</urlset>
`;
}
```

`robots.txt`:

```
User-agent: *
Allow: /

Sitemap: https://wearevision.cl/sitemap.xml
```

- [ ] **Step 4: Run it**

Run: `node --test test/sitemap.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add sitemap.mjs robots.txt test/sitemap.test.mjs
git commit -m "feat: sitemap.xml and robots.txt for wearevision.cl"
```

---

### Task 5: Wire cases into the build

**Files:**
- Create: `data/casos.json` (`[]`), `casos.css`, `test/fixtures/casos-validos.json`, `test/fixtures/casos-sin-permiso.json`
- Modify: `build.mjs`
- Test: `test/build.test.mjs`

- [ ] **Step 1: Fixtures**

`test/fixtures/casos-validos.json` (uses an existing image so no binary fixture is needed):

```json
[
  {
    "slug": "copec-85",
    "client": "Copec",
    "title": "Aniversario 85",
    "year": 2019,
    "country": "Chile",
    "industry": "Energía",
    "workTypes": ["Evento corporativo"],
    "summary": "Federico Elgueta lideró el aniversario. Hubo una gran gala.",
    "role": "Federico Elgueta dirigió la producción.",
    "era": "trayectoria",
    "exception": null,
    "aprendizajes": ["Un aniversario se recuerda por un momento.", "El ensayo general es parte del evento."],
    "fotos": ["/assets/media/geely.jpg"],
    "permisoFotos": true
  }
]
```

`test/fixtures/casos-sin-permiso.json`: the same array with `"permisoFotos": false`.

`data/casos.json`:

```json
[]
```

- [ ] **Step 2: Write the failing test**

`test/build.test.mjs`:

```js
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const raiz = new URL("../", import.meta.url);
const construir = (datos) =>
  spawnSync(process.execPath, ["build.mjs"], { cwd: raiz, env: { ...process.env, CASOS_DATOS: datos }, encoding: "utf8" });
const leer = (rel) => readFileSync(new URL(`../dist/${rel}`, import.meta.url), "utf8");

test("the build renders every case, its index, paginas.json and the sitemap", () => {
  const r = construir("test/fixtures/casos-validos.json");
  assert.equal(r.status, 0, r.stderr);
  assert.match(leer("casos/copec-85/index.html"), /<h1>Copec — Aniversario 85<\/h1>/);
  assert.match(leer("casos/index.html"), /href="\/casos\/copec-85\/"/);
  assert.deepEqual(
    JSON.parse(leer("paginas.json")).map((p) => p.url),
    ["https://wearevision.cl/", "https://wearevision.cl/casos/", "https://wearevision.cl/casos/copec-85/"],
  );
  assert.equal((leer("sitemap.xml").match(/<loc>/g) ?? []).length, 3);
  assert.ok(existsSync(new URL("../dist/casos.css", import.meta.url)));
  assert.ok(existsSync(new URL("../dist/robots.txt", import.meta.url)));
});

test("handles a case without photo permission by failing the build", () => {
  const r = construir("test/fixtures/casos-sin-permiso.json");
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /copec-85: falta confirmar el permiso de las fotos/);
});

test("handles a photo that is not in the repo by failing the build", () => {
  const r = construir("test/fixtures/casos-foto-ausente.json");
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /copec-85: no existe la foto \/assets\/casos\/copec-85\/9\.webp/);
});

test("with no cases the build publishes only the home, without /casos/", () => {
  const r = construir("data/casos.json");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(existsSync(new URL("../dist/casos/index.html", import.meta.url)), false);
  assert.deepEqual(JSON.parse(leer("paginas.json")).map((p) => p.url), ["https://wearevision.cl/"]);
});
```

Also create `test/fixtures/casos-foto-ausente.json`: the valid fixture with `"fotos": ["/assets/casos/copec-85/9.webp"]`.

Note: tests run in file order within this file and each rebuilds `dist/`; the last one leaves the real (empty) build in place.

- [ ] **Step 3: Run it**

Run: `node --test test/build.test.mjs`
Expected: FAIL: the first test fails because `dist/casos/copec-85/index.html` does not exist.

- [ ] **Step 4: Implement**

`build.mjs` (full file):

```js
import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { paginaCaso, paginaIndice } from "./casos-plantillas.mjs";
import { validarCasos } from "./casos-validar.mjs";
import { PAGINAS, pagina } from "./paginas.mjs";
import { sitemap } from "./sitemap.mjs";

const raiz = new URL("./", import.meta.url);
const output = new URL("./dist/", raiz);
// Tests point CASOS_DATOS at a fixture; the real site always reads data/casos.json.
const datos = process.env.CASOS_DATOS ?? fileURLToPath(new URL("./data/casos.json", raiz));

const casos = JSON.parse(await readFile(datos, "utf8"));
validarCasos(casos);
for (const c of casos) {
  for (const foto of c.fotos) {
    await access(new URL(`.${foto}`, raiz)).catch(() => {
      throw new Error(`${c.slug}: no existe la foto ${foto}`);
    });
  }
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await Promise.all([
  ...["index.html", "styles.css", "casos.css", "script.js", "origen.js", "politicasdeprivacidad.html", "_redirects", "robots.txt"].map(
    (f) => cp(new URL(`./${f}`, raiz), new URL(`./${f}`, output)),
  ),
  cp(new URL("./assets/", raiz), new URL("./assets/", output), { recursive: true }),
]);

const generadas = casos.length
  ? [["casos/index.html", paginaIndice(casos)], ...casos.map((c) => [`casos/${c.slug}/index.html`, paginaCaso(c)])]
  : [];
for (const [rel, html] of generadas) {
  const destino = new URL(rel, output);
  await mkdir(new URL("./", destino), { recursive: true });
  await writeFile(destino, html);
}

const paginas = [
  ...(await Promise.all(PAGINAS.map(async (rel) => pagina(rel, await readFile(new URL(`./${rel}`, raiz), "utf8"))))),
  ...generadas.map(([rel, html]) => pagina(rel, html)),
];
await writeFile(new URL("./paginas.json", output), `${JSON.stringify(paginas, null, 2)}\n`);
await writeFile(new URL("./sitemap.xml", output), sitemap(paginas.map((p) => p.url)));

console.log(`Static site built in dist/ (${paginas.length} pages in paginas.json, ${casos.length} casos)`);
```

`casos.css`:

```css
/* Only for /casos/ pages. Tokens come from styles.css. */
.caso, .casos { max-width: 72rem; margin: 0 auto; }
.caso h1, .casos h1 { margin: 0; font-size: clamp(2.2rem, 6vw, 5rem); font-weight: 400; letter-spacing: -.05em; line-height: .95; }
.caso .eyebrow, .casos .eyebrow { color: var(--blue); }
.caso-meta, .casos-intro { margin: 1rem 0 2rem; font: .7rem "Favorit Mono", monospace; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
.casos-intro { max-width: 40rem; font-family: inherit; font-size: 1rem; line-height: 1.6; letter-spacing: 0; text-transform: none; }
.caso-principal, .caso-galeria img { width: 100%; height: auto; aspect-ratio: 16 / 9; object-fit: cover; display: block; }
.caso section { display: grid; grid-template-columns: minmax(8rem, 1fr) 3fr; gap: 1rem 3rem; padding: 2.5rem 0; border-top: 1px solid var(--line); }
.caso section:first-of-type { margin-top: 2.5rem; }
.caso h2 { margin: 0; font: .7rem "Favorit Mono", monospace; letter-spacing: .14em; text-transform: uppercase; color: var(--blue); padding-top: .4rem; }
.caso p, .caso li { margin: 0; max-width: 46rem; font-size: 1.05rem; line-height: 1.65; color: rgba(240, 237, 230, .86); }
.caso ul { margin: 0; padding-left: 1.2rem; display: grid; gap: .75rem; }
.caso li::marker { color: var(--pink); }
.caso-galeria { display: grid; grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr)); gap: 1rem; margin: 1rem 0 2.5rem; }
.caso-cta { display: inline-block; margin: 1rem 0 2rem; padding: 1rem 1.5rem; border: 1px solid var(--paper); color: var(--paper); text-decoration: none; }
.caso-cta:hover, .caso-cta:focus-visible { background: var(--paper); color: var(--ink); }
.caso-volver { color: var(--muted); }
.casos-grilla { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr)); gap: 2rem 1.5rem; }
.casos-grilla a { display: grid; gap: .35rem; color: var(--paper); text-decoration: none; }
.casos-grilla img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; margin-bottom: .5rem; transition: opacity 200ms var(--ease-out); }
.casos-grilla a:hover img, .casos-grilla a:focus-visible img { opacity: .8; }
.casos-cliente, .casos-anio { font: .65rem "Favorit Mono", monospace; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
.casos-titulo { font-size: 1.25rem; letter-spacing: -.02em; line-height: 1.2; }
@media (max-width: 720px) { .caso section { grid-template-columns: 1fr; gap: .75rem; } }
```

- [ ] **Step 5: Run the whole suite**

Run: `node --test`
Expected: PASS, every file (the existing 13 plus the new ones). `test/paginas.test.mjs` «for now only the home is a destination» still passes because `PAGINAS` stays `["index.html"]`.

- [ ] **Step 6: Commit**

```bash
git add build.mjs casos.css data/casos.json test/build.test.mjs test/fixtures
git commit -m "feat(casos): build validates and renders case pages, paginas.json and sitemap.xml"
```

---

### Task 6: Importer from the review decisions

**Files:**
- Modify: `herramientas/importar-revision.mjs`
- Test: `test/importar-revision.test.mjs` (extend)

Input `decisiones.json` is an object keyed by slug, exported by the controller from the review page's `decisiones` collection: `{ "<slug>": { elegido, permisoFotos, fotos: [frameIndex], titulo, aprendizajes: [..], aprobado, nota } }`.

- [ ] **Step 1: Write the failing tests** (append to `test/importar-revision.test.mjs`; also extend its import line to `import { armarCasos, copiasDeFotos, oracion } from "../herramientas/importar-revision.mjs";`)

```js
const ficha = (cambios = {}) => ({
  slug: "copec-85",
  client: "Copec",
  title: "ANIVERSARIO 85",
  year: 2019,
  country: "Chile",
  city: "Santiago",
  industry: "Energía",
  workTypes: ["Evento corporativo"],
  capabilities: ["x"],
  summary: "Resumen.",
  role: "Rol.",
  citableClaim: "Frase.",
  era: "trayectoria",
  exception: null,
  ...cambios,
});
const decision = (cambios = {}) => ({
  elegido: true,
  permisoFotos: true,
  fotos: [0, 3],
  titulo: "Aniversario 85 de Copec",
  aprendizajes: [" Uno. ", "Dos.", ""],
  aprobado: true,
  nota: "",
  ...cambios,
});

test("armarCasos keeps only chosen and approved cases, with the site's fields", () => {
  const casos = armarCasos([ficha(), ficha({ slug: "otro" }), ficha({ slug: "sin-aprobar" })], {
    "copec-85": decision(),
    otro: decision({ elegido: false }),
    "sin-aprobar": decision({ aprobado: false }),
  });
  assert.deepEqual(casos, [
    {
      slug: "copec-85",
      client: "Copec",
      title: "Aniversario 85 de Copec",
      year: 2019,
      country: "Chile",
      industry: "Energía",
      workTypes: ["Evento corporativo"],
      summary: "Resumen.",
      role: "Rol.",
      era: "trayectoria",
      exception: null,
      aprendizajes: ["Uno.", "Dos."],
      fotos: ["/assets/casos/copec-85/1.webp", "/assets/casos/copec-85/2.webp"],
      permisoFotos: true,
    },
  ]);
});

test("armarCasos falls back to the sentence-case title and sorts newest first", () => {
  const casos = armarCasos([ficha({ slug: "a", year: 2012 }), ficha({ slug: "b", year: 2020 })], {
    a: decision({ titulo: "  " }),
    b: decision(),
  });
  assert.deepEqual(casos.map((c) => [c.slug, c.title]), [["b", "Aniversario 85 de Copec"], ["a", "Aniversario 85"]]);
});

test("copiasDeFotos maps chosen frames to numbered webp files", () => {
  assert.deepEqual(copiasDeFotos(["copec-85"], { "copec-85": decision() }, "/frames"), [
    { desde: "/frames/copec-85/frames/frame-0.jpg", hacia: "assets/casos/copec-85/1.webp" },
    { desde: "/frames/copec-85/frames/frame-3.jpg", hacia: "assets/casos/copec-85/2.webp" },
  ]);
});
```

- [ ] **Step 2: Run them**

Run: `node --test test/importar-revision.test.mjs`
Expected: FAIL, `armarCasos` is not exported.

- [ ] **Step 3: Implement** (full file)

`herramientas/importar-revision.mjs`:

```js
// Turns Federico's decisions from the review page into data/casos.json and the case photos.
// Usage: node herramientas/importar-revision.mjs <casos.json de PostIA> <wav-repository/data/cases> <decisiones.json>
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { validarCasos } from "../casos-validar.mjs";

export function oracion(texto) {
  const s = texto.trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const publicable = (d) => d?.elegido === true && d?.aprobado === true;

export function armarCasos(fichas, decisiones) {
  return fichas
    .filter((f) => publicable(decisiones[f.slug]))
    .map((f) => {
      const d = decisiones[f.slug];
      return {
        slug: f.slug,
        client: f.client,
        title: d.titulo?.trim() || oracion(f.title),
        year: f.year,
        country: f.country,
        industry: f.industry,
        workTypes: f.workTypes,
        summary: f.summary,
        role: f.role,
        era: f.era,
        exception: f.exception,
        aprendizajes: d.aprendizajes.map((a) => a.trim()).filter(Boolean),
        fotos: d.fotos.map((_, i) => `/assets/casos/${f.slug}/${i + 1}.webp`),
        permisoFotos: d.permisoFotos === true,
      };
    })
    .sort((a, b) => b.year - a.year || a.client.localeCompare(b.client, "es"));
}

export function copiasDeFotos(slugs, decisiones, framesDir) {
  return slugs.flatMap((slug) =>
    decisiones[slug].fotos.map((n, i) => ({
      desde: `${framesDir}/${slug}/frames/frame-${n}.jpg`,
      hacia: `assets/casos/${slug}/${i + 1}.webp`,
    })),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [fichasPath, framesDir, decisionesPath] = process.argv.slice(2);
  const { cases } = JSON.parse(readFileSync(fichasPath, "utf8"));
  const decisiones = JSON.parse(readFileSync(decisionesPath, "utf8"));
  const casos = armarCasos(cases, decisiones);
  validarCasos(casos);
  for (const { desde, hacia } of copiasDeFotos(casos.map((c) => c.slug), decisiones, framesDir)) {
    mkdirSync(dirname(hacia), { recursive: true });
    execFileSync("cwebp", ["-quiet", "-q", "80", desde, "-o", hacia]);
  }
  writeFileSync("data/casos.json", `${JSON.stringify(casos, null, 2)}\n`);
  console.log(`${casos.length} casos → data/casos.json`);
}
```

- [ ] **Step 4: Run them**

Run: `node --test`
Expected: PASS, all files.

- [ ] **Step 5: Commit**

```bash
git add herramientas/importar-revision.mjs test/importar-revision.test.mjs
git commit -m "feat(casos): import the review decisions into data/casos.json and webp photos"
```

---

### Task 7: Lesson drafts and Federico's round 2 — controller task

Starts when Federico says round 1 is done.

- [ ] **Step 1: Read his choices**

`ArtifactData` `list` on the review artifact, collection `decisiones`. Keep the slugs with `elegido: true`. If fewer than 15 or more than 25, tell Federico the count and ask whether to continue; otherwise continue.

- [ ] **Step 2: Draft 2-3 lessons per chosen case**

From that case's `summary`, `role` and `capabilities` in POSTIA `data/casos/casos.json`, and Federico's `nota` if any. Rules for each lesson:
- One sentence, at most 25 words, a lesson someone planning an event can use («Un auspicio funciona cuando…»), not a repeat of the summary.
- Never «WAV» as subject, never amounts, budgets or prices, no invented numbers or results that are not in the case data.
- Spanish, no em dash.

Write them with one `ArtifactData` `batch` of `set` operations on `borradores/<slug>` with body `{ "aprendizajes": ["…", "…"] }`. The page shows them live in each chosen card.

- [ ] **Step 3: Ask Federico for round 2**

Message: «Ya están los aprendizajes propuestos en cada caso elegido. Corrígelos ahí mismo y marca "Apruebo este caso tal como está".»

- [ ] **Step 4: Export the decisions** (when he says he is done)

`ArtifactData` `list` of `decisiones`; write `{ "<id>": <data> }` for every document to `$SCRATCH/decisiones.json` (scratchpad, not the repo: it is working data, the repo keeps only `data/casos.json`).

---

### Task 8: Fill the section, link it from the home, verify — controller with subagent

**Files:**
- Modify: `data/casos.json`, `assets/casos/**` (generated), `index.html`, `test/paginas-html.test.mjs`, possibly `casos-plantillas.mjs` (intro copy)

- [ ] **Step 1: Import**

```bash
cd ~/Projects/wav-web2
node herramientas/importar-revision.mjs ../POSTIA/data/casos/casos.json ../wav-repository/data/cases "$SCRATCH/decisiones.json"
du -sh assets/casos
```

Expected: `<n> casos → data/casos.json` with n = approved count; `assets/casos` well under 10 MB. If `validarCasos` throws, show Federico the exact messages and fix in the review page (round 2 again for those cases), never by editing `data/casos.json` by hand.

- [ ] **Step 2: Write the failing home-link test** (append to `test/paginas-html.test.mjs`)

```js
test("the home links to the Casos section from the menu and from Trabajo", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /<nav class="main-nav"[\s\S]*?<a href="\/casos\/" data-es="Casos" data-en="Cases">Casos<\/a>[\s\S]*?<\/nav>/);
  assert.match(html, /<a class="work-more" href="\/casos\/" data-es="Ver casos" data-en="See cases">Ver casos<\/a>/);
});
```

Run: `node --test test/paginas-html.test.mjs` → FAIL.

- [ ] **Step 3: Add the links**

In `index.html`, inside `<nav class="main-nav">`, after the «Trabajo» link:

```html
        <a href="/casos/" data-es="Casos" data-en="Cases">Casos</a>
```

After the closing `</div>` of `.project-grid` in `#trabajo`:

```html
        <a class="work-more" href="/casos/" data-es="Ver casos" data-en="See cases">Ver casos</a>
```

In `styles.css`, next to the work styles:

```css
.work-more { display: inline-block; margin-top: 2.5rem; font: .7rem "Favorit Mono", monospace; letter-spacing: .14em; text-transform: uppercase; color: var(--paper); border-bottom: 1px solid var(--blue); text-decoration: none; }
```

Run: `node --test` → PASS.

- [ ] **Step 4: Intro copy check**

If no case in `data/casos.json` has `era: "wav"`, change the index intro in `casos-plantillas.mjs` to «Proyectos que lideró Federico Elgueta antes de fundar WAV, con lo que aprendió en cada uno.» (update nothing else; run `node --test`).

- [ ] **Step 5: Build and check in a real browser**

```bash
node build.mjs
```

Start POSTIA preview «wav-web2». Check at 375 px and desktop: `/casos/`, two case pages (one with gallery, one with a single photo), the home menu «Casos» and «Ver casos» (ES and EN), `?utm_content=k7m` on a case page gives «Hola WAV, vi «<Cliente> · <Título>» … (ref. K7M)», no console errors, no horizontal scroll. Screenshot `/casos/` and one case for Federico.

- [ ] **Step 6: Content gate before commit**

```bash
grep -niE '\bWAV\b|\$|presupuesto|CLP' data/casos.json
```

Expected: no lines (every chosen case is trajectory, so «WAV» must not appear; never amounts). This repeats the build rules on the final file as a second, independent check.

- [ ] **Step 7: Commit**

```bash
git add data/casos.json assets/casos index.html styles.css casos-plantillas.mjs test/paginas-html.test.mjs
git commit -m "feat(casos): publish the chosen cases and link them from the home"
```

---

### Task 9: PR and deploy — gated

- [ ] **Step 1: Final review** of the whole branch diff (subagent code reviewer), fix findings with tests.
- [ ] **Step 2: Ask Federico** to open the PR; on yes: `git push -u origin casos` and `gh pr create` (body ends with «🤖 Generated with [Claude Code](https://claude.com/claude-code)»).
- [ ] **Step 3: Ask Federico** to merge and deploy; on yes: `gh pr merge --merge`, `git checkout main && git pull`, `node --test`, `pnpm build && pnpm deploy`.
- [ ] **Step 4: Verify live** with cache-bust: `/casos/` 200, one case 200, `/sitemap.xml` and `/robots.txt` 200, `paginas.json` lists home + `/casos/` + every case, `?utm_content=k7m` on a case page writes «ref. K7M» into WhatsApp.
- [ ] **Step 5:** Update POSTIA memory `postia-y-webs.md`: step 2 live; next is step 3 (PostIA destino, código y enlace).
