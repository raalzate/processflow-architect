"use client";

import React from "react";
import { SidebarGroup, SidebarGroupLabel } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { IconAction } from "@/components/ui/icon-action";
import { accion } from "@/lib/action-labels";
import { cn } from "@/lib/utils";
import { Bot, Copy, CopyCheck, FileDown } from "lucide-react";
import { useGraphContext } from "@/context/GraphContext";
import { AgentChatPanel } from "./AgentChatPanel";
import { ArtifactsPanel } from "./ArtifactsPanel";
import { AiProvenanceBadge } from "./AiProvenanceBadge";

// Este componente ahora solo se preocupa del layout general y los botones globales.
export function AiAgentsPanel() {
  const {
    handleDownloadPdf,
    isGeneratingPdf,
    handleCopyAll,
    copiedStates,
  } = useGraphContext(); // Solo pide los props que USA

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5" /> Agentes de IA
          <AiProvenanceBadge />
        </div>
        <div className="flex items-center">
          <IconAction
            variant="ghost"
            className="h-7 w-7"
            onClick={handleDownloadPdf}
            disabled={isGeneratingPdf}
            label={accion("descargar", "el análisis en PDF")}
            icon={<FileDown className={cn("w-4 h-4", isGeneratingPdf && "animate-pulse")} />}
          />
          <IconAction
            variant="ghost"
            className="h-7 w-7"
            onClick={handleCopyAll}
            label={accion("copiar", "todo el análisis")}
            icon={
              copiedStates["all"] ? (
                <CopyCheck className="w-4 h-4 text-success" />
              ) : (
                <Copy className="w-4 h-4" />
              )
            }
          />
        </div>
      </SidebarGroupLabel>
      <div className="w-full p-1">
        <AgentChatPanel />
        <ArtifactsPanel />
      </div>
    </SidebarGroup>
  );
}