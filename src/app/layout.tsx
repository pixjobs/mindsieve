// src/app/layout.tsx
import type { Metadata } from "next";
import { Inter, Roboto_Mono, Noto_Serif } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const robotoMono = Roboto_Mono({ subsets: ["latin"], variable: "--font-roboto-mono", display: "swap" });
const notoSerif = Noto_Serif({ subsets: ["latin"], variable: "--font-noto-serif", display: "swap" });

export const metadata: Metadata = {
  title: "Mindsieve AI Tutor",
  description: "An AI Tutor Powerhouse powered by Gemini and Elasticsearch",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Force dark for now so the galaxy + titanium theme look correct
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={[
          inter.variable,
          robotoMono.variable,
          notoSerif.variable,
          // transparent root so GalaxyBackground (fixed, -z-10) is visible
          "min-h-screen bg-transparent text-foreground font-sans antialiased",
          // keep layout predictable; prevent accidental horizontal scroll
          "relative overflow-x-hidden"
        ].join(" ")}
      >
        {children}
      </body>
    </html>
  );
}
