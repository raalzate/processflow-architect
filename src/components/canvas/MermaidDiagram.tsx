"use client";

/**
 * Renderiza código Mermaid a SVG en el cliente (import dinámico, sólo navegador).
 * Si el código es inválido, muestra el error y el código fuente como respaldo.
 * Re-renderiza al cambiar el tema de la app (#621): el SVG lleva los colores
 * horneados, no los hereda.
 */

import React, { useEffect, useRef, useState } from "react";

import { configMermaidParaTema } from "@/lib/mermaid/render-config";
import type { EffectiveTheme } from "@/lib/theme";

let mermaidModule: any = null;
let temaInicializado: EffectiveTheme | null = null;

async function getMermaid(tema: EffectiveTheme) {
  if (!mermaidModule) {
    mermaidModule = (await import("mermaid")).default;
  }
  // Mermaid es un singleton: sólo se reinicializa si el tema cambió desde el
  // último render, para no pagar el initialize en cada diagrama.
  if (temaInicializado !== tema) {
    mermaidModule.initialize(configMermaidParaTema(tema));
    temaInicializado = tema;
  }
  return mermaidModule;
}

/**
 * El tema que se está pintando, leído de la clase del `<html>` (la pone
 * `use-theme`). Se observa la clase y no el hook porque el hook guarda estado
 * por instancia: cambiar el tema en otro lado no lo enteraría.
 */
function temaDelDocumento(): EffectiveTheme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function useTemaDelDocumento(): EffectiveTheme {
  const [tema, setTema] = useState<EffectiveTheme>(() =>
    typeof document === "undefined" ? "dark" : temaDelDocumento(),
  );
  useEffect(() => {
    setTema(temaDelDocumento());
    const obs = new MutationObserver(() => setTema(temaDelDocumento()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return tema;
}

let idCounter = 0;

export function MermaidDiagram({ code }: { code: string }) {
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");
  const idRef = useRef(`mmd-${++idCounter}`);
  const tema = useTemaDelDocumento();

  useEffect(() => {
    let cancelled = false;
    setError("");
    setSvg("");
    if (!code?.trim()) return;
    (async () => {
      try {
        const mermaid = await getMermaid(tema);
        const { svg } = await mermaid.render(idRef.current, code.trim());
        if (!cancelled) setSvg(svg);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "No se pudo renderizar el diagrama.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, tema]);

  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-destructive">Diagrama inválido: {error}</p>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs font-mono">
          <code>{code}</code>
        </pre>
      </div>
    );
  }

  if (!svg) {
    return <p className="text-xs text-muted-foreground">Renderizando diagrama…</p>;
  }

  return (
    <div
      className="mermaid-svg flex justify-center overflow-x-auto [&_svg]:max-w-full [&_svg]:h-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
