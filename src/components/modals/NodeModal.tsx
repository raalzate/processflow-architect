"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconAction } from "@/components/ui/icon-action";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type GraphNode, type GraphLink } from "@/lib/types";
import { ALL_NODE_TYPES, notationTypes } from "@/lib/notations";
import { ArrowLeft } from "lucide-react";

interface NodeModalProps {
  node: GraphNode | null;
  allNodes?: GraphNode[];
  allLinks?: GraphLink[];
  historyCount: number;
  /**
   * Notación del modelo abierto: acota el Select de tipo a SUS tipos. Sin ella
   * se ofrecen los de todas las notaciones (mejor que imponer los de DDD).
   */
  notation?: string;
  onClose: () => void;
  onNodeUpdate: (updatedNode: GraphNode) => void;
  onNodeSelect: (nodeId: string) => void;
  onBack: () => void;
}

const nodeStatuses: GraphNode["estado_comparativo"][] = [
  "nuevo",
  "modificado",
  "sin_cambios",
  "existente",
  "eliminado",
];

const NodeModal: React.FC<NodeModalProps> = ({
  node,
  allNodes = [],
  allLinks = [],
  historyCount,
  notation,
  onClose,
  onNodeUpdate,
  onNodeSelect,
  onBack,
}) => {
  const [editableNode, setEditableNode] = useState<GraphNode | null>(null);
  // Este estado controlará el string exacto del input de tags
  const [tagInputValue, setTagInputValue] = useState("");
  useEffect(() => {
    if (node) {
      setEditableNode(JSON.parse(JSON.stringify(node))); // Deep copy
      setTagInputValue((node.tags_tecnologia || []).join(", "));
    }
  }, [node]);

  if (!node || !editableNode) return null;

  // Tipos ofrecidos: los de la notación del modelo (o todos si no la declara).
  // Si el nodo trae un tipo ajeno a esa lista, se antepone o el Select saldría vacío.
  const base = notation ? notationTypes(notation, { includeContainers: true }) : ALL_NODE_TYPES;
  const nodeTypes = base.includes(editableNode.tipo_elemento)
    ? base
    : [editableNode.tipo_elemento, ...base];

  const parentLinks = allLinks.filter(
    (link) =>
      (typeof link.target === "string" ? link.target : link.target.id) ===
      node.id
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "nuevo":
        return (
          <Badge
            variant="outline"
            className="bg-success-surface text-success-foreground border-success-border"
          >
            Nuevo
          </Badge>
        );
      case "modificado":
        return (
          <Badge
            variant="outline"
            className="bg-warning-surface text-warning-foreground border-warning-border"
          >
            Modificado
          </Badge>
        );
      case "eliminado":
        return <Badge variant="destructive">Eliminado</Badge>;
      default:
        return <Badge variant="secondary">Sin Cambios</Badge>;
    }
  };

  const handleInputChange = (field: keyof GraphNode, value: any) => {
    setEditableNode((prev) => (prev ? { ...prev, [field]: value } : null));
  };

  // --- FUNCIÓN MODIFICADA ---
  const handleTagsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStringValue = e.target.value;
    // 1. Actualizamos el estado del string del input
    setTagInputValue(newStringValue);

    // 2. Procesamos el string y actualizamos el array en editableNode
    const tags = newStringValue
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    handleInputChange("tags_tecnologia", tags);
  };

  const handleSaveChanges = () => {
    if (editableNode) {
      onNodeUpdate(editableNode);
      onClose();
    }
  };

  return (
    <Dialog open={!!node} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-2">
              {historyCount > 0 && (
                <IconAction
                  variant="ghost"
                  onClick={onBack}
                  className="h-8 w-8"
                  label="Volver al elemento anterior"
                  icon={<ArrowLeft className="h-5 w-5" />}
                />
              )}
              <div>
                {(node.nivel == "process_level" && (
                  <>
                    <DialogTitle className="text-2xl font-bold text-foreground">
                      Editor de Nodo
                    </DialogTitle>
                    <DialogDescription className="text-sm text-muted-foreground">
                      Edita las propiedades del nodo seleccionado. Los cambios
                      se guardarán en el archivo local al confirmar.
                    </DialogDescription>
                  </>
                )) || (
                  <DialogTitle className="text-2xl font-bold text-foreground">
                    Detalle del Nodo
                  </DialogTitle>
                )}
              </div>
            </div>
            <Badge className="bg-primary/10 text-primary hover:bg-primary/20">
              {node.agregado}
            </Badge>
          </div>
        </DialogHeader>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
          <div className="space-y-4">
            <div>
              <Label htmlFor="node-name">Nombre</Label>
              <Input
                id="node-name"
                value={editableNode.nombre}
                onChange={(e) => handleInputChange("nombre", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="node-desc">Descripción</Label>
              <Textarea
                id="node-desc"
                value={editableNode.descripcion}
                onChange={(e) =>
                  handleInputChange("descripcion", e.target.value)
                }
                className="min-h-[100px]"
              />
            </div>
            <div>
              <Label htmlFor="node-tags">
                Etiquetas de Tecnología (separadas por comas)
              </Label>
              {/* --- INPUT MODIFICADO --- */}
              <Input
                id="node-tags"
                value={tagInputValue} // Ahora usa el estado del string
                onChange={handleTagsChange} // La función actualizada maneja ambos estados
              />
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <Label htmlFor="node-type">Tipo de Elemento</Label>
              <Select
                value={editableNode.tipo_elemento}
                onValueChange={(value) =>
                  handleInputChange("tipo_elemento", value)
                }
              >
                <SelectTrigger id="node-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {nodeTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="node-status">Estado Comparativo</Label>
              <Select
                value={editableNode.estado_comparativo}
                onValueChange={(value) =>
                  handleInputChange("estado_comparativo", value)
                }
              >
                <SelectTrigger id="node-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {nodeStatuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Estado Actual
              </p>
              {getStatusBadge(editableNode.estado_comparativo)}
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">
                Relaciones Padre
              </p>
              <ul className="text-sm text-foreground list-disc list-inside space-y-1 max-h-24 overflow-y-auto bg-muted p-2 rounded-md list-none">
                {parentLinks.length > 0 ? (
                  parentLinks.map((link, index) => {
                    const sourceId =
                      typeof link.source === "string"
                        ? link.source
                        : link.source.id;
                    const sourceNode = allNodes.find((n) => n.id === sourceId);
                    if (!sourceNode) return null;

                    const sourceName = sourceNode.nombre;
                    const linkDesc = link.descripcion || "relacionado con";
                    return (
                      <li key={index}>
                        <button
                          onClick={() => onNodeSelect(sourceNode.id)}
                          className="w-full text-left p-1 rounded-md hover:bg-primary/10 cursor-pointer"
                        >
                          <span className="font-medium text-primary">
                            {sourceName}
                          </span>{" "}
                          <span className="text-xs">({linkDesc})</span>
                        </button>
                      </li>
                    );
                  })
                ) : (
                  <li>Este es un nodo de origen.</li>
                )}
              </ul>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button>Guardar Cambios</Button>
            </AlertDialogTrigger>

            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Confirmar cambios?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta acción modificará permanentemente el archivo JSON
                  guardado en tu navegador. ¿Estás seguro de que quieres
                  continuar?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleSaveChanges}>
                  Confirmar y Guardar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NodeModal;
