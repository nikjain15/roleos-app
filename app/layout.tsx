import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Self-hosted via next/font — no render-blocking external request, no layout
// shift, and the font files are served from our own origin (faster LCP).
// Body = Plus Jakarta Sans (humanist, warm-but-crisp); display = Space Grotesk
// (geometric grotesk, our take on OpenRouter's Gordita); code = JetBrains Mono.
const sans = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans-var", display: "swap" });
const display = Space_Grotesk({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display-var", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono-var", display: "swap" });

export const metadata: Metadata = {
  title: "RoleOS — RO runs your job hunt. You make the calls.",
  description:
    "An AI-first agent that runs your senior job hunt. RO finds, reasons, drafts, builds and coaches — you press send on anything that leaves the building.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
