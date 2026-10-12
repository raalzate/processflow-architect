"use client";

/**
 * Perfiles de marca del equipo (spec 023): `localStorage`, como el tema. Varias
 * pantallas los leen a la vez (Ajustes los edita, el lienzo los aplica), así
 * que un cambio se anuncia con un evento del documento y todas se enteran sin
 * remontar.
 */

import { useCallback, useEffect, useState } from "react";
import { BRAND_STORAGE_KEY, borrarPerfil, guardarPerfil, leerPerfiles, serializarPerfiles } from "@/lib/brand/storage";
import type { PerfilDeMarca } from "@/lib/brand/profile";

const EVENTO = "brand-profiles-changed";

function leer(): PerfilDeMarca[] {
  try {
    return leerPerfiles(window.localStorage.getItem(BRAND_STORAGE_KEY));
  } catch {
    return [];
  }
}

function escribir(perfiles: PerfilDeMarca[]): void {
  try {
    window.localStorage.setItem(BRAND_STORAGE_KEY, serializarPerfiles(perfiles));
  } catch {
    /* sin almacenamiento (privado, cuota): la sesión sigue en memoria */
  }
  window.dispatchEvent(new Event(EVENTO));
}

export function useBrandProfiles() {
  // Vacío en el primer render (SSR/hidratación); se llena en el efecto.
  const [perfiles, setPerfiles] = useState<PerfilDeMarca[]>([]);

  useEffect(() => {
    const refrescar = () => setPerfiles(leer());
    // Sólo nuestra clave (o un `clear`): otra escritura a localStorage desde
    // otra ventana no debe pisar lo que se está editando acá.
    const desdeOtraVentana = (e: StorageEvent) => {
      if (e.key === null || e.key === BRAND_STORAGE_KEY) refrescar();
    };
    refrescar();
    window.addEventListener(EVENTO, refrescar);
    window.addEventListener("storage", desdeOtraVentana);
    return () => {
      window.removeEventListener(EVENTO, refrescar);
      window.removeEventListener("storage", desdeOtraVentana);
    };
  }, []);

  const guardar = useCallback((perfil: PerfilDeMarca) => escribir(guardarPerfil(leer(), perfil)), []);
  const borrar = useCallback((id: string) => escribir(borrarPerfil(leer(), id)), []);

  return { perfiles, guardar, borrar };
}
