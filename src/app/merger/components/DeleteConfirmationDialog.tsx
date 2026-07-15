"use client";
import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  nodeName: string | null;
  onConfirmDelete: () => void;
}

const DeleteConfirmationDialog: React.FC<Props> = ({
  isOpen,
  onOpenChange,
  nodeName,
  onConfirmDelete,
}) => {
  if (!nodeName) return null;

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="text-destructive" /> ¿Confirmar Eliminación?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Esta acción es <strong>permanente e irreversible</strong>. El nodo <strong className="text-foreground">{nodeName}</strong> será eliminado, junto con <strong>todas sus conexiones</strong> en todo el grafo.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Sí, eliminar permanentemente
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteConfirmationDialog;
