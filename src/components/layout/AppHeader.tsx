"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import {
  TITLEBAR_SEARCH_SLOT,
  TITLEBAR_TITLE_SLOT,
  TITLEBAR_RIGHT_SLOT,
} from "@/components/layout/AppTitleBar";
import Link from "next/link";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { IconAction } from "@/components/ui/icon-action";
import { accion } from "@/lib/action-labels";
import {
  FilePlus2,
  Filter,
  PanelLeft,
  Trash2,
  FileDown,
  FileUp,
  Plug,
  Search,
  X,
  FolderOpen,
  ChevronDown,
  Pencil,
  Building2,
  FolderPlus,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import type { SavedFile, GraphNode, GraphData } from "@/lib/types";
import { iconForType } from "@/components/graph/designer/DesignerCanvas";
import { Badge } from "@/components/ui/badge";
import { useGraphContext } from "@/context/GraphContext"; // Importa el hook
import { useViews } from "@/context/ViewsContext";
import { isChecked } from "@/lib/graph-filters";
import { useToast } from "@/hooks/use-toast";
import { BetaBadge } from "@/components/layout/AppCredits";
import { buscarNodos, nodosBuscables, MIN_QUERY } from "@/lib/search-nodes";
import { UpdateButton } from "@/components/layout/UpdateButton";
import { parseDiagramJson } from "@/lib/import-diagram";
import { normalizeProjectName } from "@/lib/project-rename";
import {
  ORG_TODAS,
  SIN_ORG_LABEL,
  groupByOrg,
  filterByOrg,
  orgChipLabel,
  emptyOrgHint,
  orgOptions,
  visibleSelection,
  type OrgFilter,
} from "@/lib/project-orgs";
import {
  INITIAL_NOTATION_ID,
  NOTATION_LIST,
  getNotation,
  notationContainerLabel,
  type NotationId,
} from "@/lib/notations";
      
interface AppHeaderProps {
  savedFiles: SavedFile[];
  currentFileId: string | null;
  /** Organización por la que se filtra la lista de proyectos («*» = todas). */
  orgFilter: OrgFilter;
  onOrgFilterChange: (filtro: OrgFilter) => void;
  /** Mueve un proyecto a otra organización (`null` lo saca de todas). */
  onFileOrgChange: (id: string, orgId: string | null) => void;
  /** Saca una organización de todos los proyectos (al eliminarla). */
  onOrgCleared: (orgId: string) => void;
  onFileSelect: (id: string) => void;
  onCreateProject: (nombre: string, notation?: NotationId) => void;
  /** Importa un GraphData ya generado (p. ej. exportado por el MCP / Claude Code). */
  onImportJson: (nombre: string, content: GraphData) => string | null;
  onFileDelete: (id: string) => void;
  /** Renombra el proyecto activo; `false` si el nombre no era válido. */
  onRenameProject: (id: string, nombre: string) => boolean;
  onDownloadJson: () => void;
  onSearchSelect: (node: GraphNode) => void;
}

/**
 * Icono 🔌 del header: enlaza a la guía MCP y SEÑALA el estado del servidor
 * embebido — punto verde (pulsante) = activo y aceptando conexiones de Claude
 * Code; gris = apagado. Sondea el estado cada 5s (encenderlo/apagarlo ocurre
 * en Ajustes o por auto-arranque, no hay evento push).
 */
const McpStatusButton = () => {
  const [running, setRunning] = useState<boolean | null>(null);
  const [url, setUrl] = useState("");

  useEffect(() => {
    const electron = typeof window !== "undefined" ? window.electronAPI : undefined;
    if (!electron?.mcpServerStatus) return; // web-only: sin indicador
    let alive = true;
    const check = () =>
      electron
        .mcpServerStatus()
        .then((s) => {
          if (!alive) return;
          setRunning(s.running);
          setUrl(s.url);
        })
        .catch(() => {});
    check();
    const timer = setInterval(check, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  // Un solo texto para el tooltip y para el nombre accesible: mantenerlos por
  // separado es garantizar que se desincronicen (ver `IconAction`). Este botón
  // no usa `IconAction` porque con `asChild` envuelve un enlace.
  const rotulo = running
    ? `Servidor MCP activo — ${url} (clic: guía MCP)`
    : "Servidor MCP apagado — actívalo en Ajustes (clic: guía MCP)";

  return (
    <Button
      asChild
      variant="ghost"
      size="icon"
      className="relative"
      aria-label={rotulo}
      title={rotulo}
    >
      <Link href="/mcp">
        <Plug className="h-4 w-4" />
        {/* Señal de estado: sólo en la app de escritorio (running !== null). */}
        {running !== null && (
          <span
            className={`absolute top-1 right-1 h-2 w-2 rounded-full ring-2 ring-card ${
              running ? "bg-success animate-pulse" : "bg-muted-foreground"
            }`}
          />
        )}
      </Link>
    </Button>
  );
};

/**
 * Componente para gestionar archivos: seleccionar, subir, descargar y eliminar.
 * Muestra un <Select> con los archivos guardados y botones de acción.
 */
const FileManagement: React.FC<
  Pick<
    AppHeaderProps,
    | "savedFiles"
    | "currentFileId"
    | "orgFilter"
    | "onOrgFilterChange"
    | "onFileOrgChange"
    | "onOrgCleared"
    | "onFileSelect"
    | "onCreateProject"
    | "onImportJson"
    | "onFileDelete"
    | "onRenameProject"
    | "onDownloadJson"
  >
> = ({
  savedFiles,
  currentFileId,
  orgFilter,
  onOrgFilterChange,
  onFileOrgChange,
  onOrgCleared,
  onFileSelect,
  onCreateProject,
  onImportJson,
  onFileDelete,
  onRenameProject,
  onDownloadJson,
}) => {
  const { toast } = useToast();
  // Estado para prevenir mismatches de hidratación con el <Select>
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Renombrar el proyecto activo (issue #127): el nombre se lee en este selector,
  // así que se cambia acá — por el menú Proyecto o con doble clic sobre el nombre,
  // el mismo gesto que ya enseña la barra de vistas.
  // Organizaciones del workspace del MCP: sólo para saber cuál ve el AGENTE («·MCP»)
  // y para ofrecer una recién creada que todavía no tiene proyectos. El renderer no
  // toca disco: esto llega por IPC y en la web simplemente no hay.
  const [mcpOrgs, setMcpOrgs] = useState<{ pinned: string | null; orgs: { slug: string; nombre: string }[] }>({
    pinned: null,
    orgs: [],
  });
  useEffect(() => {
    const electron = typeof window !== "undefined" ? window.electronAPI : undefined;
    if (!electron?.mcpOrgsStatus) return;
    let alive = true;
    const check = () =>
      electron.mcpOrgsStatus!()
        .then((s) => alive && setMcpOrgs(s))
        .catch(() => {});
    check();
    const timer = setInterval(check, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const orgNames = useMemo(
    () => Object.fromEntries(mcpOrgs.orgs.map((o) => [o.slug, o.nombre])),
    [mcpOrgs.orgs]
  );
  const opciones = useMemo(
    () => orgOptions(savedFiles, mcpOrgs.orgs.map((o) => o.slug)),
    [savedFiles, mcpOrgs.orgs]
  );
  const visibles = useMemo(() => filterByOrg(savedFiles, orgFilter), [savedFiles, orgFilter]);
  const grupos = useMemo(() => groupByOrg(visibles, orgNames), [visibles, orgNames]);
  // El vacío se anuncia CON su salida: un desplegable mudo obliga a adivinar que la
  // culpa es del filtro (misma garantía que «el lienzo nunca queda en blanco»).
  const vacio = emptyOrgHint(visibles.length, orgFilter, orgNames);

  // CRUD de organizaciones. Vive en el workspace del MCP (la app y el agente comparten
  // esa verdad), así que las tres operaciones van por IPC; en la web no existen.
  const orgApi = typeof window !== "undefined" ? window.electronAPI : undefined;
  const [orgDialog, setOrgDialog] = useState<null | { modo: "crear" | "renombrar"; valor: string }>(null);
  const [orgBorrar, setOrgBorrar] = useState<string | null>(null);

  const refrescarOrgs = async () => {
    if (!orgApi?.mcpOrgsStatus) return;
    try {
      setMcpOrgs(await orgApi.mcpOrgsStatus());
    } catch {
      /* la app puede estar sin servidor: el chip sigue con lo último conocido */
    }
  };

  const submitOrgDialog = async () => {
    if (!orgDialog) return;
    const nombre = orgDialog.valor.trim();
    if (!nombre) return;
    if (orgDialog.modo === "crear") {
      const r = await orgApi?.mcpOrgCreate?.(nombre);
      if (!r?.ok) {
        toast({ variant: "destructive", title: "No se pudo crear", description: r?.error });
        return;
      }
      await refrescarOrgs();
      onOrgFilterChange(r.slug!);
      toast({ title: `Organización "${nombre}" creada`, description: "Mové proyectos con el menú Proyecto." });
    } else {
      if (orgFilter === ORG_TODAS || orgFilter === null) return;
      const r = await orgApi?.mcpOrgRename?.(orgFilter, nombre);
      if (!r?.ok) {
        toast({ variant: "destructive", title: "No se pudo renombrar", description: r?.error });
        return;
      }
      await refrescarOrgs();
      toast({ title: `Ahora se llama "${nombre}"` });
    }
    setOrgDialog(null);
  };

  const confirmarBorrado = async () => {
    if (!orgBorrar) return;
    const r = await orgApi?.mcpOrgDelete?.(orgBorrar);
    if (!r?.ok) {
      toast({ variant: "destructive", title: "No se pudo eliminar", description: r?.error });
      setOrgBorrar(null);
      return;
    }
    // Los proyectos de la app pierden la etiqueta; sus datos quedan intactos.
    onOrgCleared(orgBorrar);
    await refrescarOrgs();
    if (orgFilter === orgBorrar) onOrgFilterChange(ORG_TODAS);
    toast({
      title: "Organización eliminada",
      description: r.movidos?.length
        ? `Sus ${r.movidos.length} diagrama(s) volvieron a los que no tienen organización.`
        : "No tenía diagramas.",
    });
    setOrgBorrar(null);
  };

  const current = savedFiles.find((f) => f.id === currentFileId) ?? null;
  const currentName = current?.content.nombre_proyecto ?? "";
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const startRename = () => {
    if (!current) return;
    setRenameValue(currentName);
    setRenaming(true);
  };
  const submitRename = () => {
    if (!currentFileId) return;
    const res = normalizeProjectName(renameValue);
    if (!res.ok) {
      toast({ variant: "destructive", title: "No se pudo renombrar", description: res.motivo });
      return; // se queda en edición: el nombre inválido no cierra el campo
    }
    if (onRenameProject(currentFileId, renameValue)) setRenaming(false);
  };

  // Diálogo de "Nuevo proyecto"
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  // Notación del proyecto: se elige aquí para que el lienzo abra con la paleta
  // que el usuario quiere (BPMN, C4, UML) y no siempre con la de DDD.
  const [newNotation, setNewNotation] = useState<NotationId>(INITIAL_NOTATION_ID);

  // La paleta de comandos (⌘K) abre este diálogo por un evento de ventana, en
  // vez de duplicar el formulario de nombre.
  useEffect(() => {
    const open = () => setNewOpen(true);
    window.addEventListener("open-new-project", open);
    return () => window.removeEventListener("open-new-project", open);
  }, []);

  const submitNewProject = () => {
    onCreateProject(newName, newNotation);
    setNewName("");
    setNewNotation(INITIAL_NOTATION_ID);
    setNewOpen(false);
  };

  // Importar un diagrama en formato GraphData (JSON). Es el puente con el
  // servidor MCP: Claude Code / Codex diseñan y exportan un .json, y aquí se
  // carga como proyecto nuevo en el lienzo.
  const importInputRef = useRef<HTMLInputElement>(null);
  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite re-seleccionar el mismo archivo
    if (!file) return;
    try {
      const raw = await file.text();
      const { name, content } = parseDiagramJson(raw, file.name);
      onImportJson(name, content);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "No se pudo importar el diagrama",
        description: err?.message || "El archivo no es un JSON válido.",
      });
    }
  };

  return (
    <div className="flex items-center gap-2">
      {/* El nombre del proyecto también en la barra de título: es donde el sistema
          operativo lo espera, y le da anclaje a la franja. */}
      <EnLaBarraDeTitulo slot={TITLEBAR_TITLE_SLOT}>
        {(enLaBarra) => (enLaBarra && currentName ? <span title={currentName}>{currentName}</span> : null)}
      </EnLaBarraDeTitulo>

      {/* Chip de organización: filtra la VISTA (no mueve nada) y muestra «·MCP» cuando
          esta organización es la que ve el agente. Ese sufijo es lo ÚNICO que hace
          visible la divergencia entre lo que mira el humano y dónde escribe el agente. */}
      {mounted && (opciones.length > 0 || mcpOrgs.pinned) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-10 gap-1 shrink-0"
              title={
                mcpOrgs.pinned
                  ? `Filtro de organización · el MCP ve "${orgChipLabel(mcpOrgs.pinned, orgNames)}"`
                  : "Filtro de organización"
              }
            >
              <Building2 className="h-4 w-4" />
              <span className="max-w-[140px] truncate">{orgChipLabel(orgFilter, orgNames)}</span>
              {orgFilter !== ORG_TODAS && orgFilter === mcpOrgs.pinned && (
                <span className="text-2xs font-semibold text-muted-foreground">·MCP</span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Organización</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onOrgFilterChange(ORG_TODAS)}>
              Todas
              {orgFilter === ORG_TODAS && <span className="ml-auto text-xs">✓</span>}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {opciones.map((slug) => (
              <DropdownMenuItem key={slug ?? "sin-org"} onClick={() => onOrgFilterChange(slug)}>
                <span className="truncate">{slug === null ? SIN_ORG_LABEL : orgChipLabel(slug, orgNames)}</span>
                {slug !== null && slug === mcpOrgs.pinned && (
                  <span className="ml-1 text-2xs font-semibold text-muted-foreground">·MCP</span>
                )}
                {orgFilter === slug && <span className="ml-auto text-xs">✓</span>}
              </DropdownMenuItem>
            ))}
            {orgApi?.mcpOrgCreate && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setOrgDialog({ modo: "crear", valor: "" })}>
                  <FolderPlus className="mr-2 h-4 w-4" /> Nueva organización…
                </DropdownMenuItem>
                {/* Renombrar y eliminar actúan sobre la organización que está puesta:
                    sin una elegida no hay sujeto, así que se deshabilitan. */}
                <DropdownMenuItem
                  disabled={orgFilter === ORG_TODAS || orgFilter === null}
                  onClick={() =>
                    setOrgDialog({
                      modo: "renombrar",
                      valor: orgFilter && orgFilter !== ORG_TODAS ? orgChipLabel(orgFilter, orgNames) : "",
                    })
                  }
                >
                  <Pencil className="mr-2 h-4 w-4" /> Renombrar…
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={orgFilter === ORG_TODAS || orgFilter === null}
                  className="text-destructive focus:text-destructive"
                  onClick={() => orgFilter && orgFilter !== ORG_TODAS && setOrgBorrar(orgFilter)}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Eliminar…
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {mounted && renaming ? (
        // Edición en el lugar: Enter guarda, Esc cancela, salir del campo guarda.
        <Input
          autoFocus
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitRename();
            if (e.key === "Escape") setRenaming(false);
          }}
          onBlur={submitRename}
          className="w-[280px] md:w-[320px]"
          title="Enter guarda · Esc cancela"
          aria-label="Nombre del proyecto"
        />
      ) : mounted ? (
        <Select
          // Con el proyecto activo fuera del filtro hay que SOLTAR la selección: si
          // no, el trigger se queda en blanco y el humano no sabe que fue el filtro.
          value={visibleSelection(currentFileId, visibles)}
          onValueChange={onFileSelect}
          disabled={visibles.length === 0}
        >
          <SelectTrigger
            className="w-[280px] md:w-[320px]"
            onDoubleClick={startRename}
            // El nombre se recorta con «…» en el trigger: el title lo da entero.
            title={currentName ? `${currentName} — doble clic para renombrar` : "Seleccionar proyecto"}
          >
            <SelectValue placeholder={vacio ?? "Seleccionar proyecto..."} />
          </SelectTrigger>
          <SelectContent>
            {grupos.map((g) => (
              <SelectGroup key={g.slug ?? "sin-org"}>
                {/* La etiqueta del grupo sólo aporta cuando hay más de uno a la vista. */}
                {grupos.length > 1 && <SelectLabel>{g.label}</SelectLabel>}
                {g.files.map((file) => (
                  <SelectItem key={file.id} value={file.id}>
                    {file.content.nombre_proyecto}  ({file.content.fecha_analisis})
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      ) : (
        // Muestra un esqueleto mientras se monta
        <div className="w-[180px] md:w-[220px] h-10 bg-muted rounded-md" />
      )}

      {/* Importar un diagrama JSON (p. ej. el que exporta el MCP desde Claude Code). */}
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={onImportFile}
      />

      {/* «Actualizar»: sólo se dibuja cuando hay una versión nueva publicada
          (#208). Va junto a las acciones de proyecto, a la derecha. */}
      <UpdateButton className="shrink-0" />

      {/* Menú «Proyecto»: agrupa las acciones de archivo (antes eran 4 botones
          sueltos que saturaban la barra). El Select de arriba ya indica el
          proyecto activo; aquí van crear / importar / descargar / eliminar. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" title="Acciones de proyecto">
            <FolderOpen className="h-4 w-4 mr-2" />
            Proyecto
            <ChevronDown className="h-4 w-4 ml-1 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => setNewOpen(true)}>
            <FilePlus2 className="mr-2 h-4 w-4" /> Nuevo proyecto
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => importInputRef.current?.click()}>
            <FileUp className="mr-2 h-4 w-4" /> Importar diagrama
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!currentFileId} onClick={onDownloadJson}>
            <FileDown className="mr-2 h-4 w-4" /> Descargar JSON
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!currentFileId} onClick={startRename}>
            <Pencil className="mr-2 h-4 w-4" /> Renombrar proyecto
          </DropdownMenuItem>
          {/* Mover es un item del menú que ya existe, no un botón más en la barra. */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={!currentFileId}>
              <Building2 className="mr-2 h-4 w-4" /> Mover a organización
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {opciones
                .filter((slug) => slug !== null)
                .map((slug) => (
                  <DropdownMenuItem
                    key={slug}
                    onClick={() => currentFileId && onFileOrgChange(currentFileId, slug)}
                  >
                    {orgChipLabel(slug, orgNames)}
                    {current?.orgId === slug && <span className="ml-auto text-xs">✓</span>}
                  </DropdownMenuItem>
                ))}
              {opciones.some((slug) => slug !== null) && <DropdownMenuSeparator />}
              <DropdownMenuItem onClick={() => currentFileId && onFileOrgChange(currentFileId, null)}>
                {SIN_ORG_LABEL}
                {!current?.orgId && <span className="ml-auto text-xs">✓</span>}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem
            disabled={!currentFileId}
            className="text-destructive focus:text-destructive"
            onClick={() => currentFileId && onFileDelete(currentFileId)}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Eliminar proyecto
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Guía MCP + indicador de estado del servidor embebido (punto verde = activo).
          En la app va a la barra de título: es un indicador, no necesita el ancho del
          header, y ahí libera sitio para el selector de proyecto. */}
      <EnLaBarraDeTitulo slot={TITLEBAR_RIGHT_SLOT}>
        {(enLaBarra) => (
          <span style={enLaBarra ? ({ WebkitAppRegion: "no-drag" } as React.CSSProperties) : undefined}>
            <McpStatusButton />
          </span>
        )}
      </EnLaBarraDeTitulo>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FilePlus2 className="w-5 h-5" /> Nuevo proyecto
            </DialogTitle>
            <DialogDescription>
              Ponle un nombre y elige la notación con la que vas a modelar. Luego
              diséñalo en la pestaña Design.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="new-project-name">Nombre del proyecto</Label>
            <Input
              id="new-project-name"
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitNewProject()}
              placeholder="Ej: Sistema de Reembolsos"
              className="mt-1"
            />
          </div>
          <div className="pb-2">
            <Label htmlFor="new-project-notation">Notación</Label>
            <Select value={newNotation} onValueChange={(v) => setNewNotation(v as NotationId)}>
              <SelectTrigger id="new-project-notation" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NOTATION_LIST.map((n) => (
                  <SelectItem key={n.id} value={n.id}>
                    {n.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              {getNotation(newNotation).description}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitNewProject} disabled={!newName.trim()}>
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Crear / renombrar organización: un solo diálogo, dos modos. */}
      <Dialog open={!!orgDialog} onOpenChange={(abierto) => !abierto && setOrgDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              {orgDialog?.modo === "renombrar" ? "Renombrar organización" : "Nueva organización"}
            </DialogTitle>
            <DialogDescription>
              {orgDialog?.modo === "renombrar"
                ? "Cambia el nombre que se lee. La carpeta donde viven sus diagramas no se toca."
                : "Agrupa proyectos y diagramas. El agente puede fijarla para ver sólo los suyos."}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="org-name">Nombre</Label>
            <Input
              id="org-name"
              autoFocus
              value={orgDialog?.valor ?? ""}
              onChange={(e) => setOrgDialog((d) => (d ? { ...d, valor: e.target.value } : d))}
              onKeyDown={(e) => e.key === "Enter" && submitOrgDialog()}
              placeholder="Ej: Acme Salud"
              className="mt-1"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOrgDialog(null)}>
              Cancelar
            </Button>
            <Button onClick={submitOrgDialog} disabled={!orgDialog?.valor.trim()}>
              {orgDialog?.modo === "renombrar" ? "Renombrar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Eliminar: la confirmación dice qué pasa con lo de adentro, porque lo que la
          gente teme —con razón— es perder el trabajo al quitar una etiqueta. */}
      <AlertDialog open={!!orgBorrar} onOpenChange={(abierto) => !abierto && setOrgBorrar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar «{orgBorrar ? orgChipLabel(orgBorrar, orgNames) : ""}»?
            </AlertDialogTitle>
            <AlertDialogDescription>
              No se borra nada de lo que tiene adentro: sus diagramas vuelven a los que no
              tienen organización y los proyectos quedan como «{SIN_ORG_LABEL}». Sólo
              desaparece la organización.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarBorrado}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

/**
 * Lleva el buscador a la barra de título cuando existe (app de escritorio), y lo deja
 * donde estaba cuando no (navegador). El portal evita mudar el estado de búsqueda a
 * otro componente: el buscador sigue colgando del contexto que ya tenía, sólo se pinta
 * en otro lado.
 */
const EnLaBarraDeTitulo: React.FC<{
  slot?: string;
  children: (enLaBarra: boolean) => React.ReactNode;
}> = ({ slot = TITLEBAR_SEARCH_SLOT, children }) => {
  const [hueco, setHueco] = useState<HTMLElement | null>(null);
  useEffect(() => {
    // La barra se monta en el layout: al primer render del header puede no estar.
    setHueco(document.getElementById(slot));
  }, [slot]);
  if (!hueco) return <>{children(false)}</>;
  return createPortal(children(true), hueco);
};

/**
 * Componente de búsqueda global que muestra resultados en un Popover.
 */
const GlobalSearch: React.FC<{
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  searchResults: GraphNode[];
  onSelect: (node: GraphNode) => void;
  isDisabled: boolean;
  /** true dentro de la barra de título: campo bajo y ancho, y clicable sobre la
   *  franja arrastrable (sin esto, el clic movería la ventana en vez de enfocar). */
  compact?: boolean;
}> = ({
  searchQuery,
  onSearchQueryChange,
  searchResults,
  onSelect,
  isDisabled,
  compact = false,
}) => {
  // Cerrado a mano: un Popover CONTROLADO sin `onOpenChange` no se cierra con
  // Escape ni al hacer clic fuera — sólo borrando el texto (#219).
  const [cerradoPorUsuario, setCerradoPorUsuario] = useState(false);
  useEffect(() => setCerradoPorUsuario(false), [searchQuery]);

  const handleSelect = (node: GraphNode) => {
    onSelect(node);
    setCerradoPorUsuario(true);
  };

  const hayConsulta = searchQuery.trim().length >= MIN_QUERY;

  return (
    <Popover
      open={hayConsulta && !cerradoPorUsuario}
      onOpenChange={(abierto) => !abierto && setCerradoPorUsuario(true)}
    >
      <PopoverTrigger asChild>
        <div
          className={cn("relative", compact && "w-full max-w-[520px]")}
          style={compact ? ({ WebkitAppRegion: "no-drag" } as React.CSSProperties) : undefined}
        >
          <Search
            className={cn(
              "absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground",
              compact && "left-2.5 h-3.5 w-3.5"
            )}
          />
          <Input
            type="text"
            placeholder="Buscar elementos..."
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            className={cn(
              "pl-9 pr-8",
              compact
                ? "h-7 w-full rounded-md border-transparent bg-muted/60 pl-8 text-xs hover:bg-muted focus-visible:border-input"
                : "w-48 md:w-64"
            )}
            disabled={isDisabled}
          />
          {/* Botón para limpiar la búsqueda */}
          {searchQuery && (
            <IconAction
              variant="ghost"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={() => onSearchQueryChange("")}
              label={accion("limpiar", "la búsqueda")}
              icon={<X className="h-4 w-4" />}
            />
          )}
        </div>
      </PopoverTrigger>

      <PopoverContent
        className="w-[420px] p-0"
        align="start"
        // Evita que el popover robe el foco al input al aparecer
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="p-2 text-sm text-muted-foreground">
          {searchResults.length > 0
            ? `${searchResults.length} resultado(s) en lo que estás viendo.`
            : "Sin coincidencias en este diagrama."}
        </div>
        <ul className="max-h-80 overflow-y-auto">
          {searchResults.map((node) => {
            // Icono del registro de notaciones: sirve a DDD, BPMN, C4 y UML.
            const Icon = iconForType(node.tipo_elemento);
            return (
              <li
                key={node.id}
                onClick={() => handleSelect(node)}
                className="flex items-center justify-between gap-4 p-2 cursor-pointer hover:bg-accent"
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate" title={node.nombre}>
                    {node.nombre}
                  </span>
                </div>
                <Badge variant="secondary" className="shrink-0">
                  {node.estado_comparativo}
                </Badge>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
};

/**
 * Componente principal de la cabecera de la aplicación.
 * Contiene el título, el disparador del sidebar, la búsqueda global,
 * los filtros y la gestión de archivos.
 */
const AppHeader: React.FC<AppHeaderProps> = ({
  onSearchSelect,
  ...fileManagementProps // Agrupa el resto de props para FileManagement
}) => {
  // Estado para prevenir mismatches de hidratación en componentes hijos
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

   const { setSearchQuery, searchResults, searchQuery, allNodes } = useGraphContext();
   const { activeView } = useViews();
   // Se busca lo que se está VIENDO: si hay una vista de grafo activa, sus nodos;
   // si no, los del proyecto. El buscador miraba sólo el proyecto, así que
   // trabajando sobre una vista no encontraba nada y parecía roto (#219).
   const buscables = useMemo(() => nodosBuscables(activeView, allNodes), [activeView, allNodes]);
   // Un solo filtro para las dos fuentes (vista o proyecto): el provider usa la
   // misma función, así que lo que encuentra la barra es lo que encuentra el resto.
   const resultados = useMemo(() => buscarNodos(searchQuery, buscables), [searchQuery, buscables]);
   // Los filtros son de la VISTA activa, no del proyecto: en una pestaña BPMN el
   // menú ofrecía los tipos del C4 del modelo y rotulaba «Límite de Sistema».
   const {
      filterOptions: opciones,
      filters,
      filtersActive,
      setContainerVisible,
      setTypeVisible,
      clearFilters,
    } = useViews();

  return (
    <header className="z-10 min-w-0 border-b bg-card p-4 shadow-sm">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* Disparador del Sidebar para móviles */}
          <SidebarTrigger className="md:hidden">
            <PanelLeft />
          </SidebarTrigger>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-foreground font-headline">
              ProcessFlow Architect
            </h1>
            <BetaBadge />
          </div>
          {/* El crédito de autoría vive en el pie del sidebar y en «Acerca de»:
              en la cabecera competía con el título y no aporta a la tarea. */}
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          {/* Búsqueda global: en la app de escritorio se pinta en la barra de
              título (issue #169); en el navegador, acá mismo. */}
          {mounted ? (
            <EnLaBarraDeTitulo>
              {(enLaBarra) => (
                <GlobalSearch
                  searchQuery={searchQuery}
                  onSearchQueryChange={setSearchQuery}
                  searchResults={resultados}
                  onSelect={onSearchSelect}
                  // Se deshabilita cuando no hay NADA que buscar, no cuando falta
                  // un proyecto: trabajando sobre una vista el campo quedaba muerto
                  // aunque el diagrama en pantalla tuviera elementos (#219).
                  isDisabled={buscables.length === 0}
                  compact={enLaBarra}
                />
              )}
            </EnLaBarraDeTitulo>
          ) : (
            <div className="w-48 md:w-64 h-10 bg-muted rounded-md" />
          )}

          {/* Menú de Filtros — opciones y etiqueta de la VISTA activa */}
          {(opciones.containers.length > 0 || opciones.types.length > 0) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant={filtersActive ? "secondary" : "outline"}>
                  <Filter className="w-4 h-4 mr-2" />
                  Filtros
                  {filtersActive && (
                    <span className="ml-2 rounded-full bg-primary/20 px-1.5 text-2xs font-semibold text-primary">
                      {filters.hiddenContainers.length + filters.hiddenTypes.length}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-64" align="end">
                {opciones.containers.length > 0 && (
                  <>
                    {/* El rótulo sigue a la notación de la VISTA: Agregado en DDD,
                        Pool en BPMN, Límite de Sistema en C4, Paquete en UML. */}
                    <DropdownMenuLabel>Filtrar por {opciones.containerLabel}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <div className="p-2 space-y-2">
                      {opciones.containers.map((name) => (
                        <div key={name} className="flex items-center space-x-2">
                          <Checkbox
                            id={`filter-${name}`}
                            checked={isChecked(filters.hiddenContainers, name)}
                            onCheckedChange={(checked) => setContainerVisible(name, !!checked)}
                          />
                          <Label
                            htmlFor={`filter-${name}`}
                            className="text-sm font-normal leading-none cursor-pointer"
                          >
                            {name.split(" - ")[0]}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {opciones.types.length > 0 && (
                  <>
                    <DropdownMenuLabel>Filtrar por Tipo de Elemento</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <div className="p-2 grid grid-cols-2 gap-2">
                      {opciones.types.map((nodeType) => (
                        <div key={nodeType} className="flex items-center space-x-2">
                          <Checkbox
                            id={`filter-type-${nodeType}`}
                            checked={isChecked(filters.hiddenTypes, nodeType)}
                            onCheckedChange={(checked) => setTypeVisible(nodeType, !!checked)}
                          />
                          <Label
                            htmlFor={`filter-type-${nodeType}`}
                            className="text-sm font-normal leading-none cursor-pointer"
                          >
                            {nodeType}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {filtersActive && (
                  <>
                    <DropdownMenuSeparator />
                    <div className="p-2">
                      <Button variant="ghost" size="sm" className="h-7 w-full text-xs" onClick={clearFilters}>
                        Mostrar todo
                      </Button>
                    </div>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Gestión de Archivos */}
          {mounted ? (
            <FileManagement {...fileManagementProps} />
          ) : (
            // Esqueleto para el FileManagement
            <div className="w-[320px] h-10 bg-muted rounded-md" />
          )}
        </div>
      </div>
    </header>
  );
};

export default AppHeader;