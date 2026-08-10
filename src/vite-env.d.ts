/// <reference types="vite/client" />

/** Echte `package.json`-Versionsnummer, per Vite `define` zur Build-Zeit
 * eingespritzt (siehe vite.config.ts) - für den Titelmenü-Footer, keine
 * Platzhalter-Versionsnummer mehr. */
declare const __APP_VERSION__: string;
