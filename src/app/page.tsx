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
            <SidebarProvider>
              <AppSidebar />
              <AppContent />
            </SidebarProvider>
          </AgentProvider>
        </ViewsProvider>
      </ReferenceProvider>
    </GraphDataProvider>
  );
}