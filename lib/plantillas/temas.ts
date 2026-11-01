import { compartidoPersonal, compartidoWav, type Familia, WAV_GRADIENT } from "./estilos"

export interface Tema {
  nombre: string
  familia: Familia
  css: string
}

// Port of wr3-web carousels.mjs `themes`, same ids and order. Each theme only reassigns the role tokens;
// .raised panels may re-scope them for their inside.
export const TEMAS = {
  oscura: { nombre: "WR3 oscura", familia: "wr3", css: "" },
  papel: {
    nombre: "WR3 papel",
    familia: "wr3",
    css: `
.theme-papel { --ground: #ede7db; --paper: #11121a; --bone: #3d3a45; --hair: #cfc6b4; --pink: #c2007a;
  --mute: #6b6676; --slide-bg: var(--ground); --track: #ddd5c4; --track-shadow: none; --fill: #8f8a9a; }
.theme-papel .raised { background: transparent; box-shadow: none; border: 2px solid var(--paper); border-radius: 0; }
.theme-papel .top { padding-bottom: 28px; border-bottom: 2px solid var(--paper); }
.theme-papel .bar.last .fill { background: #ff009b; }`,
  },
  magenta: {
    nombre: "WR3 magenta",
    familia: "wr3",
    css: `
.theme-magenta { --ground: #ff009b; --paper: #11121a; --bone: #2e0a20; --hair: rgba(17,18,26,.28); --pink: #11121a;
  --mute: #3d0828; --slide-bg: var(--ground); }
.theme-magenta .raised { --paper: #ede7db; --bone: #c7beaa; --hair: #2a2830; --pink: #ff009b; --mute: #8f8a9a;
  background: #11121a; box-shadow: 18px 18px 0 rgba(17,18,26,.22); border-radius: 0; color: var(--paper); }
.theme-magenta .slide--cover .cover-title, .theme-magenta .statement { font-weight: 750; }`,
  },
  "wav-noche": {
    nombre: "WAV noche",
    familia: "wav",
    css: `
.theme-wav-noche { --ground: #07070c; --paper: #ede7db; --bone: #c7beaa; --hair: #2a2830; --pink: #ff009b;
  --cool: #00b4ff; --mute: #9993a3; --tab: ${WAV_GRADIENT}; --track: #15141d; --track-shadow: none; --fill: #4a4752;
  --slide-bg: radial-gradient(760px 620px at 104% -4%, rgba(255,0,155,.16), transparent 62%),
    radial-gradient(820px 640px at -6% 106%, rgba(0,180,255,.12), transparent 64%), var(--ground); }
.theme-wav-noche .raised { background: #0f0e17; box-shadow: none; border: 1px solid #2a2830; border-radius: 0; }
.theme-wav-noche :is(.step, .idx, .row.head) { color: var(--cool); }
.theme-wav-noche .url { background: ${WAV_GRADIENT} left bottom / 100% 6px no-repeat; border: 0; padding: 0 0 22px; }
${compartidoWav("wav-noche")}`,
  },
  "wav-papel": {
    nombre: "WAV papel",
    familia: "wav",
    css: `
.theme-wav-papel { --ground: #ede7db; --paper: #07070c; --bone: #2a2830; --hair: #c7beaa; --pink: #c2007a;
  --cool: #006a9e; --mute: #6b6676; --tab: #07070c; --track: #ddd5c4; --track-shadow: none; --fill: #8f8a9a;
  --slide-bg: var(--ground); }
.theme-wav-papel .raised { background: transparent; box-shadow: none; border: 2px solid var(--paper); border-radius: 0; }
.theme-wav-papel .top { padding-bottom: 28px; border-bottom: 2px solid var(--paper); }
.theme-wav-papel :is(.step, .idx, .row.head) { color: var(--cool); }
.theme-wav-papel .url { background: ${WAV_GRADIENT} left bottom / 100% 6px no-repeat; border: 0; padding: 0 0 22px; }
${compartidoWav("wav-papel")}`,
  },
  "wav-degradado": {
    nombre: "WAV degradado",
    familia: "wav",
    css: `
.theme-wav-degradado { --ground: #8a4cf0; --paper: #07070c; --bone: #1d1426; --hair: rgba(7,7,12,.3); --pink: #07070c;
  --mute: #2a1838; --tab: #07070c; --slide-bg: linear-gradient(225deg, #ff009b 0%, #8a4cf0 50%, #00b4ff 92%); }
.theme-wav-degradado .logo path { fill: #07070c; }
.theme-wav-degradado .raised { --paper: #ede7db; --bone: #c7beaa; --hair: #2a2830; --pink: #ff009b; --mute: #9993a3;
  --cool: #00b4ff; background: #07070c; box-shadow: 18px 18px 0 rgba(7,7,12,.24); border-radius: 0; color: var(--paper); }
.theme-wav-degradado .raised :is(.idx, .row.head) { color: var(--cool); }
.theme-wav-degradado .slide--cover .cover-title, .theme-wav-degradado .statement { font-weight: 750; }
${compartidoWav("wav-degradado")}`,
  },
  "personal-claro": {
    nombre: "Personal claro",
    familia: "personal",
    css: `
.theme-personal-claro { --ground: #f4f1ea; --paper: #141317; --bone: #3a3740; --hair: #d6cfc1; --pink: #c2007a;
  --mute: #6b6676; --track: #e4ded2; --track-shadow: none; --fill: #9a95a3; --slide-bg: var(--ground); }
.theme-personal-claro .raised { background: transparent; border-top: 2px solid var(--paper); border-bottom: 2px solid var(--paper); }
${compartidoPersonal("personal-claro")}`,
  },
  "personal-grafito": {
    nombre: "Personal grafito",
    familia: "personal",
    css: `
.theme-personal-grafito { --ground: #1a1a1e; --paper: #f1ece2; --bone: #bdb6a8; --hair: #36353c; --pink: #ff009b;
  --mute: #8f8a9a; --track: #2a2a30; --track-shadow: none; --fill: #6b6876; --slide-bg: var(--ground); }
.theme-personal-grafito .raised { background: #222227; border: 1px solid var(--hair); }
${compartidoPersonal("personal-grafito")}`,
  },
  "personal-arena": {
    nombre: "Personal arena",
    familia: "personal",
    css: `
.theme-personal-arena { --ground: #c7beaa; --paper: #141317; --bone: #2f2b33; --hair: rgba(20,19,23,.25); --pink: #141317;
  --mute: #4a4550; --track: rgba(20,19,23,.14); --track-shadow: none; --fill: #6b6676; --slide-bg: var(--ground); }
.theme-personal-arena .raised { --paper: #f1ece2; --bone: #c7beaa; --hair: #36353c; --pink: #ff009b; --mute: #8f8a9a;
  --track: #2a2a30; --fill: #6b6876; background: #141317; color: var(--paper); }
.theme-personal-arena .monogram { background: var(--paper); color: var(--ground); }
${compartidoPersonal("personal-arena")}`,
  },
} as const satisfies Record<string, Tema>

export type IdDeTema = keyof typeof TEMAS
export const IDS_DE_TEMA = Object.keys(TEMAS) as IdDeTema[]

export const familiaDe = (tema: IdDeTema): Familia => TEMAS[tema].familia
export const esTema = (valor: string): valor is IdDeTema => Object.hasOwn(TEMAS, valor)

/** Mirrors SQL tema_de_la_voz (20261104120000_disenos.sql); an integration test keeps them equal. */
export function temasDeLaVoz(voz: "yo" | "nosotros"): IdDeTema[] {
  return IDS_DE_TEMA.filter((t) => (voz === "yo" ? familiaDe(t) === "personal" : familiaDe(t) !== "personal"))
}

/** Every theme can be chosen by hand for any account (SQL tema_conocido); the account's own family goes first. */
export function temasParaElegir(voz: "yo" | "nosotros"): IdDeTema[] {
  const propios = temasDeLaVoz(voz)
  return [...propios, ...IDS_DE_TEMA.filter((t) => !propios.includes(t))]
}
