// App iPhone (Capacitor) : détection et retour haptique. Sur le web, ces fonctions ne font rien.
import { Capacitor } from '@capacitor/core';
import { Haptics } from '@capacitor/haptics';
export const NATIVE = Capacitor.isNativePlatform();
// style : 'LIGHT' | 'MEDIUM' | 'HEAVY'
export function haptic(style = 'LIGHT') { if (NATIVE) Haptics.impact({ style }).catch(() => {}); }
