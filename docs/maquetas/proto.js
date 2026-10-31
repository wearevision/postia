/* Prototipo del flujo de firma de PostIA. Datos de ejemplo; nada sale de este navegador. */
const ICONOS = __ICONOS__;
const ic = (n, relleno) => `<svg class="i" viewBox="0 0 24 24" fill="${relleno ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[n]}</svg>`;

const params = new URLSearchParams(location.search);
const FALLAR_PRIMERA_VEZ = params.get('error') === '1';

const LAMINAS = [
  { t: 'Tres señales de que tu evento necesita medir', inicial: true },
  { t: '1. Nadie sabe qué debería cambiar después' },
  { t: '2. El éxito se define al terminar' },
  { t: '3. Nadie decide con lo que midió' },
  { t: 'Define qué vas a medir antes de producir' },
  { t: 'WAV · estudio de eventos' },
];
const TEXTO = [
  'Antes de producir, define qué vas a medir. Si la respuesta llega después del evento, ya llegó tarde.',
  '1. Nadie sabe qué debería cambiar después.',
  '2. El éxito se define al terminar.',
  '3. Nadie decide con lo que midió.',
];

const piezas = {
  wav_mar: { cuenta: 'WAV', pagina: 'WAV · página', dia: 'mar 3 nov', hora: '15:00', titulo: 'Tres señales de que tu evento necesita medir antes de producir.', estado: 'pend', huella: '7f3a·c91e·04b2' },
  fed_mie: { cuenta: 'Federico', pagina: 'Federico', dia: 'mié 4 nov', hora: '11:00', titulo: 'Lo que dejó una semana de entrevistas: cinco hallazgos que cambiaron cómo moderamos.', estado: 'pend', huella: '2b81·0de4·9a17' },
  fed_jue: { cuenta: 'Federico', pagina: 'Federico', dia: 'jue 5 nov', hora: '11:00', titulo: 'Tres preguntas que cambian un focus group antes de que empiece.', estado: 'pend', huella: 'c0d9·51aa·7e63' },
};
const ORDEN = ['wav_mar', 'fed_mie', 'fed_jue'];
const vistas = {};          // id -> Set de láminas vistas
const caida = {};           // id -> true si la firma se cayó por cambiar el texto
let estado = { vista: 'inicio', id: null, firmando: false, falloUsado: false, hoja: false, secuencia: false };
let toastTimer = null;

const pendientes = () => ORDEN.filter(id => piezas[id].estado === 'pend');
const firmadas = () => ORDEN.filter(id => piezas[id].estado === 'firmada');
const app = document.getElementById('app');
const sal = p => `${p.dia}, ${p.hora}`;

const est = {
  pend: t => `<span class="est pend"><i class="pt"></i>${t || 'Por firmar'}</span>`,
  ok: t => `<span class="est ok">${ic('check')}${t || 'Firmada'}</span>`,
  mal: t => `<span class="est mal">${ic('alerta', true)}${t}</span>`,
};
const gasto = () => `<button class="gasto" type="button" aria-label="Gasto del mes: 33,60 de 40 dólares, pasaste el 80 % del tope"><span class="dato">US$33,60 de 40</span><i class="tope"><b style="--w:84%"></b></i></button>`;
const cabeza = (volver, titulo) => volver
  ? `<header class="top"><div class="atras"><button class="icb" data-act="volver" aria-label="Volver">${ic('izq')}</button><span class="etiqueta apagado">${titulo}</span></div>${gasto()}</header>`
  : `<header class="top"><svg class="logo" role="img" aria-label="PostIA"><use href="#logo"/></svg>${gasto()}</header>`;
const nav = () => `<nav class="nav fija" aria-label="Principal">${[['inicio', 'Inicio', 1], ['nueva', 'Nueva'], ['calendario', 'Calendario'], ['marcas', 'Marcas'], ['ajustes', 'Ajustes']].map(([k, t, on]) => `<a href="#" class="nav-i${on ? ' on' : ''}"${on ? ' aria-current="page"' : ''} data-act="otro">${ic(k)}<span>${t}</span></a>`).join('')}</nav>`;

const fila = (id, sig) => {
  const p = piezas[id];
  return `<li><a href="#" class="fila" data-act="abrir" data-id="${id}"><div class="meta"><b class="cuenta">${p.cuenta}</b>${sig ? '<span class="sig">Siguiente</span>' : ''}<span class="dato apagado">${p.dia}</span></div><p class="cuerpo">${p.titulo}</p><div class="pie"><span class="dato">Sale ${sal(p)}</span>${ic('der')}</div></a></li>`;
};

/* ---------- vistas ---------- */
const vistasHtml = {
  inicio() {
    const pend = pendientes();
    const hechas = firmadas().length;
    if (!pend.length) {
      return `<div class="app con-nav">${cabeza()}<h1 class="display">Lunes 2 de noviembre</h1>
<div class="vacio"><p class="titulo">Nada por firmar</p><p class="cuerpo">Firmaste las 3 de esta ronda.<br><span class="apagado">Las ${hechas} salen en su día y hora.</span></p>
<ul class="reserva">${firmadas().map(id => `<li><span class="cuenta">${piezas[id].cuenta} · ${piezas[id].dia}</span>${est.ok('Firmada')}</li>`).join('')}</ul></div>
<p class="texto-sm apagado">El próximo turno abre mañana a las 8:00.</p></div>${nav()}`;
    }
    return `<div class="app con-nav">${cabeza()}<h1 class="display">Lunes 2 de noviembre</h1>
<div class="ventana"><p class="cuerpo">Turno de la mañana abierto hasta las <b>12:00</b>.<br><span class="apagado">Esta semana: ${2 + hechas} de 6 firmadas.</span></p>
<p class="aviso"><span class="icono-aviso">${ic('alerta')}</span><span>Pasaste el 80 % del tope del mes.</span></p>
<button class="btn prim" type="button" data-act="secuencia">Firmar ${pend.length === 1 ? 'la última' : `las ${pend.length} en secuencia`}</button></div>
<section><h2 class="sec-t">Por firmar<span class="dato">${pend.length}</span></h2><ul class="lista">${pend.map((id, i) => fila(id, i === 0)).join('')}</ul></section></div>${nav()}`;
  },

  pieza() {
    const p = piezas[estado.id];
    const pos = ORDEN.indexOf(estado.id) + 1;
    const vis = (vistas[estado.id] ||= new Set());
    const aviso = caida[estado.id] ? `<div class="aviso-cae" role="status">${ic('alerta', true)}<span>Cambiaste el texto: tu firma anterior se cayó. Hay que firmar esta versión de nuevo.</span></div>` : '';
    return `<div class="app con-cta">${cabeza(true, `Pieza ${pos} de 3`)}
<div class="meta"><b class="cuenta">${p.pagina}</b>${est.pend()}</div>
<h1 class="display h-pieza">${p.titulo}</h1>
<p class="dato">Sale ${sal(p)} · margen de 30 min</p>${aviso}
<div class="carrusel" id="carrusel" role="group" aria-label="Carrusel de 6 láminas" tabindex="0">${LAMINAS.map((l, i) => `<div class="lamina${l.inicial ? ' l1' : ''}" data-i="${i}"><span class="n">${i + 1}/6</span><b>${l.t}</b></div>`).join('')}</div>
<div class="visor"><div class="puntos" id="puntos" role="img" aria-label="Viste ${vis.size} de 6 láminas">${LAMINAS.map((_, i) => `<i class="${vis.has(i) ? 'v' : ''}"></i>`).join('')}</div><button class="enlace sin-estilo" type="button" data-act="juntas">${ic('rejilla')}Ver las 6 juntas</button></div>
<article class="texto"><h2 class="etiqueta apagado">Texto del post</h2>${TEXTO.map(t => `<p class="cuerpo">${t}</p>`).join('')}<p class="texto-sm apagado">Fuente: <a href="#" class="enlace-sm" data-act="otro">investigación del 24 oct</a></p></article>
<p class="nota"><span class="icono-aviso">${ic('info')}</span><span>Texto escrito con IA: puede tener errores. Léelo entero antes de firmar.</span></p>
<details class="detalles"><summary>Detalles de la firma${ic('abajo')}</summary>
<dl class="datos"><div><dt>Fecha y hora</dt><dd><span class="dato">${sal(p)}</span> <a href="#" class="enlace" data-act="otro">Cambiar fecha</a></dd></div><div><dt>${ic('huella')}Huella</dt><dd class="dato">${p.huella}</dd></div></dl>
<p class="ayuda">${ic('info')}<span>La huella identifica esta versión exacta. Si cambias el texto o la pieza, tu firma se cae.</span></p></details>
<div class="dos"><button class="btn sec" type="button" data-act="otro">Pedir otra versión</button><button class="btn sec" type="button" data-act="otro">Corregir texto</button></div>
<button class="descartar" type="button" data-act="descartar">Descartar pieza</button></div>
<div class="barra-fija" id="cta"></div>${estado.hoja ? hoja() : ''}`;
  },

  descartar() {
    const p = piezas[estado.id];
    return `<div class="app">${cabeza(true, 'Pieza')}<div class="meta"><b class="cuenta">${p.pagina}</b>${est.pend()}</div><h1 class="display h-pieza">${p.titulo}</h1>
<div class="confirmar" role="alertdialog" aria-labelledby="cd-t"><p class="titulo" id="cd-t">¿Descartar esta pieza?</p><p class="cuerpo apagado">Se borran el texto y la pieza. No se puede deshacer. Esta pieza no ha generado gasto.</p>
<div class="dos"><button class="btn prim" type="button" data-act="volver">Conservar pieza</button><button class="btn sec" type="button" data-act="descartar-ok">Descartar</button></div>
<button class="btn sec" type="button" data-act="otro">Mejor dejarla en la reserva</button></div></div>`;
  },

  error() {
    const p = piezas[estado.id];
    return `<div class="app">${cabeza(true, 'Pieza')}<div class="meta"><b class="cuenta">${p.pagina}</b>${est.pend()}</div><h1 class="display h-pieza">${p.titulo}</h1>
<div class="fallo" role="alert"><p class="est mal">${ic('wifi')}No se pudo guardar tu firma</p><p class="cuerpo">Sin conexión. Todavía no se publicó nada y tu texto está intacto.</p>
<button class="btn prim" type="button" data-act="firmar">Reintentar ahora</button><button class="btn sec" type="button" data-act="volver">Volver a la pieza</button></div>
<p class="texto-sm apagado">Si no vuelve la conexión antes del ${sal(p)}, la pieza no sale y vuelve a pedirse tu firma.</p></div>`;
  },

  firmada() {
    const p = piezas[estado.id];
    const sig = pendientes()[0];
    const ps = sig && piezas[sig];
    return `<div class="app con-cta">${cabeza(true, `Pieza ${ORDEN.indexOf(estado.id) + 1} de 3`)}<div class="meta"><b class="cuenta">${p.pagina}</b>${est.ok()}</div>
<h1 class="display h-pieza">${p.titulo}</h1><p class="dato">Sale ${sal(p)} · margen de 30 min</p>
<div class="aviso-ok" role="status"><p class="cuerpo"><b>Firmada.</b> Se publica exactamente esta versión (huella <span class="dato">${p.huella}</span>).</p>
<button class="btn sec chico" type="button" data-act="deshacer">${ic('deshacer')}Deshacer firma</button>
<p class="texto-sm apagado">Puedes deshacerla hasta las ${p.hora}, antes de que salga.</p></div>
<button class="btn sec" type="button" data-act="cambiar-texto">Corregir el texto (la firma se cae)</button>
${ps ? `<p class="cuerpo"><b>Sigue:</b> ${ps.cuenta} · ${sal(ps)}<br><span class="apagado">${pendientes().length} por firmar en esta ronda.</span></p>` : `<div class="vacio"><p class="titulo">Terminaste esta ronda</p><p class="cuerpo apagado">3 de 3 firmadas. La primera sale ${sal(piezas.wav_mar)}.</p></div>`}</div>
<div class="barra-fija">${ps ? `<button class="btn prim grande" type="button" data-act="abrir" data-id="${sig}">Firmar ${ps.cuenta} · ${sal(ps)}</button><a href="#" class="enlace centro" data-act="inicio">Listo por ahora</a>` : `<button class="btn prim grande" type="button" data-act="inicio">Volver a Inicio</button>`}</div>`;
  },
};

function hoja() {
  return `<div class="hoja" role="dialog" aria-label="Las 6 láminas"><h2 class="titulo">Las 6 láminas</h2><div class="rejilla-l">${LAMINAS.map((l, i) => `<div class="lamina${l.inicial ? ' l1' : ''}"><span class="n">${i + 1}/6</span><b>${l.t}</b></div>`).join('')}</div>
<div class="barra-fija"><button class="btn prim grande" type="button" id="listo" data-act="cerrar-juntas" disabled>Baja hasta ver las 6</button></div></div>`;
}

/* ---------- CTA fija de la pieza ---------- */
function pintarCta() {
  const cta = document.getElementById('cta');
  if (!cta) return;
  const p = piezas[estado.id];
  const n = (vistas[estado.id] || new Set()).size;
  const nombre = `Firmar ${p.cuenta} · ${sal(p)}`;
  if (estado.firmando) {
    cta.innerHTML = `<button class="btn prim grande" type="button" aria-busy="true" disabled>${ic('cargando')}Firmando…</button><p class="texto-sm centro apagado">No cierres esta pantalla.</p>`;
  } else if (n < 6) {
    cta.innerHTML = `<button class="btn prim grande" type="button" disabled>${ic('candado')}${nombre}</button><p class="texto-sm centro">Viste ${n} de 6 láminas. Faltan ${6 - n} por ver.</p>`;
  } else {
    cta.innerHTML = `<button class="btn prim grande" type="button" data-act="firmar">${nombre}</button><p class="texto-sm centro apagado">Firmar no genera gasto: texto y plantilla no cuestan.</p>`;
  }
}
function pintarVistas() {
  const vis = vistas[estado.id];
  const puntos = document.getElementById('puntos');
  if (!puntos) return;
  [...puntos.children].forEach((el, i) => el.classList.toggle('v', vis.has(i)));
  puntos.setAttribute('aria-label', `Viste ${vis.size} de 6 láminas`);
  pintarCta();
}
function observarCarrusel() {
  const c = document.getElementById('carrusel');
  if (!c) return;
  const vis = (vistas[estado.id] ||= new Set());
  const io = new IntersectionObserver(es => {
    es.forEach(e => { if (e.isIntersecting && e.intersectionRatio >= 0.9) vis.add(Number(e.target.dataset.i)); });
    pintarVistas();
  }, { root: c, threshold: [0.9, 1] });
  c.querySelectorAll('.lamina').forEach(l => io.observe(l));
}

/* ---------- acciones ---------- */
function avisar(msg) {
  document.querySelector('.toast')?.remove();
  clearTimeout(toastTimer);
  const t = document.createElement('div');
  t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
  document.body.append(t);
  toastTimer = setTimeout(() => t.remove(), 2400);
}
function ir(vista, id) {
  estado = { ...estado, vista, id: id ?? estado.id, firmando: false, hoja: false };
  render();
  window.scrollTo(0, 0);
}
function firmar() {
  const id = estado.id;
  if (estado.vista === 'error') { estado.vista = 'pieza'; render(); }
  estado.firmando = true;
  pintarCta();
  setTimeout(() => {
    estado.firmando = false;
    if (FALLAR_PRIMERA_VEZ && !estado.falloUsado) { estado.falloUsado = true; ir('error', id); return; }
    piezas[id].estado = 'firmada';
    delete caida[id];
    ir('firmada', id);
  }, 1100);
}
const acciones = {
  inicio: () => ir('inicio'),
  volver: () => (estado.vista === 'descartar' || estado.vista === 'error') ? ir('pieza') : ir('inicio'),
  abrir: el => ir('pieza', el.dataset.id),
  secuencia: () => ir('pieza', pendientes()[0]),
  descartar: () => ir('descartar'),
  'descartar-ok': () => { piezas[estado.id].estado = 'descartada'; ir('inicio'); avisar('Pieza descartada.'); },
  firmar,
  deshacer: () => { piezas[estado.id].estado = 'pend'; ir('pieza'); avisar('Firma deshecha. La pieza vuelve a «Por firmar».'); },
  'cambiar-texto': () => { const id = estado.id; piezas[id].estado = 'pend'; caida[id] = true; ir('pieza', id); },
  juntas: () => { estado.hoja = true; render(); },
  'cerrar-juntas': () => { const v = (vistas[estado.id] ||= new Set()); LAMINAS.forEach((_, i) => v.add(i)); estado.hoja = false; render(); },
  otro: () => avisar('Esta parte no está en el prototipo.'),
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  e.preventDefault();
  acciones[el.dataset.act]?.(el);
});

function render() {
  app.innerHTML = vistasHtml[estado.vista]();
  if (estado.vista === 'pieza') { observarCarrusel(); pintarCta(); }
  if (estado.hoja) vigilarHoja();
}
function vigilarHoja() {
  const h = document.querySelector('.hoja');
  const listo = document.getElementById('listo');
  const revisar = () => {
    const fin = h.scrollTop + h.clientHeight >= h.scrollHeight - 8;
    listo.disabled = !fin;
    listo.textContent = fin ? 'Listo, las vi' : 'Baja hasta ver las 6';
  };
  h.addEventListener('scroll', revisar, { passive: true });
  revisar();
}
render();
