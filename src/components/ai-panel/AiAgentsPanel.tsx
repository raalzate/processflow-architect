"use client";

import React from "react";
import { SidebarGroup, SidebarGroupLabel } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { IconAction } from "@/components/ui/icon-action";
import { accion } from "@/lib/action-labels";
import { cn } from "@/lib/utils";
import { Bot, Copy, CopyCheck, FileDown, Hammer, Eye, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAgent } from "@/context/AgentContext";
import { AGENT_PROFILES, getAgentProfile } from "@/lib/ai/agent-profiles";
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
  const { agentId, setAgentId, busy } = useAgent();
  const perfil = getAgentProfile(agentId);

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5" /> Agentes de IA
          {/* Qué agente atiende el chat. El que escribe se distingue a simple
              vista: leer y modificar el modelo no son el mismo permiso. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                className={cn(
                  "h-6 gap-1 px-2 text-xs font-medium",
                  perfil.escribe && "border-warning/60 text-warning"
                )}
                title={perfil.descripcion}
              >
                {perfil.escribe ? <Hammer className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {perfil.nombre}
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <DropdownMenuLabel className="text-xs">Agente del chat</DropdownMenuLabel>
              {AGENT_PROFILES.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  onClick={() => setAgentId(p.id)}
                  className={cn("flex-col items-start gap-0.5", p.id === agentId && "bg-accent")}
                >
                  <span className="flex items-center gap-1.5 text-xs font-medium">
                    {p.escribe ? <Hammer className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    {p.nombre}
                  </span>
                  <span className="text-2xs text-muted-foreground">{p.descripcion}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
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