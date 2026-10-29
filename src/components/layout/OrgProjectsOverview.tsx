"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Boxes, Building2, CalendarDays, GitBranch, Shapes, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useGraphContext } from "@/context/GraphContext";
import { hostBridge } from "@/lib/host-bridge";
import { ORG_TODAS, filterByOrg, orgChipLabel } from "@/lib/project-orgs";
import { resumirProyectos, type ResumenProyecto } from "@/lib/project-summary";

/**
 * Galería de la organización elegida en el header: cada proyecto en una tarjeta con su
 * resumen. Abrir una tarjeta abre el proyecto; «Volver» regresa al que estaba abierto.
 */
export function OrgProjectsOverview() {
  const { savedFiles, currentFileId, orgFilter, setOrgFilter, setOrgOverview, handleFileSelect } = useGraphContext();

  // El nombre legible vive en el workspace del MCP (igual que el chip del header).
  const [nombres, setNombres] = useState<Record<string, string>>({});
  useEffect(() => {
    let vivo = true;
    hostBridge()
      ?.mcpOrgsStatus?.()
      .then((s) => vivo && setNombres(Object.fromEntries(s.orgs.map((o) => [o.slug, o.nombre]))))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  const proyectos = useMemo(() => resumirProyectos(filterByOrg(savedFiles, orgFilter)), [savedFiles, orgFilter]);
  const titulo = orgChipLabel(orgFilter, nombres);

  return (
    <div className="absolute inset-0 overflow-y-auto bg-background">
      <div className="mx-auto max-w-7xl p-6">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Building2 className="h-6 w-6 text-primary" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-semibold text-foreground">{titulo}</h2>
            <p className="text-sm text-muted-foreground">
              {proyectos.length} {proyectos.length === 1 ? "proyecto" : "proyectos"} · elegí uno para abrirlo
            </p>
          </div>
          {currentFileId && (
            <Button variant="outline" size="sm" onClick={() => setOrgOverview(false)}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Volver al proyecto abierto
            </Button>
          )}
        </div>

        {proyectos.length === 0 ? (
          // El vacío se anuncia CON su salida, igual que el selector del header.
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center text-muted-foreground">
            <p>No hay proyectos en {titulo}. Movelos aquí desde el menú «Proyecto».</p>
            {orgFilter !== ORG_TODAS && (
              <Button variant="outline" size="sm" onClick={() => setOrgFilter(ORG_TODAS)}>
                Ver todas las organizaciones
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {proyectos.map((p) => (
              <TarjetaProyecto
                key={p.id}
                proyecto={p}
                activo={p.id === currentFileId}
                onAbrir={() => handleFileSelect(p.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TarjetaProyecto({
  proyecto: p,
  activo,
  onAbrir,
}: {
  proyecto: ResumenProyecto;
  activo: boolean;
  onAbrir: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onAbrir}
      className={
        "flex flex-col gap-3 rounded-lg border bg-card p-4 text-left shadow-xs transition-colors hover:border-primary hover:bg-muted/40 " +
        (activo ? "border-primary/70" : "border-border")
      }
    >
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 text-base font-semibold leading-snug text-foreground">{p.nombre}</h3>
        {activo && <Badge variant="secondary">abierto</Badge>}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <Badge variant="outline" className="font-normal">
          {p.notacion}
        </Badge>
        {p.fecha && (
          <span className="flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" /> {p.fecha}
          </span>
        )}
      </div>

      <p className="line-clamp-3 text-sm text-muted-foreground">
        {p.descripcion ?? <span className="italic">Sin descripción.</span>}
      </p>

      <dl className="grid grid-cols-2 gap-2 text-xs">
        <Dato icono={Shapes} etiqueta="Elementos" valor={p.elementos} />
        <Dato icono={GitBranch} etiqueta="Relaciones" valor={p.relaciones} />
        <Dato icono={Boxes} etiqueta="Contenedores" valor={p.contenedores} />
        <Dato icono={AlertTriangle} etiqueta="Hotspots" valor={p.hotspots} />
      </dl>

      {p.tiposPrincipales.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {p.tiposPrincipales.map((t) => (
            <Badge key={t.tipo} variant="secondary" className="font-normal">
              {t.tipo} · {t.cantidad}
            </Badge>
          ))}
        </div>
      )}

      {p.responsables.length > 0 && (
        <p className="mt-auto flex items-center gap-1 truncate text-xs text-muted-foreground" title={p.responsables.join(", ")}>
          <Users className="h-3.5 w-3.5 shrink-0" /> {p.responsables.join(", ")}
        </p>
      )}
    </button>
  );
}

function Dato({ icono: Icono, etiqueta, valor }: { icono: React.ElementType; etiqueta: string; valor: number }) {
  return (
    <div className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1.5">
      <Icono className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <dt className="text-muted-foreground">{etiqueta}</dt>
      <dd className="ml-auto font-semibold text-foreground">{valor}</dd>
    </div>
  );
}
