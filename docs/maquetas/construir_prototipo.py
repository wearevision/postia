import re, json
from pathlib import Path

ROOT = str(Path(__file__).resolve().parents[2]) + "/"
M = ROOT + "docs/maquetas/"
src = open(M + "construir_pantallas.py").read()
bloque = re.search(r"ICONOS = \{.*?\n\}\n", src, re.S).group(0)
ICONOS = eval(bloque.split("=", 1)[1])
logo = open(ROOT + "docs/logo/postia-logo.svg").read()
vb = re.search(r'viewBox="([^"]+)"', logo).group(1)
inner = re.search(r"<title>.*?</title>\n(.*)</svg>", logo, re.S).group(1)
inner = inner.replace('stroke="#ff00aa"', 'style="stroke:var(--logo-globo)"').replace('fill="#1e1b4b"', 'fill="currentColor"')
sym = f'<symbol id="logo" viewBox="{vb}">{inner}</symbol>'
css = open(M + "pantallas.css").read() + "\n" + open(M + "proto.css").read()
js = open(M + "proto.js").read().replace("__ICONOS__", json.dumps(ICONOS))
html = f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>PostIA · prototipo de firma</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400&display=swap">
<style>{css}</style></head><body>
<svg width="0" height="0" style="position:absolute" aria-hidden="true">{sym}</svg>
<div id="app"></div>
<script>{js}</script></body></html>"""
open(M + "prototipo.html", "w").write(html)
print("prototipo ok", len(html))
