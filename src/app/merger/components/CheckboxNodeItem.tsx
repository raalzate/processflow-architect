"use client";
import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { IconAction } from "@/components/ui/icon-action";
import { accion } from "@/lib/action-labels";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Trash2, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GraphNode } from "@/lib/types";

interface Props {
  node: GraphNode;
  isChecked: boolean;
  onCheckedChange: (checked: boolean) => void;
  onDelete: (nodeId: string, nodeName: string) => void;
  onView: (node: GraphNode) => void;
}

const CheckboxNodeItem: React.FC<Props> = ({
  node,
  isChecked,
  onCheckedChange,
  onDelete,
  onView,
}) => {
  const id = `check-${node.id}`;

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(node.id, node.nombre);
  };

  const handleViewClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onView(node);
  };

  return (
    <div
      className={cn(
        "flex items-center space-x-3 space-y-0 rounded-md border p-4 transition-colors",
        isChecked ? "bg-primary/10 border-primary" : "bg-card hover:bg-muted"
      )}
    >
      <Checkbox id={id} checked={isChecked} onCheckedChange={onCheckedChange} />
      <div className="grid gap-1.5 leading-none w-full">
        <Label
          htmlFor={id}
          className="font-semibold text-sm cursor-pointer hover:text-primary"
        >
          {node.nombre}
        </Label>
        <p className="text-xs text-muted-foreground">{node.agregado}</p>
        {node.tags_tecnologia && node.tags_tecnologia.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-2">
            {node.tags_tecnologia.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="flex-shrink-0 ml-auto flex items-center gap-1">
        <IconAction
          variant="ghost"
          className="text-muted-foreground hover:text-primary"
          onClick={handleViewClick}
          label={accion("abrir", "el elemento")}
          icon={<Eye className="h-4 w-4" />}
        />
        <IconAction
          variant="ghost"
          className="text-muted-foreground hover:text-destructive"
          onClick={handleDeleteClick}
          label={accion("eliminar", "el elemento")}
          icon={<Trash2 className="h-4 w-4" />}
        />
      </div>
    </div>
  );
};

export default CheckboxNodeItem;
