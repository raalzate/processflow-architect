#!/bin/bash
# Guion → un mp3 por párrafo en <dir>/voz/bNN.mp3 (#664). El párrafo N es el voz(N) de la escena.
#
#   scripts/tutorial/voz.sh <guion.txt> <dir> [voz]
#
# Por bloque y no un solo archivo: la escena espera a que termine CADA frase, así
# que necesita la duración de cada una (la grabación sigue a la voz, no al revés).
#
#   TTS=edge   (default, gratis) edge-tts · voz es-CO-SalomeNeural (♀) · es-CO-GonzaloNeural (♂)
#              No oficial para uso comercial: sirve para uso interno y pruebas.
#              Si responde 403, está vieja: `pip3 install -U edge-tts`.
#   TTS=openai gpt-4o-mini-tts con OPENAI_API_KEY · voz cedar (♂) · marin (♀). ~US$0,015/min.
#              Uso comercial permitido (avisar que la voz es IA).
set -euo pipefail
export LC_ALL=C   # punto decimal: awk y ffprobe con locale es_* escriben «190,3»
GUION="${1:?uso: voz.sh <guion.txt> <dir> [voz]}"
DIR="${2:?dir de salida}"
TTS="${TTS:-edge}"
OUT="$DIR/voz"
mkdir -p "$OUT"
rm -f "$OUT"/b*.mp3 "$OUT"/b*.txt

# Párrafos = bloques separados por línea en blanco; las líneas con # son notas.
awk -v out="$OUT" 'BEGIN{RS=""; n=0} {gsub(/(^|\n)#[^\n]*/, ""); gsub(/\n/, " "); if (length($0) > 1) { f=sprintf("%s/b%02d.txt", out, n++); print > f; close(f) } }' "$GUION"

case "$TTS" in
  edge)
    VOZ="${3:-es-CO-SalomeNeural}"
    command -v edge-tts >/dev/null || { echo "Falta edge-tts: pip3 install -U edge-tts" >&2; exit 1; }
    for t in "$OUT"/b*.txt; do
      ok=0
      for _ in 1 2 3; do
        edge-tts --voice "$VOZ" -f "$t" --write-media "${t%.txt}.mp3" >/dev/null 2>&1 && { ok=1; break; }
        sleep 2
      done
      [ "$ok" = 1 ] || { echo "edge-tts falló en $(basename "$t") (¿red? ¿versión vieja? pip3 install -U edge-tts)" >&2; exit 1; }
    done ;;
  openai)
    VOZ="${3:-cedar}"
    : "${OPENAI_API_KEY:?TTS=openai necesita OPENAI_API_KEY en el entorno}"
    INSTR="Habla en español latinoamericano neutro, cálido y claro, como quien explica una herramienta a un colega. Ritmo pausado, pausas naturales en comas y puntos. Siglas como MCP, BPMN o JSON se leen letra por letra."
    for t in "$OUT"/b*.txt; do
      body=$(python3 -c 'import json,sys; print(json.dumps({"model":"gpt-4o-mini-tts","voice":sys.argv[1],"input":open(sys.argv[2],encoding="utf-8").read().strip(),"instructions":sys.argv[3],"response_format":"mp3"}))' "$VOZ" "$t" "$INSTR")
      curl -sS --fail https://api.openai.com/v1/audio/speech \
        -H "Authorization: Bearer $OPENAI_API_KEY" -H "Content-Type: application/json" \
        -d "$body" -o "${t%.txt}.mp3"
    done ;;
  *) echo "TTS desconocido: $TTS (edge|openai)" >&2; exit 1 ;;
esac

total=0
for f in "$OUT"/b*.mp3; do
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f" | tr , .)
  total=$(awk -v a="$total" -v b="$d" 'BEGIN{print a+b}')
done
echo "voz → $OUT ($(ls "$OUT"/b*.mp3 | wc -l | tr -d ' ') bloques, ${total}s, $TTS/$VOZ)"
