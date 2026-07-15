"use client";
import * as React from "react";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Pencil, Eye } from "lucide-react";
import type { GraphNode } from "@/lib/types";

interface Props {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  node: any | null;
  onConfirmEdit: (nodeId: string, updatedData: Partial<any>) => void;
  isReadOnly: boolean;
}

const EditNodeDialog: React.FC<Props> = ({ isOpen, onOpenChange, node, onConfirmEdit, isReadOnly }) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");

  useEffect(() => {
    if (node) {
      setName(node.nombre);
      setDescription(node.descripcion || "");
      setTagsInput((node.tags_tecnologia || []).join(", "));
    }
  }, [node]);

  if (!node) return null;

  const handleSave = () => {
    if (isReadOnly) return;

    const updatedTags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    const updatedData: Partial<GraphNode> = {
      nombre: name.trim(),
      descripcion: description.trim(),
      tags_tecnologia: updatedTags,
    };
    onConfirmEdit(node.id, updatedData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isReadOnly ? <Eye className="h-5 w-5" /> : <Pencil className="h-5 w-5" />}
            {isReadOnly ? "Ver Nodo" : "Editar Nodo"}
          </DialogTitle>
          <DialogDescription>
            {isReadOnly ? "Viendo los detalles del nodo. No se pueden hacer cambios." : "Modifica los detalles del nodo. Los cambios se guardarán permanentemente."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          <div className="flex items-center gap-4">
            <Label htmlFor="edit-name" className="w-20 text-right shrink-0">Nombre</Label>
            <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} className="flex-1" readOnly={isReadOnly} />
          </div>

          <div className="flex items-start gap-4">
            <Label htmlFor="edit-description" className="w-20 text-right shrink-0 pt-2">Descripción</Label>
            <Textarea id="edit-description" value={description} onChange={(e) => setDescription(e.target.value)} className="flex-1 min-h-[100px]" placeholder="Añade una descripción..." readOnly={isReadOnly} />
          </div>

          <div className="flex items-start gap-4">
            <Label htmlFor="edit-tags" className="w-20 text-right shrink-0 pt-2">Tags</Label>
            <div className="flex-1 grid gap-2">
              <Input id="edit-tags" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} className="w-full" placeholder="tag1, tag2, tag3" readOnly={isReadOnly} />
              {!isReadOnly && <p className="text-xs text-muted-foreground">Separa los tags con comas.</p>}
            </div>
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">{isReadOnly ? "Cerrar" : "Cancelar"}</Button>
          </DialogClose>
          {!isReadOnly && <Button type="button" onClick={handleSave}>Guardar Cambios</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditNodeDialog;
