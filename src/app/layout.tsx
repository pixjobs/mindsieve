// src/app/layout.tsx

import type { Metadata } from "next";
import { Inter, Roboto_Mono, Noto_Serif } from "next/font/google";
import "./globals.css";

// Font setup for Inter (sans-serif)
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: 'swap',
});

// Font setup for Roboto Mono (monospace)
const robotoMono = Roboto_Mono({
  subsets: ["latin"],
  variable: "--font-roboto-mono",
  display: 'swap',
});

// Font setup for Noto Serif (serif)
const notoSerif = Noto_Serif({
  subsets: ['latin'],
  variable: '--font-noto-serif',
  display: 'swap',
});

// Metadata for the application
export const metadata: Metadata = {
  title: "Mindsieve AI Tutor",
  description: "An AI Tutor Powerhouse powered by Gemini and Elasticsearch",
};

// Root layout for the application
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body 
        className={`${inter.variable} ${robotoMono.variable} ${notoSerif.variable} font-sans bg-gray-900 text-white antialiased`}
      >
        {children}
      </body>
    </html>
  );
}