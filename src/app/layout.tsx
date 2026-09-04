import type { Metadata, Viewport } from "next";
import { Archivo, Inter_Tight } from "next/font/google";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
});

const num = Inter_Tight({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-tight",
});

export const metadata: Metadata = {
  title: "Rebu AI",
  description: "Assistente asta Fantacalcio Serie A 2026/27",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Rebu AI" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0a0c10",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={`${archivo.variable} ${num.variable}`}>
      <body className="min-h-screen bg-bg font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
