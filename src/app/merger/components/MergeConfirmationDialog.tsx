"use client";
import * as React from "react";
import { useEffect, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GitMerge, AlertTriangle } from "lucide-react";
import type { GraphNode } from "@/lib/types";

type ContainerState = { primary: string[]; secondary: string[] };

interface Props {
  type: string;
  containers: ContainerState;
  allNodesMap: Map<string, any>;
  onConfirmMerge: (type: string, newName: string) => void;
}

const MergeConfirmationDialog: React.FC<Props> = ({
  type,
  containers,
  allNodesMap,
  onConfirmMerge,
}) => {
  const primaryId = containers.primary[0];
  const secondaryIds = containers.secondary;
  if (!primaryId || !secondaryIds || secondaryIds.length === 0) return null;
  const primaryNode = allNodesMap.get(primaryId);
  const secondaryNodes = secondaryIds
    .map((id) => allNodesMap.get(id))
    .filter(Boolean) as GraphNode[];
  const [newName, setNewName] = useState(primaryNode?.nombre || "");

  useEffect(() => {
    if (primaryNode) setNewName(primaryNode.nombre);
  }, [primaryNode]);

  if (!primaryNode) return null;

  const handleConfirm = () => {
    const finalName = newName.trim() === "" ? primaryNode.nombre : newName.trim();
    onConfirmMerge(type, finalName);
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="lg" className="w-full">
          <GitMerge className="mr-2 h-5 w-5" />
          Fusionar {secondaryNodes.length + 1} Nodos de tipo '{type}'
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="text-destructive" /> ¿Confirmar Fusión?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Esta acción es <strong>destructiva</strong>. Los nodos secundarios se eliminarán
            y todas sus conexiones apuntarán al nodo principal. Esta acción no
            se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="text-sm space-y-4 my-4">
          <p>
            Nodo Principal (permanecerá): <strong className="text-primary">{primaryNode.nombre}</strong>
          </p>
          <p>
            Los siguientes {secondaryNodes.length} nodo(s) serán <strong>eliminados</strong>:
          </p>
          <ul className="list-disc list-inside bg-muted/50 p-3 rounded-md max-h-32 overflow-y-auto">
            {secondaryNodes.map((node) => (
              <li key={node.id} className="font-semibold">{node.nombre}</li>
            ))}
          </ul>
          <div className="space-y-2 mt-4 text-left">
            <Label htmlFor="new-name" className="font-semibold">Nuevo nombre (opcional)</Label>
            <Input id="new-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={primaryNode.nombre} className="bg-background" />
            <p className="text-xs text-muted-foreground">El nodo principal se renombrará a este valor.</p>
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>Sí, fusionar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default MergeConfirmationDialog;
