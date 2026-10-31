// Ported from wr3-web scripts/carousels.mjs (Federico's design). Every CSS value is kept byte-for-byte;
// only the font URLs come from a function, because the renderer passes data: URLs instead of a directory.

export type Familia = "wr3" | "wav" | "personal"
export type UrlDeFuente = (archivo: string) => string

export const ARCHIVOS_DE_FUENTES = [
  "bricolage-grotesque-latin-wdth-normal.woff2",
  "inter-tight-latin-wght-normal.woff2",
  "jetbrains-mono-latin-wght-normal.woff2",
  "instrument-serif-latin-400-normal.woff2",
  "instrument-serif-latin-400-italic.woff2",
] as const

export function caraDeFuentes(url: UrlDeFuente): string {
  return `
@font-face { font-family: "Bricolage Grotesque"; font-weight: 200 800; font-stretch: 75% 100%; src: url(${url("bricolage-grotesque-latin-wdth-normal.woff2")}) format("woff2-variations"); }
@font-face { font-family: "Inter Tight"; font-weight: 100 900; src: url(${url("inter-tight-latin-wght-normal.woff2")}) format("woff2-variations"); }
@font-face { font-family: "JetBrains Mono"; font-weight: 100 800; src: url(${url("jetbrains-mono-latin-wght-normal.woff2")}) format("woff2-variations"); }`
}

// The WAV logo path (wav-credenciales/brand/wav-logo.svg); its radial brand gradient is defined once per page.
export const WAV_LOGO =
  "M115.645 255.989L151.702 71.2373L151.658 71H220.923L220.854 71.3623L292.947 441H220.784L186.277 256.305L151.75 440.989L151.753 441H79.5371L79.5391 440.989L10.3672 71H79.541L115.645 255.989ZM434.333 441H362.121L326.606 251.043L306.984 356L271.228 172.787L291.094 71H362.121L434.333 441ZM448.358 356L412.602 172.788L432.468 71H501.642L448.358 356Z"

export interface Marca {
  fuentes: (url: UrlDeFuente) => string
  defs: string
  marca: string
  firma: string
}

export const MARCAS: Record<Familia, Marca> = {
  wr3: {
    fuentes: () => "",
    defs: "",
    marca: `<span class="brand">WAV Research</span><span class="tag">WR3</span>`,
    firma: "WAV Research · focus groups en Santiago de Chile",
  },
  wav: {
    fuentes: () => "",
    defs: `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <radialGradient id="wav-grad" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="matrix(-352.776 612.542 -831.666 -821.373 510.876 70.4506)">
    <stop offset="0" stop-color="#FF009B"/><stop offset="0.925531" stop-color="#00B4FF"/></radialGradient></defs></svg>`,
    marca: `<svg class="logo" viewBox="10 71 492 370" role="img" aria-label="We Are Vision"><path d="${WAV_LOGO}" fill="url(#wav-grad)"/></svg><span class="brand">We Are Vision</span>`,
    firma: "We Are Vision · Santiago de Chile",
  },
  // Federico's own feed: the WAV palette with an editorial serif, so it reads as a person, not the agency.
  personal: {
    fuentes: (url) => `
@font-face { font-family: "Instrument Serif"; font-weight: 400; src: url(${url("instrument-serif-latin-400-normal.woff2")}) format("woff2"); }
@font-face { font-family: "Instrument Serif"; font-weight: 400; font-style: italic; src: url(${url("instrument-serif-latin-400-italic.woff2")}) format("woff2"); }`,
    defs: "",
    marca: `<span class="monogram" aria-hidden="true">FE</span><span class="brand">Federico Elgueta Edwards</span>`,
    firma: "Federico Elgueta Edwards · We Are Vision",
  },
}

// WAV design system (wav-agency-web docs/DESIGN.md): magenta and cyan act as light, never as a tint;
// the 11.04 degree rake of the logo cuts the corner tab; underlines stay horizontal.
export const WAV_GRADIENT = "linear-gradient(90deg, #ff009b, #8a4cf0 50%, #00b4ff)"
export const compartidoWav = (t: string) => `
.theme-${t} .logo { width: 62px; height: 47px; align-self: center; }
.theme-${t} .top { align-items: center; }
.theme-${t} .slide::after { content: ""; position: absolute; top: 0; right: 88px; width: 132px; height: 52px;
  background: var(--tab); clip-path: polygon(0 0, 100% 0, calc(100% - 10px) 100%, -10px 100%); }
.theme-${t} .progress, .theme-${t} .progress div, .theme-${t} .track, .theme-${t} .fill { border-radius: 0; }
.theme-${t} .progress div { background: var(--tab); }
.theme-${t} .bar.last .fill { background: ${WAV_GRADIENT}; }`

// Instrument Serif has one weight: headlines drop to 400 and grow instead of getting bolder.
export const compartidoPersonal = (t: string) => `
.theme-${t} { --display: "Instrument Serif", serif; }
.theme-${t} :is(.cover-title, .title, .statement, .cta-title, .figure, .mark) { font-weight: 400; letter-spacing: -.01em; }
.theme-${t} .cover-title { font-size: 132px; line-height: .94; }
.theme-${t} .title { font-size: 92px; line-height: .98; }
.theme-${t} .statement { font-style: italic; font-size: 104px; line-height: 1; }
.theme-${t} .cta-title { font-size: 124px; }
.theme-${t} .figure { font-size: 250px; }
.theme-${t} .figure.long { font-size: 200px; }
.theme-${t} .top { align-items: center; }
.theme-${t} .monogram { display: grid; place-items: center; width: 64px; height: 64px; border-radius: 50%;
  border: 2px solid var(--paper); font-family: var(--display); font-style: italic; font-size: 32px; line-height: 1; }
.theme-${t} .brand { font-family: var(--text); font-weight: 600; font-size: 28px; letter-spacing: 0; }
.theme-${t} .raised { box-shadow: none; border-radius: 0; }
.theme-${t} :is(.progress, .progress div, .track, .fill) { border-radius: 0; }`

// Base rules (carousels.mjs, from ":root {" through the ".sign" rule); themes only reassign the role tokens.
export const CSS_BASE = `:root {
  --ground: #11121a; --paper: #ede7db; --bone: #c7beaa; --hair: #2a2830; --pink: #ff009b;
  --raised-a: #15161f; --raised-b: #0e0f16; --mute: #8f8a9a;
  --display: "Bricolage Grotesque", sans-serif; --text: "Inter Tight", sans-serif; --mono: "JetBrains Mono", monospace;
  --shadow-raised: 14px 14px 30px rgba(0,0,0,.62), -10px -10px 26px rgba(255,255,255,.045);
  --slide-bg: radial-gradient(900px 700px at 100% 0%, rgba(255,0,155,.07), transparent 60%), var(--ground);
  --track: #0b0c12; --track-shadow: inset 4px 4px 8px rgba(0,0,0,.6); --fill: var(--mute);
}
* { margin: 0; box-sizing: border-box; }
html { background: #11121a; }
body { color: var(--paper); font-family: var(--text); -webkit-font-smoothing: antialiased; }
.slide { width: 1080px; height: 1350px; padding: 72px 88px 64px; display: flex; flex-direction: column;
  position: relative; overflow: hidden; break-after: page;
  background: var(--slide-bg); color: var(--paper); }
.top { display: flex; align-items: baseline; gap: 14px; }
.brand { font-family: var(--display); font-weight: 700; font-size: 34px; letter-spacing: -.01em; }
.tag { font-family: var(--mono); font-size: 20px; letter-spacing: .2em; color: var(--mute); }
.content { flex: 1; display: flex; flex-direction: column; justify-content: center; }
.foot { display: grid; grid-template-columns: 1fr auto; row-gap: 22px; font-family: var(--mono); font-size: 20px;
  letter-spacing: .16em; text-transform: uppercase; color: var(--mute); }
.progress { grid-column: 1 / -1; height: 4px; border-radius: 2px; background: var(--hair); }
.progress div { height: 100%; border-radius: 2px; background: var(--pink); }
.kicker { font-family: var(--mono); font-size: 24px; letter-spacing: .2em; text-transform: uppercase; color: var(--pink); margin-bottom: 40px; }
.cover-title { font-family: var(--display); font-weight: 650; font-size: 112px; line-height: .98; letter-spacing: -.03em; text-wrap: balance; }
.sub { font-size: 40px; line-height: 1.3; color: var(--bone); margin-top: 48px; max-width: 840px; text-wrap: pretty; }
.swipe { font-family: var(--mono); font-size: 24px; letter-spacing: .2em; text-transform: uppercase; color: var(--pink); margin-top: 96px; }
.step { font-family: var(--mono); font-size: 30px; letter-spacing: .14em; color: var(--pink); margin-bottom: 28px; }
.title { font-family: var(--display); font-weight: 650; font-size: 76px; line-height: 1.02; letter-spacing: -.025em; text-wrap: balance; margin-bottom: 52px; }
.body { font-size: 42px; line-height: 1.36; color: var(--bone); max-width: 880px; text-wrap: pretty; }
.raised { background: linear-gradient(145deg, var(--raised-a), var(--raised-b)); box-shadow: var(--shadow-raised); border-radius: 32px; }
.items { list-style: none; padding: 20px 48px; }
.items li { display: flex; gap: 32px; align-items: baseline; padding: 30px 0; font-size: 40px; line-height: 1.25; border-top: 1px solid var(--hair); }
.items li:first-child { border-top: 0; }
.idx { font-family: var(--mono); font-size: 24px; color: var(--pink); letter-spacing: .1em; flex: none; }
.table { padding: 16px 40px; }
.row { display: grid; grid-template-columns: 1.05fr 1fr 1fr; gap: 24px; padding: 30px 0; border-top: 1px solid var(--hair); font-size: 31px; line-height: 1.25; color: var(--bone); }
.row:first-child { border-top: 0; }
.row.head { font-family: var(--mono); font-size: 21px; letter-spacing: .14em; text-transform: uppercase; color: var(--pink); padding: 24px 0 18px; }
.rlabel { color: var(--paper); font-weight: 600; }
.figure { font-family: var(--display); font-weight: 700; font-size: 220px; line-height: .9; letter-spacing: -.04em; color: var(--pink); font-variant-numeric: tabular-nums; }
.figure.long { font-size: 176px; text-wrap: balance; }
.figure-label { font-family: var(--mono); font-size: 28px; letter-spacing: .16em; text-transform: uppercase; color: var(--paper); margin: 32px 0 56px; }
.bars { padding: 24px 48px; }
.bar { padding: 30px 0; border-top: 1px solid var(--hair); }
.bar:first-child { border-top: 0; }
.bar-head { display: flex; justify-content: space-between; gap: 24px; font-size: 34px; color: var(--bone); margin-bottom: 20px; }
.bar-value { font-family: var(--mono); color: var(--paper); }
.track { height: 20px; border-radius: 10px; background: var(--track); box-shadow: var(--track-shadow); }
.fill { height: 100%; border-radius: 10px; background: var(--fill); }
.bar.last .fill { background: var(--pink); }
.bar.last .bar-value { color: var(--pink); }
.mark { font-family: var(--display); font-size: 200px; line-height: .6; color: var(--pink); margin-bottom: 24px; }
.statement { font-family: var(--display); font-weight: 600; font-size: 88px; line-height: 1.04; letter-spacing: -.025em; text-wrap: balance; }
.note { font-size: 38px; line-height: 1.35; color: var(--bone); margin-top: 56px; max-width: 860px; text-wrap: pretty; }
.cta-title { font-family: var(--display); font-weight: 650; font-size: 104px; line-height: 1; letter-spacing: -.03em; }
.url { font-family: var(--mono); font-size: 27px; color: var(--paper); padding: 34px 40px; margin: 56px 0; }
.sign { font-family: var(--mono); font-size: 22px; letter-spacing: .14em; text-transform: uppercase; color: var(--pink); margin-top: 72px; }`
