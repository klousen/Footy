import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "Comunio-Bot", description: "Marktwert-Analyse und Transferempfehlungen" };
export const viewport = { width: "device-width", initialScale: 1, themeColor: "#0f172a" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
