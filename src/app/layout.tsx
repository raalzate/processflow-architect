
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProcessFlow Architect",
  description: "Una visualización dinámica de tus flujos de proceso.",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  

  return (
    <html lang="en">
      <head></head>
      <body className="font-body antialiased">{children}</body>
    </html>
  );
}
