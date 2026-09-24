
import type { Metadata } from "next";
import "./globals.css";
import { AppTitleBar } from "@/components/layout/AppTitleBar";
import { scriptAntiDestello } from "@/lib/theme";

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
    // El tema es del USUARIO (feature 018). Oscuro sigue siendo el default —la
    // app es una superficie de trabajo— pero el diagrama también se muestra:
    // proyectado o impreso, el lienzo oscuro no se lee. La clase inicial la pone
    // el script de abajo, ANTES del primer pintado; si esperáramos a React se
    // vería un fotograma del tema contrario en cada arranque. En el `<html>` va
    // `dark` como punto de partida para que servidor y cliente pinten igual y no
    // salte la hidratación: el script la corrige antes de que nadie la vea.
    <html lang="es" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: scriptAntiDestello() }} />
      </head>
      <body className="font-body antialiased">
        {/* Barra de título propia: hospeda el buscador y es lo único arrastrable
            cuando el marco nativo está oculto. Va en el layout —no en una página—
            porque en /settings o /docs la ventana también tiene que poder moverse. */}
        <AppTitleBar />
        {children}
      </body>
    </html>
  );
}
