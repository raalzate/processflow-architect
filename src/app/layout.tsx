
import type { Metadata } from "next";
import "./globals.css";
import { AppTitleBar } from "@/components/layout/AppTitleBar";

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
    // La app se muestra SIEMPRE en oscuro (spec 003, FR-001): es una superficie
    // de trabajo sobre la que vive un diagrama, y el salto de luminosidad entre
    // el lienzo y el resto era la incoherencia más visible. Al ser fija, no hace
    // falta el script anti-FOUC que decidía el tema antes del primer pintado.
    <html lang="es" className="dark">
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
