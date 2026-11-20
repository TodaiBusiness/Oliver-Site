#!/usr/bin/env bash
# Gera, a partir das capturas reais de public/sistema/<id>-{escuro,claro}.webp,
# um clipe de 6 s em loop (zoom e deslocamento suaves sobre regiões da própria
# captura, sem inventar conteúdo) e o poster correspondente:
#   public/sistema/video/<id>-<tema>.webm  (VP9, 960 px, sem áudio, <= 400 KB)
#   public/sistema/video/<id>-<tema>.webp  (poster, 1º quadro)
# Uso: scripts/gerar-videos-pdv.sh [id ...]   (sem argumentos, todas as telas)
set -euo pipefail

cd "$(dirname "$0")/.."
SRC=public/sistema
OUT=$SRC/video
FPS=25
SECS=6
FRAMES=$((FPS * SECS))
MAX_BYTES=$((400 * 1024))
mkdir -p "$OUT"

# Ponto de interesse (fração x:y da tela) para onde a câmera vai e volta.
# O movimento é um cosseno: começa e termina no quadro inteiro, então o loop não pula.
focus() {
  case "$1" in
    painel)      echo "0.62 0.40" ;;
    caixa)       echo "0.70 0.55" ;;
    comandas)    echo "0.30 0.45" ;;
    estoque)     echo "0.40 0.60" ;;
    financeiro)  echo "0.65 0.35" ;;
    relatorios)  echo "0.55 0.50" ;;
    balanca)     echo "0.60 0.50" ;;
    integracoes) echo "0.35 0.40" ;;
    site)        echo "0.50 0.55" ;;
    *)           echo "0.55 0.50" ;;
  esac
}

IDS=("$@")
if [ ${#IDS[@]} -eq 0 ]; then
  IDS=(painel caixa comandas estoque financeiro relatorios balanca integracoes site)
fi

for id in "${IDS[@]}"; do
  read -r fx fy <<<"$(focus "$id")"
  for tema in escuro claro; do
    in="$SRC/$id-$tema.webp"
    [ -f "$in" ] || { echo "falta $in" >&2; exit 1; }
    out="$OUT/$id-$tema.webm"

    # t vai de 0 a 1 e volta a 0 (ease = 0.5 - 0.5*cos). zoom 1 -> 1.45.
    t="(0.5-0.5*cos(2*PI*on/$FRAMES))"
    zp="zoompan=z='1+0.45*$t':x='(iw-iw/zoom)*$fx*$t*2':y='(ih-ih/zoom)*$fy*$t*2':d=$FRAMES:s=960x540:fps=$FPS"

    for crf in 36 40 44 48 52; do
      ffmpeg -v error -y -i "$in" \
        -vf "scale=2732:1536:flags=lanczos,$zp,format=yuv420p" \
        -frames:v "$FRAMES" -an -c:v libvpx-vp9 -b:v 0 -crf "$crf" \
        -deadline good -cpu-used 2 -row-mt 1 "$out"
      size=$(stat -c %s "$out")
      [ "$size" -le "$MAX_BYTES" ] && break
    done
    [ "$size" -le "$MAX_BYTES" ] || { echo "$out passou de 400 KB ($size)" >&2; exit 1; }

    ffmpeg -v error -y -i "$in" -vf "scale=960:-1:flags=lanczos" -frames:v 1 -c:v libwebp -quality 80 "$OUT/$id-$tema.webp"
    echo "$out $size bytes"
  done
done
