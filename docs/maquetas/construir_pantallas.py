import re

from pathlib import Path

ROOT = str(Path(__file__).resolve().parents[2]) + "/"
logo = open(ROOT + "docs/logo/postia-logo.svg").read()
vb = re.search(r'viewBox="([^"]+)"', logo).group(1)
inner = re.search(r"<title>.*?</title>\n(.*)</svg>", logo, re.S).group(1)
inner = inner.replace('stroke="#ff00aa"', 'style="stroke:var(--logo-globo)"').replace('fill="#1e1b4b"', 'fill="currentColor"')
SYMBOL = f'<symbol id="logo" viewBox="{vb}">{inner}</symbol>'

ICONOS = {
    "inicio": '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    "nueva": '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/>',
    "calendario": '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
    "marcas": '<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
    "ajustes": '<path d="M21 4h-7"/><path d="M10 4H3"/><path d="M21 12h-9"/><path d="M8 12H3"/><path d="M21 20h-5"/><path d="M12 20H3"/><path d="M14 2v4"/><path d="M8 10v4"/><path d="M16 18v4"/>',
    "check": '<path d="M20 6 9 17l-5-5"/>',
    "alerta": '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    "reloj": '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    "izq": '<path d="m15 18-6-6 6-6"/>',
    "der": '<path d="m9 18 6-6-6-6"/>',
    "abajo": '<path d="m6 9 6 6 6-6"/>',
    "huella": '<path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/><path d="M14 13.12c0 2.38 0 6.38-1 8.88"/><path d="M17.29 21.02c.12-.6.43-2.3.5-3.02"/><path d="M2 12a10 10 0 0 1 18-6"/><path d="M21.8 16c.2-2 .131-5.354 0-6"/><path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2"/><path d="M8.65 22c.21-.66.45-1.32.57-2"/><path d="M9 6.8a6 6 0 0 1 9 5.2v2"/>',
    "info": '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    "deshacer": '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
    "menos": '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/>',
    "wifi": '<path d="M12 20h.01"/><path d="M8.5 16.4a5 5 0 0 1 7 0"/><path d="M5 12.9a10 10 0 0 1 14 0"/><path d="M2 8.8a15 15 0 0 1 20 0"/><path d="m2 2 20 20"/>',
    "candado": '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    "cargando": '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
    "rejilla": '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
}


def icon(n, relleno=False):
    f = "currentColor" if relleno else "none"
    return f'<svg class="i" viewBox="0 0 24 24" fill="{f}" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{ICONOS[n]}</svg>'


def nav(activa):
    items = [("inicio", "Inicio"), ("nueva", "Nueva"), ("calendario", "Calendario"), ("marcas", "Marcas"), ("ajustes", "Ajustes")]
    out = []
    for k, t in items:
        on = " on" if k == activa else ""
        cur = ' aria-current="page"' if k == activa else ""
        out.append(f'<a href="#" class="nav-i{on}"{cur}>{icon(k)}<span>{t}</span></a>')
    return '<nav class="nav" aria-label="Principal">' + "".join(out) + "</nav>"


# Un significado por color:
#   magenta = te toca actuar (pendiente, acción, ubicación actual)
#   cian    = resuelto
#   error   = triángulo lleno, texto en tinta y peso 700, sobre panel hundido
#   aviso   = triángulo vacío, texto en tinta (solo gasto y pilares)
#   neutro  = círculo con guion, texto apagado (sin resultado, sin cargo)
#   info    = círculo con i, texto en tinta (nota de IA)
# Vocabulario: turno = periodo del día en que se firma; cupo = hueco semanal de publicación;
# margen = los 30 min dentro de los que debe salir una pieza.
def est(tipo, texto=None):
    if tipo == "pend":
        return f'<span class="est pend"><i class="pt"></i>{texto or "Por firmar"}</span>'
    if tipo == "ok":
        return f'<span class="est ok">{icon("check")}{texto or "Firmada"}</span>'
    if tipo == "curso":
        return f'<span class="est">{icon("reloj")}{texto}</span>'
    if tipo == "mal":
        return f'<span class="est mal">{icon("alerta", True)}{texto}</span>'
    if tipo == "neutro":
        return f'<span class="est neutro">{icon("menos")}{texto}</span>'
    raise ValueError(tipo)


def pill_gasto(nivel=84):
    monto = {84: "33,60", 100: "40,00"}[nivel]
    texto = "pasaste el 80 % del tope" if nivel < 100 else "llegaste al tope"
    return f'<button class="gasto" type="button" aria-label="Gasto del mes: {monto} de 40 dólares, {texto}"><span class="dato">US${monto} de 40</span><i class="tope"><b style="--w:{nivel}%"></b></i></button>'


def header(izq="logo", titulo="", nivel=84):
    if izq == "logo":
        a = '<svg class="logo" role="img" aria-label="PostIA"><use href="#logo"/></svg>'
    else:
        a = f'<div class="atras"><a href="#" class="icb" aria-label="Volver">{icon("izq")}</a><span class="etiqueta apagado">{titulo}</span></div>'
    return f'<header class="top">{a}{pill_gasto(nivel)}</header>'


# Una sola tabla de datos de ejemplo. Hoy: lunes 2 de noviembre. Semana 2 a 8 nov, 6 cupos.
PIEZAS = {
    "wav_mar": dict(cuenta="WAV", dia="mar 3 nov", hora="15:00", titulo="Tres señales de que tu evento necesita medir antes de producir."),
    "fed_mie": dict(cuenta="Federico", dia="mié 4 nov", hora="11:00", titulo="Lo que dejó una semana de entrevistas: cinco hallazgos que cambiaron cómo moderamos."),
    "fed_jue": dict(cuenta="Federico", dia="jue 5 nov", hora="11:00", titulo="Tres preguntas que cambian un focus group antes de que empiece."),
    "fed_mar": dict(cuenta="Federico", dia="mar 3 nov", hora="11:00", titulo="Los focus groups no mueren: cambian de sala."),
    "wav_mie": dict(cuenta="WAV", dia="mié 4 nov", hora="15:00", titulo="Cómo se prepara un carrusel que se guarda."),
}


def fila(clave, siguiente=False):
    p = PIEZAS[clave]
    tag = '<span class="sig">Siguiente</span>' if siguiente else ""
    return f'<li><a href="#" class="fila"><div class="meta"><b class="cuenta">{p["cuenta"]}</b>{tag}<span class="dato apagado">{p["dia"]}</span></div><p class="cuerpo">{p["titulo"]}</p><div class="pie"><span class="dato">Sale {p["dia"]}, {p["hora"]}</span>{icon("der")}</div></a></li>'


def inicio():
    return f"""{header()}
<h1 class="display">Lunes 2 de noviembre</h1>
<section><h2 class="sec-t">Revisar<span class="dato">1</span></h2><ul class="lista"><li class="fila fija"><div class="meta"><b class="cuenta">WAV</b><span class="dato apagado">mié 28 oct · hace 5 días</span></div><p class="cuerpo">Qué pedirle a un focus group antes de empezar.</p>
{est('mal', 'No salió dentro de su margen de 30 min')}<p class="texto-sm">No se publica tarde: se vuelve a pedir tu firma.</p>
<button class="btn sec chico" type="button">Volver a firmar</button></li></ul></section>
<div class="ventana"><p class="cuerpo">Turno de la mañana abierto hasta las <b>12:00</b>.<br><span class="apagado">Esta semana: 2 de 6 firmadas.</span></p>
<p class="aviso"><span class="icono-aviso">{icon('alerta')}</span><span>Pasaste el 80 % del tope del mes.</span></p>
<button class="btn prim" type="button">Firmar las 3 en secuencia</button></div>
<section><h2 class="sec-t">Por firmar<span class="dato">3</span></h2><ul class="lista">
{fila('wav_mar', True)}{fila('fed_mie')}{fila('fed_jue')}</ul></section>
<section><h2 class="sec-t">Sin pieza<span class="dato">1</span></h2><ul class="lista"><li class="fila fija"><div class="meta"><b class="cuenta">WAV</b><span class="dato apagado">jue 5 nov</span></div><p class="cuerpo apagado">Cupo de las 15:00 sin pieza.</p><button class="btn sec chico" type="button">Asignar una pieza</button></li></ul></section>"""


def inicio_vacio():
    return f"""{header()}
<h1 class="display">Jueves 5 de noviembre</h1>
<div class="vacio"><p class="titulo">Nada por firmar</p>
<p class="cuerpo">El próximo turno abre el <b>lunes 9 a las 8:00</b>.<br><span class="apagado">Esta semana: 6 de 6 firmadas.</span></p>
<ul class="reserva"><li><span class="cuenta">WAV</span>{est('ok', 'Reserva lista')}</li><li><span class="cuenta">Federico</span>{est('pend', 'Reserva sin firmar')}</li></ul>
<p class="texto-sm apagado">La reserva es una semana firmada de antemano: sale sola si falta una firma.</p></div>
<button class="btn prim" type="button">Firmar reserva de Federico</button>
<button class="btn sec" type="button">Nueva pieza</button>"""


def cuerpo_pieza(abierto, visto, nivel=84):
    puntos = "".join(f'<i class="{"v" if k < visto else ""}"></i>' for k in range(6))
    det_abierto = " open" if abierto else ""
    ayuda = f'<p class="ayuda">{icon("info")}<span>La huella identifica esta versión exacta. Si cambias el texto o la pieza, tu firma se cae.</span></p>' if abierto else ""
    p = PIEZAS["wav_mar"]
    return f"""{header('volver', 'Pieza 1 de 3', nivel)}
<div class="meta"><b class="cuenta">WAV · página</b>{est('pend')}</div>
<h1 class="display h-pieza">{p['titulo']}</h1>
<p class="dato">Sale mar 3 nov, 15:00 · margen de 30 min</p>
<div class="laminas" role="group" aria-label="Carrusel de 6 láminas">
<div class="lamina l1"><span class="dato">1/6</span><b>Tres señales de que tu evento necesita medir</b></div>
<div class="lamina"><span class="dato">2/6</span><b>1. Nadie sabe qué debería cambiar después</b></div>
<div class="lamina"><span class="dato">3/6</span><b>2. El éxito se define al terminar</b></div></div>
<div class="visor"><div class="puntos" role="img" aria-label="Viste {visto} de 6 láminas">{puntos}</div><a href="#" class="enlace">{icon('rejilla')}Ver las 6 juntas</a></div>
<article class="texto"><h2 class="etiqueta apagado">Texto del post</h2>
<p class="cuerpo">Antes de producir, define qué vas a medir. Si la respuesta llega después del evento, ya llegó tarde.</p>
<p class="cuerpo">1. Nadie sabe qué debería cambiar después. 2. El éxito se define al terminar. 3. Nadie decide con lo que midió.</p>
<p class="texto-sm apagado">Fuente: <a href="#" class="enlace-sm">investigación del 24 oct</a></p></article>
<p class="nota"><span class="icono-aviso">{icon('info')}</span><span>Texto escrito con IA: puede tener errores. Léelo entero antes de firmar.</span></p>
<details class="detalles"{det_abierto}><summary>Detalles de la firma{icon('abajo')}</summary>
<dl class="datos"><div><dt>Fecha y hora</dt><dd><span class="dato">mar 3 nov, 15:00</span> <a href="#" class="enlace">Cambiar fecha</a></dd></div>
<div><dt>{icon('huella')}Huella</dt><dd class="dato">7f3a·c91e·04b2</dd></div></dl>{ayuda}</details>
<div class="dos"><button class="btn sec" type="button">Pedir otra versión</button><button class="btn sec" type="button">Corregir texto</button></div>
<button class="descartar" type="button">Descartar pieza</button>"""


def cta_pieza(visto, estado="normal"):
    sin_gasto = '<p class="texto-sm centro apagado">Firmar no genera gasto: texto y plantilla no cuestan.</p>'
    if estado == "firmando":
        return f'<button class="btn prim grande" type="button" aria-busy="true">{icon("cargando")}Firmando…</button><p class="texto-sm centro apagado">No cierres esta pantalla.</p>'
    if visto < 6:
        return f'<button class="btn prim grande" type="button" disabled>{icon("candado")}Firmar WAV · mar 3 nov, 15:00</button><p class="texto-sm centro">Viste {visto} de 6 láminas. Faltan {6 - visto} por ver.</p>'
    return f'<button class="btn prim grande" type="button">Firmar WAV · mar 3 nov, 15:00</button>{sin_gasto}'


def pieza_firmada():
    p = PIEZAS["wav_mar"]
    return f"""{header('volver', 'Pieza 1 de 3')}
<div class="meta"><b class="cuenta">WAV · página</b>{est('ok')}</div>
<h1 class="display h-pieza">{p['titulo']}</h1>
<p class="dato">Sale mar 3 nov, 15:00 · margen de 30 min</p>
<div class="aviso-ok" role="status"><p class="cuerpo"><b>Firmada.</b> Se publica exactamente esta versión (huella <span class="dato">7f3a·c91e·04b2</span>).</p>
<button class="btn sec chico" type="button">{icon('deshacer')}Deshacer · 8 s</button>
<p class="texto-sm apagado">Después puedes deshacer la firma hasta las 15:00.</p></div>
<section><h2 class="sec-t">Sigue<span class="dato">pieza 2 de 3</span></h2><ul class="lista">
{fila('fed_mie')}</ul></section>
<button class="btn prim grande" type="button" disabled>{icon('candado')}Firmar Federico · mié 4 nov, 11:00</button>
<p class="texto-sm centro apagado">Se habilita al terminar el deshacer.</p>
<a href="#" class="enlace centro">Listo por ahora</a>"""


def pieza_error():
    p = PIEZAS["wav_mar"]
    return f"""{header('volver', 'Pieza 1 de 3')}
<div class="meta"><b class="cuenta">WAV · página</b>{est('pend')}</div>
<h1 class="display h-pieza">{p['titulo']}</h1>
<div class="fallo" role="alert"><p class="est mal">{icon('wifi', False)}No se pudo guardar tu firma</p>
<p class="cuerpo">Sin conexión. Todavía no se publicó nada y tu texto está intacto.</p>
<p class="est">{icon('reloj')}Reintentando solo · 2 de 3</p>
<button class="btn prim" type="button">Reintentar ahora</button>
<button class="btn sec" type="button">Volver a la pieza</button></div>
<p class="texto-sm apagado">Si no vuelve la conexión antes del mar 3 nov, 15:00, la pieza no sale y vuelve a pedirse tu firma.</p>"""


def pieza_descartar():
    p = PIEZAS["wav_mar"]
    return f"""{header('volver', 'Pieza 1 de 3')}
<div class="meta"><b class="cuenta">WAV · página</b>{est('pend')}</div>
<h1 class="display h-pieza">{p['titulo']}</h1>
<div class="confirmar" role="alertdialog" aria-labelledby="cd-t"><p class="titulo" id="cd-t">¿Descartar esta pieza?</p>
<p class="cuerpo apagado">Se borran el texto y la pieza. No se puede deshacer. Esta pieza no ha generado gasto.</p>
<div class="dos"><button class="btn prim" type="button">Conservar pieza</button><button class="btn sec" type="button">Descartar</button></div>
<button class="btn sec" type="button">Mejor dejarla en la reserva</button></div>"""


def calendario():
    def item(hora, cuenta, texto, estado):
        return f'<li class="cal-i"><a href="#" class="cal-a"><div class="meta"><span class="dato">{hora}</span><b class="cuenta">{cuenta}</b></div><p class="cuerpo corto">{texto}</p><div class="pie">{estado}{icon("der")}</div></a></li>'

    def hueco(hora, cuenta):
        return f'<li class="cal-i"><div class="meta"><span class="dato">{hora}</span><b class="cuenta">{cuenta}</b></div><p class="cuerpo corto apagado">Cupo sin pieza</p><button class="btn sec chico" type="button">Asignar una pieza</button></li>'

    def dia(d, n, items, hoy=False):
        marca = '<span class="hoy">Hoy</span>' if hoy else ""
        return f'<div class="dia{" es-hoy" if hoy else ""}"><div class="dia-n"><span class="etiqueta apagado">{d}</span><b class="titulo">{n}</b>{marca}</div><ul class="cal-l">{items}</ul></div>'

    def pilar(nombre, real, meta, nota=""):
        return f'<div class="barra"><span class="etiqueta">{nombre}</span><span class="dato">{real} % <span class="apagado">· meta {meta} %</span></span><i style="--w:{real}%;--m:{meta}%"></i>{nota}</div>'

    return f"""{header()}
<h1 class="display">Calendario</h1>
<div class="seg" role="tablist" aria-label="Vista"><a href="#" class="on" aria-current="page">Semana</a><a href="#">Mes</a></div>
<div class="semana-t"><a href="#" class="icb" aria-label="Semana anterior">{icon('izq')}</a><div class="centro"><span class="subtitulo">Esta semana · 2 – 8 nov</span><br><span class="texto-sm apagado">2 de 6 firmadas · 3 por firmar · 1 cupo sin pieza</span></div><a href="#" class="icb" aria-label="Semana siguiente">{icon('der')}</a></div>
<div class="dias">
{dia('Lun', '2', '<li class="cal-i"><p class="cuerpo corto apagado">Sin publicaciones.</p></li>', hoy=True)}
{dia('Mar', '3', item('11:00', 'Federico', PIEZAS['fed_mar']['titulo'], est('ok')) + item('15:00', 'WAV', PIEZAS['wav_mar']['titulo'], est('pend')))}
{dia('Mié', '4', item('11:00', 'Federico', PIEZAS['fed_mie']['titulo'], est('pend')) + item('15:00', 'WAV', PIEZAS['wav_mie']['titulo'], est('ok')))}
{dia('Jue', '5', item('11:00', 'Federico', PIEZAS['fed_jue']['titulo'], est('pend')) + hueco('15:00', 'WAV'))}
</div>
<p class="texto-sm apagado">Viernes sin publicaciones. Nunca fines de semana.</p>
<details class="detalles pilares" open><summary>Pilares de WAV · 1 atrasado{icon('abajo')}</summary>
<div class="seg chico" role="tablist"><a href="#" class="on">WAV</a><a href="#">Federico</a></div>
{pilar('Evidencia', 45, 40)}{pilar('Casos', 40, 35)}{pilar('Método', 15, 25, f'<p class="aviso fila-completa"><span class="icono-aviso">{icon("alerta")}</span><span>Lleva 2 semanas sin salir. Está 10 puntos bajo su meta.</span></p>')}</details>"""


def investigar(nivel=84):
    tope = nivel >= 100
    if tope:
        aviso = f'<p class="aviso"><span class="icono-aviso">{icon("alerta")}</span><span><b>Llegaste al tope de US$40.</b> Se reinicia el 1 de diciembre. Firmar textos sigue sin costo.</span></p><a href="#" class="enlace">Cambiar el tope en Ajustes</a>'
        boton = f'<button class="btn prim" type="button" disabled>{icon("candado")}Pedir investigación · US$0,80</button><p class="texto-sm apagado centro">Sin saldo este mes.</p>'
    else:
        aviso = f'<p class="aviso"><span class="icono-aviso">{icon("alerta")}</span><span>Pasaste el 80 % del tope del mes. Quedan <span class="dato">US$6,40</span> de <span class="dato">US$40</span>.</span></p>'
        boton = '<button class="btn prim" type="button">Pedir investigación · US$0,80</button><p class="texto-sm apagado centro">Después quedan <span class="dato">US$5,60</span> del mes.</p>'
    return f"""{header(nivel=nivel)}
<p class="etiqueta apagado">Nueva ›</p>
<h1 class="display">Investigar</h1>
{aviso}
<form class="form" onsubmit="return false"><label class="etiqueta" for="iv-tema">Tema</label><input class="campo" id="iv-tema" value="Carruseles sobre WR3 y focus groups" readonly>
<div class="par2"><div><label class="etiqueta" for="iv-cant">Cantidad</label><input class="campo dato" id="iv-cant" value="10" readonly></div><div><span class="etiqueta" id="iv-fmt">Formato</span><div class="seg chico" role="radiogroup" aria-labelledby="iv-fmt"><a href="#" class="on" role="radio" aria-checked="true">Carrusel</a><a href="#" role="radio" aria-checked="false">Texto</a></div></div></div>
<span class="etiqueta" id="iv-ve">Temas relacionados</span><p class="texto-sm apagado">Cercanos a tu tema por similitud. Elige los que quieras sumar.</p><div class="tags" role="group" aria-labelledby="iv-ve"><button type="button" class="sel" aria-pressed="true">{icon('check')}moderación híbrida</button><button type="button" aria-pressed="false">muestras pequeñas</button><button type="button" aria-pressed="false">sesgo del moderador</button></div>
{boton}</form>
<section><h2 class="sec-t">Investigaciones</h2><ul class="lista">
<li class="fila fija"><div class="meta"><span class="dato apagado">dom 1 nov</span>{est('ok', 'Lista')}</div><p class="cuerpo">Tendencias en investigación cualitativa para eventos</p><div class="pie"><span class="dato">12 hallazgos</span><a href="#" class="enlace">Ver hallazgos</a></div></li>
<li class="fila fija"><div class="meta"><span class="dato apagado">hoy · 9:40</span>{est('curso', 'Buscando')}</div><p class="cuerpo">Casos de medición en activaciones de marca</p><div class="progreso" role="progressbar" aria-valuenow="6" aria-valuemax="10" aria-label="6 de 10 fuentes"><i style="--w:60%"></i></div><div class="pie"><span class="dato">6 de 10 fuentes</span><button class="btn sec chico" type="button">Detener búsqueda</button></div><p class="texto-sm apagado">Si la detienes, solo se cobra lo ya buscado (<span class="dato">US$0,30</span>).</p></li>
<li class="fila fija"><div class="meta"><span class="dato apagado">vie 30 oct</span>{est('neutro', 'Sin resultados')}</div><p class="cuerpo">Normativa de datos en grupos focales</p><p class="texto-sm apagado">No encontró nada nuevo respecto a lo guardado. Sin cargo.</p><button class="btn sec chico" type="button">Probar otro tema</button></li></ul></section>"""


def tel(titulo, activa, cuerpo, oscuro=False, alto=844, cta=None, rollo=0, nav_visible=True):
    cls = " oscuro" if oscuro else ""
    cta_html = f'<div class="cta-fija">{cta}</div>' if cta else ""
    con = f'<div class="rollo" style="transform:translateY(-{rollo}px)">{cuerpo}</div>' if cta else cuerpo
    clases = "pantalla" + (" con-cta" if cta else "") + ("" if nav_visible else " sin-nav")
    nav_html = nav(activa) if nav_visible else ""
    return f'<figure class="tel{cls}"><figcaption>{titulo}</figcaption><div class="{clases}" style="--h:{alto}px"><main class="contenido">{con}</main>{cta_html}{nav_html}</div></figure>'


css = open(ROOT + "docs/maquetas/pantallas.css").read()
html = f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PostIA · pantallas</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400&display=swap">
<style>{css}</style></head><body>
<svg width="0" height="0" style="position:absolute" aria-hidden="true">{SYMBOL}</svg>
<h1 class="pagina-t">PostIA · pantallas</h1>
<p class="pagina-s">Maquetas estáticas con contenido de ejemplo (hoy es lunes 2 de noviembre). Vocabulario: turno = periodo del día para firmar; cupo = hueco semanal de publicación; margen = los 30 min para que salga una pieza. Dentro del flujo de firma se oculta la barra de navegación.</p>
<div class="rejilla">
{tel('Inicio', 'inicio', inicio(), alto=1320)}
{tel('Inicio · sin pendientes', 'inicio', inicio_vacio())}
{tel('Pieza · arriba, firma bloqueada', 'inicio', cuerpo_pieza(False, 3), cta=cta_pieza(3), rollo=0, nav_visible=False)}
{tel('Pieza · abajo, lista para firmar', 'inicio', cuerpo_pieza(True, 6), cta=cta_pieza(6), rollo=500, nav_visible=False)}
{tel('Pieza · firmando', 'inicio', cuerpo_pieza(False, 6), cta=cta_pieza(6, 'firmando'), rollo=0, nav_visible=False)}
{tel('Pieza · firmada, con deshacer', 'inicio', pieza_firmada(), nav_visible=False)}
{tel('Pieza · error al firmar', 'inicio', pieza_error(), nav_visible=False)}
{tel('Pieza · confirmar descarte', 'inicio', pieza_descartar(), nav_visible=False)}
{tel('Calendario', 'calendario', calendario(), alto=1540)}
{tel('Investigar', 'nueva', investigar(), alto=1370)}
{tel('Investigar · tope alcanzado', 'nueva', investigar(100), alto=1420)}
{tel('Inicio · tema oscuro', 'inicio', inicio(), oscuro=True, alto=1320)}
{tel('Pieza · arriba, tema oscuro', 'inicio', cuerpo_pieza(False, 3), oscuro=True, cta=cta_pieza(3), rollo=0, nav_visible=False)}
</div></body></html>"""
open(ROOT + "docs/maquetas/pantallas.html", "w").write(html)
print("ok", len(html))
