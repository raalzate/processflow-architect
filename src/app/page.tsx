"use client";

import React from "react";

// Context & Providers
import { SidebarProvider } from "@/components/ui/sidebar";
import { GraphDataProvider } from "@/context/GraphDataProvider";
import { ViewsProvider } from "@/context/ViewsContext";
import { AgentProvider } from "@/context/AgentContext";
import { ReferenceProvider } from "@/context/ReferenceContext";

// Layout Components
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppContent } from "@/components/layout/AppContent";

export default function Home() {
  return (
    <GraphDataProvider>
      <ReferenceProvider>
        <ViewsProvider>
          <AgentProvider>
            {/* Colapsado al abrir: el panel del agente se pide, no se impone, y el
                lienzo se ve entero desde el arranque (#254).

                `SidebarProvider` ESCRIBE la cookie `sidebar_state` pero nunca la
                lee, así que esto arranca plegado siempre, sin recordar la última
                elección. Es deliberado: el arranque es el momento en que el
                lienzo importa más, y el panel está a un clic. Si algún día se
                quiere recordar, hay que LEER la cookie acá —no cambiar este
                default. */}
            <SidebarProvider defaultOpen={false}>
              <AppSidebar />
              <AppContent />
            </SidebarProvider>
          </AgentProvider>
        </ViewsProvider>
      </ReferenceProvider>
    </GraphDataProvider>
  );
}