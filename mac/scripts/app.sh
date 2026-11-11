#!/bin/sh
# Construit Frungz.app et l'installe dans ~/Applications, puis la lance.
# Depuis la racine du dépôt :  cd mac && npm run app
set -e
cd "$(dirname "$0")/.."
MAC="$(pwd)"; ROOT="$(cd .. && pwd)"
echo "› jeu : construction de la copie hors ligne"
cd "$ROOT"; [ -d node_modules ] || npm install; npm run build
rm -rf "$MAC/jeu"; cp -R "$ROOT/dist" "$MAC/jeu"
# les .glb bruts sont servis compressés (.glb.gz) : inutile de les embarquer deux fois
find "$MAC/jeu" -name '*.glb' -exec sh -c '[ -f "$1.gz" ] && rm "$1"' _ {} \;
echo "› app : Electron"
cd "$MAC"; [ -d node_modules/electron ] || npm install
rm -rf out; npx electron-builder --mac dir --$(uname -m | sed 's/x86_64/x64/') --publish never
APP="$(ls -d out/mac*/Frungz.app | head -1)"
# signature locale (sans compte développeur) : obligatoire sur puce Apple
codesign --force --deep --sign - "$APP"
mkdir -p "$HOME/Applications"; rm -rf "$HOME/Applications/Frungz.app"; cp -R "$APP" "$HOME/Applications/Frungz.app"
echo "› installée : ~/Applications/Frungz.app"
[ "$1" = "--no-open" ] || open "$HOME/Applications/Frungz.app"
