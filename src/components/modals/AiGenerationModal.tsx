import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AiGenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: string;
}

export function AiGenerationModal({
  isOpen,
  onClose,
  title,
  content,
}: AiGenerationModalProps) {
  const { toast } = useToast();
  const [isCopied, setIsCopied] = React.useState(false);

  const handleCopy = async () => {
    if (!content) return;
    
    let success = false;
    if (window.electronAPI && window.electronAPI.copyToClipboard) {
        success = await window.electronAPI.copyToClipboard(content);
    } else {
        try {
            await navigator.clipboard.writeText(content);
            success = true;
        } catch (err) {
            console.error("Failed to copy:", err);
        }
    }

    if (success) {
      setIsCopied(true);
      toast({ title: "Copiado al portapapeles" });
      setTimeout(() => setIsCopied(false), 2000);
    } else {
        toast({ variant: "destructive", title: "Error al copiar" });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Contenido generado por inteligencia artificial. Revísalo antes de usarlo.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-hidden border rounded-md bg-muted/50 p-4 mt-2">
            <ScrollArea className="h-[400px] w-full pr-4">
                <div className="whitespace-pre-wrap text-sm font-mono">
                    {content}
                </div>
            </ScrollArea>
        </div>

        <DialogFooter className="gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
          <Button onClick={handleCopy} disabled={!content}>
            {isCopied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
            {isCopied ? "Copiado" : "Copiar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
