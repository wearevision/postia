import { CSS_BASE, caraDeFuentes, MARCAS, type Marca, type UrlDeFuente } from "./estilos"
import type { Carrusel, Lamina } from "./laminas"
import { familiaDe, type IdDeTema, TEMAS } from "./temas"

const ENTIDADES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ENTIDADES[c] ?? c)
const dos = (n: number) => String(n).padStart(2, "0")
const porcentaje = (v: string) => Number.parseFloat(v.replace(",", "."))

/** wr3's slide kinds: the themes' CSS targets them (`.slide--cover`), so the section keeps wr3's names. */
const MODIFICADOR: Record<Lamina["tipo"], string> = {
  portada: "cover",
  punto: "point",
  lista: "list",
  comparacion: "compare",
  cifra: "stat",
  barras: "bars",
  frase: "statement",
  cierre: "cta",
}

function cuerpo(l: Lamina, antetitulo: string, marca: Marca): string {
  switch (l.tipo) {
    case "portada":
      return `<p class="kicker">${esc(antetitulo)}</p><h1 class="cover-title">${esc(l.titulo)}</h1><p class="sub">${esc(l.bajada)}</p><p class="swipe">Desliza <span aria-hidden="true">›››</span></p>`
    case "punto":
      return `${l.numero ? `<p class="step">${esc(l.numero)}</p>` : ""}<h2 class="title">${esc(l.titulo)}</h2><p class="body">${esc(l.cuerpo)}</p>`
    case "lista":
      return `<h2 class="title">${esc(l.titulo)}</h2><ol class="items raised">${l.items.map((it, i) => `<li><span class="idx">${dos(i + 1)}</span>${esc(it)}</li>`).join("")}</ol>`
    case "comparacion":
      return `<h2 class="title">${esc(l.titulo)}</h2><div class="table raised"><div class="row head"><span></span>${l.columnas.map((c) => `<span>${esc(c)}</span>`).join("")}</div>${l.filas
        .map(
          (f) =>
            `<div class="row"><span class="rlabel">${esc(f[0] ?? "")}</span>${f
              .slice(1)
              .map((v) => `<span>${esc(v)}</span>`)
              .join("")}</div>`,
        )
        .join("")}</div>`
    case "cifra":
      return `<p class="figure${l.cifra.length > 6 ? " long" : ""}">${esc(l.cifra)}</p><p class="figure-label">${esc(l.etiqueta)}</p><p class="body">${esc(l.cuerpo)}</p>`
    case "barras":
      return `<h2 class="title">${esc(l.titulo)}</h2><div class="bars raised">${l.barras.map((b, i, todas) => `<div class="bar${i === todas.length - 1 ? " last" : ""}"><div class="bar-head"><span>${esc(b.etiqueta)}</span><span class="bar-value">${esc(b.valor)}</span></div><div class="track"><div class="fill" style="width:${porcentaje(b.valor)}%"></div></div></div>`).join("")}</div>`
    case "frase":
      return `<p class="mark" aria-hidden="true">«</p><p class="statement">${esc(l.titulo)}</p><p class="note">${esc(l.nota)}</p>`
    case "cierre":
      return `<h2 class="cta-title">${esc(l.titulo)}</h2><p class="url raised">${esc(l.enlace).replace(/([/-])/g, "$1<wbr>")}</p><p class="body">${esc(l.cuerpo)}</p><p class="sign">${esc(marca.firma)}</p>`
  }
}

/** The carousel as one HTML page: one .slide section per slide, 1080x1350, in the theme's tokens. Pure. */
export function htmlDelCarrusel(c: { tema: IdDeTema } & Carrusel, fuente: UrlDeFuente): string {
  const tema = TEMAS[c.tema]
  const marca = MARCAS[familiaDe(c.tema)]
  const n = c.laminas.length
  const secciones = c.laminas
    .map(
      (l, i) => `<section class="slide slide--${MODIFICADOR[l.tipo]}">
  <header class="top">${marca.marca}</header>
  <div class="content">${cuerpo(l, c.antetitulo, marca)}</div>
  <footer class="foot"><div class="progress"><div style="width:${((i + 1) / n) * 100}%"></div></div><span class="kick">${i === 0 ? "" : esc(c.antetitulo)}</span><span class="count">${dos(i + 1)} / ${dos(n)}</span></footer>
</section>`,
    )
    .join("\n")
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Carrusel</title>
<style>
@page { size: 1080px 1350px; margin: 0; }${caraDeFuentes(fuente)}${marca.fuentes(fuente)}
${CSS_BASE}
${tema.css}
</style></head><body class="theme-${c.tema}">
${marca.defs}
${secciones}
</body></html>`
}
