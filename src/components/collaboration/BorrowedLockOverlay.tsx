"use client";

import { Lock } from "lucide-react";
import { useCollaboration } from "@/context/CollaborationContext";
import { formatRemaining } from "@/lib/collaboration/lease";

/**
 * Copia prestada sin anfitrión (#756): el contenido se tapa, no se vacía. El lienzo
 * nunca queda en blanco sin explicación: el aviso dice por qué y cuánto falta.
 */
export function BorrowedLockOverlay() {
  const collaboration = useCollaboration();
  if (!collaboration?.locked) return null;
  const lease = collaboration.status?.lease;
  const waiting = !lease || lease.state === "locked";
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xl"
    >
      <div className="max-w-md space-y-3 rounded-lg border bg-card p-6 text-center shadow-lg">
        <Lock className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-lg font-semibold">Anfitrión desconectado</h2>
        <p className="text-sm text-muted-foreground">
          Este proyecto es una copia compartida y sólo se puede usar mientras el anfitrión está conectado.
        </p>
        {waiting && lease ? (
          <p className="text-sm">
            Si no vuelve en <strong>{formatRemaining(lease.remainingMs)}</strong>, la copia se eliminará de este
            equipo.
          </p>
        ) : waiting ? (
          <p className="text-sm">Esperando al anfitrión…</p>
        ) : (
          <p className="text-sm">El préstamo terminó: la copia se está eliminando.</p>
        )}
      </div>
    </div>
  );
}
