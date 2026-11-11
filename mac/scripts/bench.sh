#!/bin/sh
# Banc d'essai : la même partie (même build, même qualité, même nombre de persos) mesurée dans l'app Mac et dans les navigateurs.
#   cd mac && npm run bench            (Frungz.app doit être installée : npm run app)
# Résultats : mac/bench/*.json et un résumé à la fin.
set -e
cd "$(dirname "$0")/.."; MAC="$(pwd)"; ROOT="$(cd .. && pwd)"
SEC="${SEC:-40}"; Q="${Q:-haut}"; N="${N:-25}"
OUT="$MAC/bench"; rm -rf "$OUT"; mkdir -p "$OUT"
cd "$ROOT"; [ -d dist ] || npm run build
node "$MAC/scripts/bench-server.cjs" "$OUT" & SRV=$!; trap 'kill $SRV 2>/dev/null' EXIT; sleep 1
URL="http://localhost:8124/?bench=$SEC&q=$Q&n=$N"
APPBIN="$HOME/Applications/Frungz.app/Contents/MacOS/Frungz"
wait_for() { i=0; while [ ! -f "$OUT/$1.json" ] && [ $i -lt 400 ]; do sleep 1; i=$((i+1)); done; [ -f "$OUT/$1.json" ] && echo "  ✓ $1" || echo "  ✗ $1 (pas de résultat)"; }
echo "› app Mac, fenêtre 1440×900"; "$APPBIN" --bench="$SEC" --url="$URL&fin=app-fenetre" --out="$OUT/app-fenetre-titre.json" >/dev/null 2>&1 & wait_for app-fenetre; sleep 2
echo "› app Mac, plein écran"; "$APPBIN" --bench="$SEC" --plein-ecran --url="$URL&fin=app-plein-ecran" --out="$OUT/app-plein-ecran-titre.json" >/dev/null 2>&1 & wait_for app-plein-ecran; sleep 2
echo "› app Mac, plein écran, images/s sans plafond"; "$APPBIN" --bench="$SEC" --plein-ecran --sans-limite --url="$URL&fin=app-sans-plafond" --out="$OUT/app-sans-plafond-titre.json" >/dev/null 2>&1 & wait_for app-sans-plafond; sleep 2
if [ -d "/Applications/Google Chrome.app" ]; then echo "› Chrome"; open -a "Google Chrome" "$URL&fin=chrome"; wait_for chrome; fi
echo "› Safari"; open -a Safari "$URL&fin=safari"; wait_for safari
node -e '
const fs=require("fs"),d=process.argv[1];
for (const f of fs.readdirSync(d).filter(f=>f.endsWith(".json")&&!f.includes("titre"))) { const r=JSON.parse(fs.readFileSync(d+"/"+f));
  console.log(f.replace(".json","").padEnd(18), String(r.fps).padStart(6),"i/s moy.", String(r.low1).padStart(6),"i/s (1 % lent)", (r.over33+"% > 33 ms").padStart(12), " ", r.w+"×"+r.h, "×"+r.pr, r.gpu); }' "$OUT"
