# Webs: origen de la visita, páginas y enlaces cruzados — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Both websites publish a `paginas.json` for PostIA, turn a PostIA code (`?utm_content=k7m`) into WhatsApp text and a contact-form field, link to each other, and measure visits.

**Architecture:** Each site gets its own copy of `origen.js`, a dependency-free ES module that exports pure functions (tested with `node --test`) and, when loaded in a browser, rewrites `wa.me` links. Each build imports `tituloCorto` from that module to write `paginas.json`. No shared package: the two repos stay independent. Spec: `docs/superpowers/specs/2026-11-10-postia-y-webs-design.md` (Parte 3).

**Tech Stack:** static HTML, Node 24 (`node --test`), Cloudflare Workers static assets, Vitest + Playwright (WR3 only).

**Repos and branches** (create the branch before the first task in each repo):
- `~/Projects/wr3-web` (`wearevision/wr3-web`): `git switch -c origen-y-enlaces`
- `~/Projects/wav-web2` (`wearevision/wav-web2`): `git switch -c origen-y-enlaces`

**Gates (ask Federico, never assume):** pushing branches / opening PRs, `wrangler deploy` of either site, creating the Cloudflare Web Analytics site for wearevision.cl.

**Facts checked on 2026-11-10:**
- WR3 already loads Cloudflare Web Analytics on 88 of its pages (beacon token in the HTML, CSP allows it). Only wearevision.cl needs analytics.
- PostIA reads `paginas.json` from its server, not from a browser, so no CORS header is needed (spec updated).
- WR3 footers all contain `<span>WE ARE VISION · WAV RESEARCH</span>` (91 pages).
- WR3 `version-assets.mjs` stamps `?v=` on any `src="/x.js"`, so a new `/origen.js` gets versioned by the existing build.

## File structure

**wr3-web**
- Create `public/origen.js` — code validation, short title, WhatsApp text, browser wiring.
- Create `scripts/origen.test.mjs` — unit tests for `public/origen.js`.
- Create `scripts/paginas.mjs` + `scripts/paginas.test.mjs` — builds `public/paginas.json`.
- Create `scripts/add-origen.mjs` — one-off: adds the script tag and the WAV footer link to every page (idempotent, kept so new pages can be fixed by rerunning it).
- Create `scripts/pages-origen.test.mjs` — every page loads `origen.js` and links to wearevision.cl.
- Modify `src/contact.ts`, `src/bird.ts`, `test/contact.test.ts`, `test/bird.test.ts` — optional `ref` field in the email.
- Create `e2e/origen.spec.ts`.
- Modify `package.json` (build), `.gitignore` (`public/paginas.json`).

**wav-web2**
- Create `origen.js`, `test/origen.test.mjs`.
- Create `paginas.mjs`, `test/paginas.test.mjs`.
- Modify `build.mjs`, `index.html`, `politicasdeprivacidad.html`, `package.json`.

---

## Part A · wr3-web

### Task 1: `origen.js` pure functions

**Files:**
- Create: `~/Projects/wr3-web/public/origen.js`
- Test: `~/Projects/wr3-web/scripts/origen.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// scripts/origen.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  codigoDe,
  conMensaje,
  mensaje,
  origenDeLaVisita,
  tituloCorto,
} from "../public/origen.js";

test("accepts a 3-character code from the PostIA alphabet, case-insensitive", () => {
  assert.equal(codigoDe("?utm_source=linkedin&utm_content=k7m"), "k7m");
  assert.equal(codigoDe("?utm_content=K7M"), "k7m");
});

test("rejects codes with confusable characters, wrong length or missing", () => {
  for (const s of ["?utm_content=k0m", "?utm_content=kim", "?utm_content=k7", "?utm_content=k7mm", "", "?x=1"])
    assert.equal(codigoDe(s), null, s);
});

test("short title drops the brand segments of the page title", () => {
  assert.equal(tituloCorto("WAV Research · WR3 · Focus groups con evidencia"), "Focus groups con evidencia");
  assert.equal(
    tituloCorto("Focus group presencial u online: cuándo conviene cada uno · WAV Research"),
    "Focus group presencial u online: cuándo conviene cada uno",
  );
  assert.equal(tituloCorto("La reunión de 30 minutos · WAV Research · WR3"), "La reunión de 30 minutos");
  assert.equal(tituloCorto("WAV Research"), "");
});

test("WhatsApp text names the page and the code in Spanish", () => {
  assert.equal(
    mensaje({ titulo: "Insight: qué es y por qué importa", codigo: "k7m", lang: "es" }),
    "Hola, vi «Insight: qué es y por qué importa» y quiero conversar sobre un estudio (ref. K7M)",
  );
  assert.equal(
    mensaje({ titulo: "", codigo: "k7m", lang: "es" }),
    "Hola, quiero conversar sobre un estudio (ref. K7M)",
  );
});

test("WhatsApp text in English on English pages", () => {
  assert.equal(
    mensaje({ titulo: "Insight", codigo: "k7m", lang: "en" }),
    "Hi, I saw «Insight» and would like to talk about a study (ref. K7M)",
  );
});

test("rewrites only wa.me links, encoding spaces as %20", () => {
  const out = conMensaje("https://wa.me/56931994857?text=Hola", "Hola, vi «X» (ref. K7M)");
  assert.equal(out, `https://wa.me/56931994857?text=${encodeURIComponent("Hola, vi «X» (ref. K7M)")}`);
  assert.equal(conMensaje("https://wearevision.cl/", "x"), "https://wearevision.cl/");
});

test("a code in the URL wins; otherwise the stored origin of the visit is kept", () => {
  const guardado = { codigo: "abc", titulo: "Antes" };
  assert.deepEqual(origenDeLaVisita("?utm_content=k7m", "Ahora", guardado), { codigo: "k7m", titulo: "Ahora" });
  assert.deepEqual(origenDeLaVisita("", "Ahora", guardado), guardado);
  assert.equal(origenDeLaVisita("", "Ahora", null), null);
  assert.equal(origenDeLaVisita("", "Ahora", { codigo: "k0m", titulo: "x" }), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Projects/wr3-web && node --test scripts/origen.test.mjs`
Expected: FAIL, `Cannot find module '.../public/origen.js'`.

- [ ] **Step 3: Write the implementation**

```js
// public/origen.js
// PostIA puts a 3-character code in utm_content. This keeps it for the visit and writes it into the
// WhatsApp links and the contact form, so a conversation says which post brought it.
// Same alphabet as PostIA's codes and src/contact.ts: no 0/o, 1/l/i.
export const CODIGO = /^[23456789abcdefghjkmnpqrstuvwxyz]{3}$/;
const CLAVE = "wav-origen";
const MARCAS = new Set(["WAV Research", "WR3"]);

export function codigoDe(search) {
  const codigo = (new URLSearchParams(search).get("utm_content") ?? "").toLowerCase();
  return CODIGO.test(codigo) ? codigo : null;
}

export function tituloCorto(titulo) {
  return titulo
    .split(" · ")
    .map((parte) => parte.trim())
    .filter((parte) => parte && !MARCAS.has(parte))
    .join(" · ");
}

export function mensaje({ titulo, codigo, lang }) {
  const ref = `(ref. ${codigo.toUpperCase()})`;
  if (lang === "en")
    return titulo
      ? `Hi, I saw «${titulo}» and would like to talk about a study ${ref}`
      : `Hi, I would like to talk about a study ${ref}`;
  return titulo
    ? `Hola, vi «${titulo}» y quiero conversar sobre un estudio ${ref}`
    : `Hola, quiero conversar sobre un estudio ${ref}`;
}

// Built by hand: URLSearchParams would encode spaces as "+", which WhatsApp can show literally.
export function conMensaje(href, texto) {
  const url = new URL(href);
  if (url.hostname !== "wa.me") return href;
  return `${url.origin}${url.pathname}?text=${encodeURIComponent(texto)}`;
}

export function origenDeLaVisita(search, titulo, guardado) {
  const codigo = codigoDe(search);
  if (codigo) return { codigo, titulo };
  return guardado && CODIGO.test(guardado.codigo) ? guardado : null;
}

function leerGuardado() {
  try {
    const valor = JSON.parse(sessionStorage.getItem(CLAVE) ?? "null");
    return valor && typeof valor.codigo === "string" && typeof valor.titulo === "string" ? valor : null;
  } catch {
    // Storage blocked or a value that is not JSON: this visit has no stored origin.
    return null;
  }
}

function guardar(origen) {
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(origen));
  } catch {
    // Storage blocked (private mode): the code still applies to this page, just not to the next one.
  }
}

if (typeof document !== "undefined") {
  const origen = origenDeLaVisita(location.search, tituloCorto(document.title), leerGuardado());
  if (origen) {
    guardar(origen);
    const texto = mensaje({ ...origen, lang: document.documentElement.lang });
    for (const a of document.querySelectorAll('a[href^="https://wa.me/"]'))
      a.href = conMensaje(a.href, texto);
    for (const form of document.querySelectorAll("form")) {
      const ref = document.createElement("input");
      ref.type = "hidden";
      ref.name = "ref";
      ref.value = origen.codigo;
      form.append(ref);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/origen.test.mjs`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add public/origen.js scripts/origen.test.mjs
git commit -m "feat(origen): read PostIA's code and write it into WhatsApp links"
```

### Task 2: Load `origen.js` on every page and link the footer to wearevision.cl

**Files:**
- Create: `~/Projects/wr3-web/scripts/add-origen.mjs`
- Test: `~/Projects/wr3-web/scripts/pages-origen.test.mjs`
- Modify: every `public/**/*.html` outside `public/demo/` (done by the script)

- [ ] **Step 1: Write the failing test**

```js
// scripts/pages-origen.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { conOrigen } from "./add-origen.mjs";
import { htmlFiles } from "./version-assets.mjs";

const page = (lang) =>
  `<html lang="${lang}"><body><footer class="site-footer">\n    <span>WE ARE VISION · WAV RESEARCH</span>\n</footer>\n</body>\n</html>`;

test("adds the module script before </body> and the WAV link in the footer, in the page language", () => {
  const es = conOrigen(page("es"));
  assert.match(es, /<script type="module" src="\/origen.js"><\/script>\n<\/body>/);
  assert.match(es, /<span><a href="https:\/\/wearevision.cl\/">UN SERVICIO DE WE ARE VISION<\/a> · WAV RESEARCH<\/span>/);
  assert.match(conOrigen(page("en")), />A WE ARE VISION SERVICE<\/a> · WAV RESEARCH/);
});

test("running twice changes nothing", () => {
  const once = conOrigen(page("es"));
  assert.equal(conOrigen(once), once);
});

test("every public page loads origen.js and links to wearevision.cl", () => {
  for (const file of htmlFiles()) {
    const html = readFileSync(file, "utf8");
    assert.match(html, /<script type="module" src="\/origen.js(\?v=[0-9a-f]{8})?"><\/script>/, file);
    if (html.includes('class="site-footer"'))
      assert.match(html, /href="https:\/\/wearevision.cl\/"/, file);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/pages-origen.test.mjs`
Expected: FAIL, `Cannot find module './add-origen.mjs'`.

- [ ] **Step 3: Write the script**

```js
// scripts/add-origen.mjs
// Adds origen.js and the link to wearevision.cl to every public page. Idempotent: rerun it after
// adding a page. pages-origen.test.mjs fails if a page is missing either.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { htmlFiles } from "./version-assets.mjs";

const TAG = '<script type="module" src="/origen.js"></script>';
const MARCA = "<span>WE ARE VISION · WAV RESEARCH</span>";

export function conOrigen(html) {
  let out = html;
  if (!out.includes('src="/origen.js')) out = out.replace("</body>", `${TAG}\n</body>`);
  const texto = /<html lang="en"/.test(out) ? "A WE ARE VISION SERVICE" : "UN SERVICIO DE WE ARE VISION";
  return out.replace(MARCA, `<span><a href="https://wearevision.cl/">${texto}</a> · WAV RESEARCH</span>`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let changed = 0;
  for (const file of htmlFiles()) {
    const html = readFileSync(file, "utf8");
    const out = conOrigen(html);
    if (out !== html) {
      writeFileSync(file, out);
      changed++;
    }
  }
  console.log(`add-origen: ${changed} pages changed`);
}
```

- [ ] **Step 4: Run the script, stamp versions, run the tests**

Run:
```bash
node scripts/add-origen.mjs
node scripts/version-assets.mjs
node --test scripts/*.test.mjs
```
Expected: `add-origen: 94 pages changed` (every `htmlFiles()` page; the number may differ by a few, it must equal `find public -name '*.html' -not -path 'public/demo/*' | wc -l`), then all script tests PASS, including the existing `version-assets.test.mjs` and `page-meta.test.mjs`.

- [ ] **Step 5: Check the CSP still allows the module**

Run: `grep -n "script-src 'self'" public/_headers`
Expected: the `/*` rule contains `script-src 'self'` — same-origin modules are allowed, no change needed.

- [ ] **Step 6: Commit**

```bash
git add scripts/add-origen.mjs scripts/pages-origen.test.mjs public
git commit -m "feat(origen): load origen.js on every page and link the footer to wearevision.cl"
```

### Task 3: `paginas.json`

**Files:**
- Create: `~/Projects/wr3-web/scripts/paginas.mjs`
- Test: `~/Projects/wr3-web/scripts/paginas.test.mjs`
- Modify: `~/Projects/wr3-web/package.json` (build), `~/Projects/wr3-web/.gitignore`

- [ ] **Step 1: Write the failing test**

```js
// scripts/paginas.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { PUBLICAS, pagina, paginas } from "./paginas.mjs";

const html = (title, description) =>
  `<html lang="es"><head><title>${title}</title><meta name="description" content="${description}"></head></html>`;

test("a page becomes url, short title and topic", () => {
  assert.deepEqual(
    pagina(
      "guias/insight/index.html",
      html("Insight: qué es · WAV Research", "Qué es un insight &amp; cómo se usa"),
    ),
    {
      url: "https://wr3.wearevision.cl/guias/insight/",
      titulo: "Insight: qué es",
      tema: "Qué es un insight & cómo se usa",
    },
  );
});

test("the home keeps its root URL", () => {
  assert.equal(pagina("index.html", html("WAV Research · WR3 · Focus groups", "x")).url, "https://wr3.wearevision.cl/");
});

test("only public Spanish pages are listed", () => {
  for (const rel of ["en/guides/index.html", "404.html", "privacidad/index.html", "demo/index.html"])
    assert.equal(PUBLICAS(rel), false, rel);
  assert.equal(PUBLICAS("guias/como-medimos/index.html"), true);
});

test("the real site lists the guides and the meeting page, with titles", () => {
  const lista = paginas();
  const urls = lista.map((p) => p.url);
  assert.ok(urls.includes("https://wr3.wearevision.cl/guias/focus-group-presencial-u-online/"));
  assert.ok(urls.includes("https://wr3.wearevision.cl/reunion/"));
  assert.ok(lista.every((p) => p.titulo.length > 0 && !p.url.includes("/en/")));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/paginas.test.mjs`
Expected: FAIL, `Cannot find module './paginas.mjs'`.

- [ ] **Step 3: Write the implementation**

```js
// scripts/paginas.mjs
// Writes public/paginas.json: the pages PostIA can link a post to. Runs in `pnpm build`.
import { readFileSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { tituloCorto } from "../public/origen.js";
import { htmlFiles } from "./version-assets.mjs";

const SITIO = "https://wr3.wearevision.cl/";
const PUBLIC = fileURLToPath(new URL("../public", import.meta.url));
const FUERA = [/^en\//, /^404\.html$/, /^privacidad\//, /^demo\//];

export const PUBLICAS = (rel) => rel.endsWith("index.html") && !FUERA.some((r) => r.test(rel));

const texto = (s) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

export function pagina(rel, html) {
  const title = texto(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "");
  const tema = texto(html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "");
  return {
    url: SITIO + rel.replace(/index\.html$/, ""),
    titulo: tituloCorto(title) || title,
    tema,
  };
}

export function paginas() {
  return htmlFiles()
    .map((file) => relative(PUBLIC, file))
    .filter(PUBLICAS)
    .sort()
    .map((rel) => pagina(rel, readFileSync(`${PUBLIC}/${rel}`, "utf8")));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const lista = paginas();
  writeFileSync(`${PUBLIC}/paginas.json`, `${JSON.stringify(lista, null, 2)}\n`);
  console.log(`paginas: ${lista.length} pages`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/paginas.test.mjs`
Expected: PASS, 4 tests. If the third test fails because a page's `<meta name="description"` uses another attribute order, fix the regex to match that order rather than the page.

- [ ] **Step 5: Wire into the build and ignore the output**

In `package.json`, the `build` script becomes:
```
"build": "node scripts/copy-fonts.mjs && node scripts/version-assets.mjs && node scripts/llms-full.mjs && node scripts/paginas.mjs && node scripts/build-demo.mjs",
```
Append to `.gitignore`:
```
public/paginas.json
```
Run: `pnpm build && head -c 400 public/paginas.json`
Expected: build ends normally, `paginas: N pages` with N ≈ 45, JSON starts with `[` and the first entry has `url`, `titulo`, `tema`.

- [ ] **Step 6: Commit**

```bash
git add scripts/paginas.mjs scripts/paginas.test.mjs package.json .gitignore
git commit -m "feat(paginas): publish paginas.json with the pages PostIA can link to"
```

### Task 4: The contact form carries the code to the email

**Files:**
- Modify: `~/Projects/wr3-web/src/contact.ts`, `~/Projects/wr3-web/src/bird.ts`
- Test: `~/Projects/wr3-web/test/contact.test.ts`, `~/Projects/wr3-web/test/bird.test.ts`

- [ ] **Step 1: Write the failing tests**

In `test/contact.test.ts`, add `ref: ""` to the `good` fixture (after `plazo: "",`) and add:
```ts
  test("accepts an optional PostIA ref in lower case", () => {
    const r = validate({ ...good, ref: "K7M" });
    expect(r).toEqual({ ok: true, value: { ...good, ref: "k7m" } });
  });
  test("rejects a ref outside the PostIA alphabet", () => {
    const r = validate({ ...good, ref: "k0m" });
    expect(r).toEqual({ ok: false, errors: { ref: "invalid" } });
  });
```
In `test/bird.test.ts`, add `ref: ""` to the `c` fixture and add:
```ts
test("names the PostIA ref in upper case, or a dash without one", () => {
  expect(buildEmail({ ...c, ref: "k7m" }, env).text).toContain("Ref. de PostIA: K7M");
  expect(buildEmail(c, env).text).toContain("Ref. de PostIA: -");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run test/contact.test.ts test/bird.test.ts`
Expected: FAIL — `ref` missing from the validated value, and no «Ref. de PostIA» row.

- [ ] **Step 3: Implement**

In `src/contact.ts`:
- In `type Contact`, after `plazo: string;` add:
```ts
  /** Optional: PostIA's 3-character code from utm_content, or "" when the visit has none. */
  ref: string;
```
- Above `const LIMITS`, add:
```ts
// Same alphabet as public/origen.js and PostIA's codes: no 0/o, 1/l/i.
const REF = /^[23456789abcdefghjkmnpqrstuvwxyz]{3}$/;
```
- In `validate`, inside `value`, after `plazo: text("plazo"),` add `ref: text("ref").toLowerCase(),`
- After the `plazo` check, add:
```ts
  if (value.ref && !REF.test(value.ref)) errors.ref = "invalid";
```

In `src/bird.ts`, in `buildEmail` rows, after the «Para cuándo» row add:
```ts
    ["Ref. de PostIA", c.ref ? c.ref.toUpperCase() : "-"],
```

- [ ] **Step 4: Run all unit tests**

Run: `pnpm vitest run && pnpm biome check`
Expected: PASS; Biome clean (fix formatting with `pnpm biome check --write` — never `--unsafe`).

- [ ] **Step 5: Commit**

```bash
git add src/contact.ts src/bird.ts test/contact.test.ts test/bird.test.ts
git commit -m "feat(contact): carry PostIA's ref from the form to the email"
```

### Task 5: E2E — a visit with a code reaches WhatsApp and the form

**Files:**
- Create: `~/Projects/wr3-web/e2e/origen.spec.ts`

- [ ] **Step 1: Write the test**

```ts
import { expect, test } from "@playwright/test";

const textoDe = async (href: string | null) =>
  decodeURIComponent(new URL(href ?? "").searchParams.get("text") ?? "");

test("a visit from a PostIA post names the page and the code in WhatsApp", async ({ page }) => {
  await page.goto("/guias/focus-group-presencial-u-online/?utm_source=linkedin&utm_content=k7m");
  const href = await page.locator('a[href^="https://wa.me/"]').first().getAttribute("href");
  expect(await textoDe(href)).toBe(
    "Hola, vi «Focus group presencial u online: cuándo conviene cada uno» y quiero conversar sobre un estudio (ref. K7M)",
  );
});

test("the code survives moving to another page of the site", async ({ page }) => {
  await page.goto("/guias/focus-group-presencial-u-online/?utm_content=k7m");
  await page.goto("/reunion/");
  const href = await page.locator('a[href^="https://wa.me/"]').first().getAttribute("href");
  expect(await textoDe(href)).toContain("(ref. K7M)");
  await expect(page.locator('form input[name="ref"]')).toHaveValue("k7m");
});

test("without a code the WhatsApp links stay as they are", async ({ page }) => {
  await page.goto("/guias/focus-group-presencial-u-online/");
  const href = await page.locator('a[href^="https://wa.me/"]').first().getAttribute("href");
  expect(await textoDe(href)).not.toContain("ref.");
});

test("paginas.json is served and lists the guide", async ({ request }) => {
  const res = await request.get("/paginas.json");
  expect(res.ok()).toBe(true);
  const lista: { url: string }[] = await res.json();
  expect(lista.map((p) => p.url)).toContain(
    "https://wr3.wearevision.cl/guias/focus-group-presencial-u-online/",
  );
});
```

Note: `textoDe` decodes twice harmlessly (`searchParams` already decodes); keep it, it tolerates either encoding.

- [ ] **Step 2: Run it**

Run: `pnpm test:e2e e2e/origen.spec.ts --project=1280`
Expected: PASS, 4 tests. If `/reunion/` has no `<form>`, change the second test's form assertion to the page that holds the contact form (`grep -l 'name="estudio"' public/**/index.html`) and keep the WhatsApp assertion on `/reunion/`.

- [ ] **Step 3: Run the full suites**

Run: `pnpm test && pnpm test:scripts && pnpm test:e2e`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e/origen.spec.ts
git commit -m "test(e2e): a PostIA code reaches WhatsApp, the form and paginas.json"
```

---

## Part B · wav-web2

### Task 6: Test runner and `origen.js`

**Files:**
- Modify: `~/Projects/wav-web2/package.json`
- Create: `~/Projects/wav-web2/origen.js`
- Test: `~/Projects/wav-web2/test/origen.test.mjs`

- [ ] **Step 1: Add the test script and ES modules**

In `package.json`, add `"type": "module",` after `"private": true,` and add to `scripts`:
```
"test": "node --test test/"
```
`build.mjs` is already `.mjs`; `script.js` is browser-only and never imported by Node, so `"type": "module"` changes nothing for them.

- [ ] **Step 2: Write the failing test**

```js
// test/origen.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { codigoDe, conMensaje, mensaje, origenDeLaVisita, tituloCorto } from "../origen.js";

test("accepts a 3-character code from the PostIA alphabet, case-insensitive", () => {
  assert.equal(codigoDe("?utm_content=K7M"), "k7m");
  for (const s of ["?utm_content=k0m", "?utm_content=k7", "", "?x=1"]) assert.equal(codigoDe(s), null, s);
});

test("short title drops the WAV brand segments", () => {
  assert.equal(tituloCorto("WAV — We Are Vision"), "");
  assert.equal(tituloCorto("Política de privacidad — WAV We Are Vision"), "Política de privacidad");
  assert.equal(tituloCorto("Copec 85 años · Casos — WAV We Are Vision"), "Copec 85 años · Casos");
});

test("WhatsApp text speaks to WAV about a project", () => {
  assert.equal(
    mensaje({ titulo: "Copec 85 años", codigo: "k7m" }),
    "Hola WAV, vi «Copec 85 años» y quiero conversar sobre un proyecto (ref. K7M)",
  );
  assert.equal(mensaje({ titulo: "", codigo: "k7m" }), "Hola WAV, quiero conversar sobre un proyecto (ref. K7M)");
});

test("rewrites only wa.me links", () => {
  assert.equal(
    conMensaje("https://wa.me/56931994857?text=Hola", "Hola WAV (ref. K7M)"),
    `https://wa.me/56931994857?text=${encodeURIComponent("Hola WAV (ref. K7M)")}`,
  );
  assert.equal(conMensaje("tel:+56931994857", "x"), "tel:+56931994857");
});

test("a code in the URL wins; otherwise the stored origin is kept", () => {
  const guardado = { codigo: "abc", titulo: "Antes" };
  assert.deepEqual(origenDeLaVisita("?utm_content=k7m", "Ahora", guardado), { codigo: "k7m", titulo: "Ahora" });
  assert.deepEqual(origenDeLaVisita("", "Ahora", guardado), guardado);
  assert.equal(origenDeLaVisita("", "Ahora", null), null);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd ~/Projects/wav-web2 && node --test test/`
Expected: FAIL, `Cannot find module '.../origen.js'`.

- [ ] **Step 4: Write the implementation**

```js
// origen.js
// PostIA puts a 3-character code in utm_content. This keeps it for the visit and writes it into the
// WhatsApp links, so a conversation says which post brought it. Same alphabet as PostIA: no 0/o, 1/l/i.
export const CODIGO = /^[23456789abcdefghjkmnpqrstuvwxyz]{3}$/;
const CLAVE = "wav-origen";
const MARCAS = new Set(["WAV", "We Are Vision", "WAV We Are Vision"]);

export function codigoDe(search) {
  const codigo = (new URLSearchParams(search).get("utm_content") ?? "").toLowerCase();
  return CODIGO.test(codigo) ? codigo : null;
}

// Page titles end in " — WAV We Are Vision" (or are just "WAV — We Are Vision"): keep what is left.
export function tituloCorto(titulo) {
  return titulo
    .split(" — ")
    .map((parte) => parte.trim())
    .filter((parte) => parte && !MARCAS.has(parte))
    .join(" — ");
}

export function mensaje({ titulo, codigo }) {
  const ref = `(ref. ${codigo.toUpperCase()})`;
  return titulo
    ? `Hola WAV, vi «${titulo}» y quiero conversar sobre un proyecto ${ref}`
    : `Hola WAV, quiero conversar sobre un proyecto ${ref}`;
}

// Built by hand: URLSearchParams would encode spaces as "+", which WhatsApp can show literally.
export function conMensaje(href, texto) {
  if (!href.startsWith("https://wa.me/")) return href;
  const url = new URL(href);
  return `${url.origin}${url.pathname}?text=${encodeURIComponent(texto)}`;
}

export function origenDeLaVisita(search, titulo, guardado) {
  const codigo = codigoDe(search);
  if (codigo) return { codigo, titulo };
  return guardado && CODIGO.test(guardado.codigo) ? guardado : null;
}

function leerGuardado() {
  try {
    const valor = JSON.parse(sessionStorage.getItem(CLAVE) ?? "null");
    return valor && typeof valor.codigo === "string" && typeof valor.titulo === "string" ? valor : null;
  } catch {
    // Storage blocked or a value that is not JSON: this visit has no stored origin.
    return null;
  }
}

function guardar(origen) {
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(origen));
  } catch {
    // Storage blocked (private mode): the code still applies to this page, just not to the next one.
  }
}

if (typeof document !== "undefined") {
  const origen = origenDeLaVisita(location.search, tituloCorto(document.title), leerGuardado());
  if (origen) {
    guardar(origen);
    const texto = mensaje(origen);
    for (const a of document.querySelectorAll('a[href^="https://wa.me/"]'))
      a.href = conMensaje(a.href, texto);
  }
}
```

Note: `script.js` rewrites `document.title` when the visitor switches language; `origen.js` reads the title once at load, before any switch, so the WhatsApp text keeps the Spanish title. That is intended (posts are in Spanish).

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add package.json origen.js test/origen.test.mjs
git commit -m "feat(origen): read PostIA's code and write it into WhatsApp links"
```

### Task 7: `paginas.json` and the build

**Files:**
- Create: `~/Projects/wav-web2/paginas.mjs`
- Test: `~/Projects/wav-web2/test/paginas.test.mjs`
- Modify: `~/Projects/wav-web2/build.mjs`

- [ ] **Step 1: Write the failing test**

```js
// test/paginas.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { PAGINAS, pagina } from "../paginas.mjs";

test("the home is listed with its full title when the short one is empty", () => {
  const html = '<title>WAV — We Are Vision</title><meta name="description" content="Productora &amp; eventos" />';
  assert.deepEqual(pagina("index.html", html), {
    url: "https://wearevision.cl/",
    titulo: "WAV — We Are Vision",
    tema: "Productora & eventos",
  });
});

test("a page file becomes its folder URL", () => {
  const html = '<title>Copec 85 años — WAV We Are Vision</title><meta name="description" content="x" />';
  assert.equal(pagina("casos/copec-85/index.html", html).url, "https://wearevision.cl/casos/copec-85/");
  assert.equal(pagina("casos/copec-85/index.html", html).titulo, "Copec 85 años");
});

test("for now only the home is a destination (no privacy policy)", () => {
  assert.deepEqual(PAGINAS, ["index.html"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/`
Expected: FAIL, `Cannot find module '.../paginas.mjs'`.

- [ ] **Step 3: Write the implementation**

```js
// paginas.mjs
// The pages PostIA can link a post to, written to dist/paginas.json by build.mjs.
// The Casos section adds its pages here (spec 2026-11-10-postia-y-webs, Parte 1).
import { tituloCorto } from "./origen.js";

const SITIO = "https://wearevision.cl/";
export const PAGINAS = ["index.html"];

const texto = (s) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

export function pagina(rel, html) {
  const title = texto(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "");
  const tema = texto(html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "");
  return { url: SITIO + rel.replace(/index\.html$/, ""), titulo: tituloCorto(title) || title, tema };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/`
Expected: PASS, 8 tests in total.

- [ ] **Step 5: Wire into `build.mjs`**

Replace `build.mjs` with:
```js
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { PAGINAS, pagina } from "./paginas.mjs";

const output = new URL("./dist/", import.meta.url);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await Promise.all([
  cp(new URL("./index.html", import.meta.url), new URL("./index.html", output)),
  cp(new URL("./styles.css", import.meta.url), new URL("./styles.css", output)),
  cp(new URL("./script.js", import.meta.url), new URL("./script.js", output)),
  cp(new URL("./origen.js", import.meta.url), new URL("./origen.js", output)),
  cp(new URL("./politicasdeprivacidad.html", import.meta.url), new URL("./politicasdeprivacidad.html", output)),
  cp(new URL("./_redirects", import.meta.url), new URL("./_redirects", output)),
  cp(new URL("./assets/", import.meta.url), new URL("./assets/", output), { recursive: true }),
]);

const paginas = await Promise.all(
  PAGINAS.map(async (rel) => pagina(rel, await readFile(new URL(`./${rel}`, import.meta.url), "utf8"))),
);
await writeFile(new URL("./paginas.json", output), `${JSON.stringify(paginas, null, 2)}\n`);

console.log(`Static site built in dist/ (${paginas.length} pages in paginas.json)`);
```

Run: `node build.mjs && cat dist/paginas.json && ls dist/origen.js`
Expected: `Static site built in dist/ (1 pages in paginas.json)`, JSON with `https://wearevision.cl/`, and `dist/origen.js` exists.

- [ ] **Step 6: Commit**

```bash
git add paginas.mjs test/paginas.test.mjs build.mjs
git commit -m "feat(paginas): publish paginas.json and ship origen.js in the build"
```

### Task 8: Load `origen.js`, link to WR3, add analytics

**Files:**
- Modify: `~/Projects/wav-web2/index.html`, `~/Projects/wav-web2/politicasdeprivacidad.html`
- Test: `~/Projects/wav-web2/test/paginas-html.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// test/paginas-html.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

for (const file of ["index.html", "politicasdeprivacidad.html"]) {
  test(`${file} loads origen.js as a module and links to WR3`, () => {
    const html = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(html, /<script type="module" src="\/origen.js"><\/script>/);
    assert.match(html, /<a href="https:\/\/wr3.wearevision.cl\/"[^>]*>WR3 · Investigación<\/a>/);
  });
}

test("the services list names research and points to WR3", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /class="service-row reveal"><span>05<\/span>[\s\S]*?wr3.wearevision.cl/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/`
Expected: FAIL on the three new tests.

- [ ] **Step 3: Edit the HTML**

In both `index.html` and `politicasdeprivacidad.html`:
- After the existing `<script src="/script.js" defer></script>` line (in `politicasdeprivacidad.html`, after its last `<script` in `<head>`, or before `</head>` if it has none), add:
```html
    <script type="module" src="/origen.js"></script>
```
- In `<nav class="main-nav" aria-label="Secciones">`, as the last link, add:
```html
        <a href="https://wr3.wearevision.cl/" data-es="WR3 · Investigación" data-en="WR3 · Research">WR3 · Investigación</a>
```
In `politicasdeprivacidad.html`, if its nav links do not use `data-es`/`data-en`, drop those two attributes and keep the Spanish text.

In `index.html`, inside `<div class="service-list">`, after the `04` Guerrilla marketing row, add:
```html
          <div class="service-row reveal"><span>05</span><h3><a href="https://wr3.wearevision.cl/" data-es="Investigación · WR3" data-en="Research · WR3">Investigación · WR3</a></h3><p data-es="Focus groups con evidencia" data-en="Focus groups with evidence">Focus groups con evidencia</p></div>
```

- [ ] **Step 4: Run tests**

Run: `node --test test/`
Expected: PASS, 11 tests.

- [ ] **Step 5: Analytics — gate**

Ask Federico for the Cloudflare Web Analytics token of wearevision.cl, or for approval to create the site in the WAV Cloudflare account (Web Analytics → Add a site → `wearevision.cl`). The token is public by design (it ships in every page), so it can live in the HTML. Then add before `</body>` in both HTML files:
```html
    <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "<TOKEN FROM FEDERICO>"}'></script>
```
If Federico defers this, skip the step and record it as pending in the PR description; the rest of the task does not depend on it.

- [ ] **Step 6: Check in the browser**

Run `node build.mjs`, serve `dist/` (`python3 -m http.server 4173 --directory dist`, via the preview tooling, never killing other servers), open `http://localhost:4173/?utm_content=k7m`, and verify with `read_page`/`javascript_tool`:
- `document.querySelector('a[href^="https://wa.me/"]').href` decodes to `Hola WAV, quiero conversar sobre un proyecto (ref. K7M)`.
- The nav shows «WR3 · Investigación» and the services list shows row 05; switching to EN still renders both.
- No console errors.
Take one screenshot of the header and the services list.

- [ ] **Step 7: Commit**

```bash
git add index.html politicasdeprivacidad.html test/paginas-html.test.mjs
git commit -m "feat: load origen.js, link to WR3 from the menu and services"
```

---

## Finish

- [ ] Both repos: full suites green (`wr3-web`: `pnpm test && pnpm test:scripts && pnpm test:e2e && pnpm biome check`; `wav-web2`: `pnpm test`).
- [ ] Ask Federico before pushing each branch and opening its PR (both private repos).
- [ ] Ask Federico before `pnpm run deploy` on each site. After deploying, verify live: `curl -s https://wr3.wearevision.cl/paginas.json | head -c 200`, `curl -s https://wearevision.cl/paginas.json`, and that `https://wearevision.cl/origen.js` returns 200.
