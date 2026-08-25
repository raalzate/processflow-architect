"use client";
import * as React from "react";
import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { IconAction } from "@/components/ui/icon-action";
import { accion } from "@/lib/action-labels";
import { Box, Boxes, Filter, Pencil } from "lucide-react";
import type { GraphNode } from "@/lib/types";
import CheckboxNodeItem from "./CheckboxNodeItem";
import MergeConfirmationDialog from "./MergeConfirmationDialog";

interface MergeSelection {
  primary: string | null;
  secondary: Set<string>;
}
type AllMergeSelections = Record<string, MergeSelection>;

interface Props {
  type: string;
  // Relaxed types to avoid tight coupling with caller while preserving shape at runtime
  allNodesMap: Map<string, any>;
  selections: Record<string, any>;
  nodeTypes: string[];
  selectedType: string | any;
  setSelectedType: (type: any) => void;
  selectedAgregado: string | any;
  setSelectedAgregado: (agregado: any) => void;
  handlePrimarySelect: (type: string, nodeId: string) => void;
  handleSecondaryToggle: (type: string, nodeId: string) => void;
  onConfirmMerge: (type: string, newName: string) => void;
  onRequestDelete: (nodeId: string, nodeName: string) => void;
  onRequestPrimaryEdit: (node: any) => void;
  onRequestView: (node: any) => void;
}

const MergeTypeSection: React.FC<Props> = ({
  type,
  allNodesMap,
  selections,
  nodeTypes,
  selectedType,
  setSelectedType,
  selectedAgregado,
  setSelectedAgregado,
  handlePrimarySelect,
  handleSecondaryToggle,
  onConfirmMerge,
  onRequestDelete,
  onRequestPrimaryEdit,
  onRequestView,
}) => {
  if (!selections[type]) return null;
  const currentSelection = selections[type] || { primary: null, secondary: new Set() };
  const primaryNode = currentSelection.primary ? allNodesMap.get(currentSelection.primary) : null;

  const allNodesForType = Array.from(allNodesMap.values()).filter((n) => n.tipo_elemento === type).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const secondaryOptions = allNodesForType.filter((n) => n.id !== currentSelection.primary);
  const isMergePossible = currentSelection.primary !== null && currentSelection.secondary.size > 0;
  const dialogContainerState: { primary: string[]; secondary: string[] } = {
    primary: currentSelection.primary ? [currentSelection.primary] : [],
    secondary: Array.from(currentSelection.secondary || []) as string[],
  };

  const agregadosOptions = useMemo(() => {
    const allAgregados = Array.from(new Set(secondaryOptions.map((n) => n.agregado))).sort();
    return ["all", ...allAgregados];
  }, [secondaryOptions]);

  const filteredSecondaryOptions = useMemo(() => {
    if (selectedAgregado === "all") return secondaryOptions;
    return secondaryOptions.filter((node) => node.agregado === selectedAgregado);
  }, [secondaryOptions, selectedAgregado]);

  const groupedNodes = allNodesForType.reduce((acc: Record<string, GraphNode[]>, node: GraphNode) => {
    const agregadoKey = node.agregado || "Sin Agregado";
    return { ...acc, [agregadoKey]: [...(acc[agregadoKey] || []), node] };
  }, {});

  return (
    <div style={{ display: selectedType === type ? "flex" : "none" }} className="flex-1 flex flex-col min-h-0 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="flex-shrink-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Filter className="h-5 w-5" />1. Selecciona un Tipo de Nodo</CardTitle>
            <CardDescription>Elige qué tipo de nodo deseas agrupar.</CardDescription>
          </CardHeader>
          <CardContent>
            <Label htmlFor={`node-type-select-${type}`} className="sr-only">Tipo de Nodo</Label>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger id={`node-type-select-${type}`} className="w-full">
                <SelectValue placeholder="Selecciona un tipo..." />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {nodeTypes.map((typeOpt) => (
                    <SelectItem key={typeOpt} value={typeOpt}>{typeOpt}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Box className="text-primary" />2. Seleccione el Nodo Principal</CardTitle>
            <CardDescription>Este es el nodo que <strong>permanecerá</strong> y el único que puedes editar.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Select value={currentSelection.primary || ""} onValueChange={(value) => handlePrimarySelect(type, value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Elige un nodo principal..." />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(groupedNodes) as [string, GraphNode[]][]).map(([agregado, nodes]) => (
                      <SelectGroup key={agregado}>
                        <SelectLabel>{agregado}</SelectLabel>
                        {nodes.map((node) => (
                          <SelectItem key={node.id} value={node.id}>{node.nombre}</SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                </SelectContent>
              </Select>
              <IconAction
                variant="outline"
                disabled={!primaryNode}
                onClick={() => { if (primaryNode) onRequestPrimaryEdit(primaryNode); }}
                label={accion("editar", "el elemento principal")}
                icon={<Pencil className="h-4 w-4" />}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {currentSelection.primary && (
        <Card className="flex-1 flex flex-col min-h-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Boxes />3. Seleccione Nodos</CardTitle>
            <CardDescription>Marca nodos para fusionar, o usa los iconos para ver (👁️) o eliminar (🗑️).</CardDescription>
          </CardHeader>

          <CardContent className="flex-1 min-h-0 p-4 flex flex-col gap-4">
            <div className="flex-shrink-0">
              <Label htmlFor={`agregado-filter-${type}`} className="text-sm font-medium">Filtrar por Agregado</Label>
              <Select value={selectedAgregado} onValueChange={setSelectedAgregado}>
                <SelectTrigger id={`agregado-filter-${type}`} className="w-full md:w-[350px] mt-1">
                  <SelectValue placeholder="Filtrar por agregado..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {agregadosOptions.map((agregado) => (
                      <SelectItem key={agregado} value={agregado}>{agregado === "all" ? "Todos los Agregados" : agregado}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <ScrollArea className="flex-1 min-h-0 w-full rounded-md border">
              <div className="p-4 space-y-4">
                {secondaryOptions.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center">No hay otros nodos de este tipo para fusionar.</p>
                ) : filteredSecondaryOptions.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center">No hay nodos que coincidan con el filtro.</p>
                ) : (
                  filteredSecondaryOptions.map((node) => (
                    <CheckboxNodeItem key={node.id} node={node} isChecked={currentSelection.secondary.has(node.id)} onCheckedChange={() => handleSecondaryToggle(type, node.id)} onDelete={onRequestDelete} onView={onRequestView} />
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {isMergePossible && (
        <div className="flex-shrink-0">
          <MergeConfirmationDialog type={type} containers={dialogContainerState} allNodesMap={allNodesMap} onConfirmMerge={onConfirmMerge} />
        </div>
      )}
    </div>
  );
};

export default MergeTypeSection;
