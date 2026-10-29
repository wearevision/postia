#!/bin/zsh
# Loads ANTHROPIC_API_KEY into Trigger.dev prod. The key is typed hidden and never printed or stored.
set -euo pipefail
cd "${0:A:h}/.."

read -rs "clave?Pega la llave de Anthropic (no se muestra): "
echo
if [[ -z "$clave" ]]; then
  echo "No pegaste nada; no cambié nada."
  exit 1
fi

./node_modules/.bin/trigger env set ANTHROPIC_API_KEY "$clave" --env prod --secret --skip-telemetry --log-level error >/dev/null
unset clave
echo "Trigger.dev prod: ANTHROPIC_API_KEY listo (secreto)"
