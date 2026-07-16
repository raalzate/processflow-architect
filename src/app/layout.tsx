
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
      <head>
        {/*
          Aplica la clase `.dark` ANTES del primer pintado para evitar el flash de
          tema claro. Debe ser JS inline sin dependencias (corre antes de React).
          Espeja la lógica de src/lib/theme.ts (THEME_STORAGE = "pf_theme").
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("pf_theme")||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`,
          }}
        />
      </head>
      <body className="font-body antialiased">{children}</body>
    </html>
  );
}
