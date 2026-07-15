"use client";

/**
 * Renderiza código Mermaid a SVG en el cliente (import dinámico, sólo navegador).
 * Si el código es inválido, muestra el error y el código fuente como respaldo.
 */

import React, { useEffect, useRef, useState } from "react";

let mermaidInitialized = false;
let mermaidModule: any = null;

async function getMermaid() {
  if (!mermaidModule) {
    mermaidModule = (await import("mermaid")).default;
  }
  if (!mermaidInitialized) {
    mermaidModule.initialize({
      startOnLoad: false,
      theme: "neutral",
      securityLevel: "strict",
      flowchart: { useMaxWidth: true, htmlLabels: true },
      // Diagramas de secuencia: márgenes cómodos, actores espejados abajo y
      // ancho adaptable para que no se aplaste con pocos participantes.
      sequence: {
        useMaxWidth: true,
        mirrorActors: true,
        showSequenceNumbers: false,
        wrap: true,
        actorMargin: 60,
        boxMargin: 12,
      },
    });
    mermaidInitialized = true;
  }
  return mermaidModule;
}

let idCounter = 0;

export function MermaidDiagram({ code }: { code: string }) {
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");
  const idRef = useRef(`mmd-${++idCounter}`);

  useEffect(() => {
    let cancelled = false;
    setError("");
    setSvg("");
    if (!code?.trim()) return;
    (async () => {
      try {
        const mermaid = await getMermaid();
        const { svg } = await mermaid.render(idRef.current, code.trim());
        if (!cancelled) setSvg(svg);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "No se pudo renderizar el diagrama.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-destructive">Diagrama inválido: {error}</p>
        <pre className="overflow-x-auto rounded bg-muted p-3 text-xs font-mono">
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
