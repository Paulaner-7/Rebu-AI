import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rebu AI",
  description: "Assistente asta Fantacalcio Serie A 2026/27",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body className="min-h-screen bg-zinc-50 text-zinc-900 antialiased">{children}</body>
    </html>
  );
}
