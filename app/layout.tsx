import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      {/* Inter + JetBrains Mono via Google Fonts to match the design system. */}
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
