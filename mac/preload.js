// Signale au jeu qu'il tourne dans l'app Mac (window.frungzMac), sans lui donner accès au système.
const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('frungzMac', { app: true, platform: process.platform, electron: process.versions.electron, chrome: process.versions.chrome });
