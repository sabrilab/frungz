#!/bin/sh
# Construit le jeu, le copie dans l'app iPhone et l'installe (même recette que Keya).
#   npm run ios          → iPhone branché (ou en Wi-Fi), via devicectl
#   npm run ios -- sim   → simulateur iPhone (déjà démarré)
#   npm run ios -- xcode → ouvre le projet dans Xcode
set -e
cd "$(dirname "$0")/.."
[ -d node_modules/@capacitor/cli ] || npm install
npm run build
# dans l'app tout est sur place : les copies compressées (.glb.gz, utiles seulement au web) alourdiraient l'app pour rien
find dist -name '*.glb.gz' -delete
rm -f dist/vercel.json
npx cap sync ios
cd ios/App
if [ "$1" = "xcode" ]; then open App.xcodeproj; exit 0; fi
if [ "$1" = "sim" ]; then
  xcodebuild -project App.xcodeproj -scheme App -configuration Debug \
    -destination 'generic/platform=iOS Simulator' -derivedDataPath build/sim -quiet build
  xcrun simctl install booted build/sim/Build/Products/Debug-iphonesimulator/App.app
  xcrun simctl launch booted com.sabrilab.frungz
  exit 0
fi
DEVICE="${FRUNGZ_DEVICE:-$(xcrun devicectl list devices 2>/dev/null | grep 'available (paired)' | grep iPhone | grep -oE '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}' | head -1)}"
[ -n "$DEVICE" ] || { echo "Aucun iPhone disponible : branche-le et déverrouille-le."; exit 1; }
# Release : le JavaScript du jeu tourne plus vite qu'en Debug (pas d'inspecteur attaché)
xcodebuild -project App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -derivedDataPath build/device \
  -allowProvisioningUpdates -quiet build
xcrun devicectl device install app --device "$DEVICE" build/device/Build/Products/Release-iphoneos/App.app
xcrun devicectl device process launch --device "$DEVICE" com.sabrilab.frungz || \
  echo "Installée. Si iOS refuse de l'ouvrir : Réglages > Général > VPN et gestion de l'appareil > faire confiance."
