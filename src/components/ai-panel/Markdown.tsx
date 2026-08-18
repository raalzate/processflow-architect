"use client";

/**
 * Renderizador de Markdown minimalista (sin dependencias).
 * Cubre el subconjunto que produce el agente y los formatters: encabezados,
 * listas, tablas, código en bloque/línea, negrita/cursiva y párrafos.
 * Renderiza a elementos React (no usa dangerouslySetInnerHTML).
 */

import React from "react";
import { MermaidDiagram } from "@/components/canvas/MermaidDiagram";

function renderInline(text: string, keyBase: string): React.ReactNode[] {
  // Tokeniza negrita, cursiva y código en línea.
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[2] !== undefined) parts.push(<strong key={`${keyBase}-b${i}`}>{m[2]}</strong>);
    else if (m[3] !== undefined) parts.push(<em key={`${keyBase}-i${i}`}>{m[3]}</em>);
    else if (m[4] !== undefined)
      parts.push(
        <code key={`${keyBase}-c${i}`} className="rounded-md bg-muted px-1 py-0.5 text-[0.85em] font-mono">
          {m[4]}
        </code>
      );
    last = regex.lastIndex;
    i++;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function Markdown({ content, className }: { content: string; className?: string }) {
  const lines = (content || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let listBuffer: string[] = [];
  let tableBuffer: string[] = [];

  const flushList = () => {
    if (!listBuffer.length) return;
    const items = listBuffer;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="my-2 list-disc pl-5 space-y-1">
        {items.map((li, idx) => (
          <li key={idx}>{renderInline(li.replace(/^[-*]\s+/, ""), `li-${blocks.length}-${idx}`)}</li>
        ))}
      </ul>
    );
    listBuffer = [];
  };

  const flushTable = () => {
    if (!tableBuffer.length) return;
    const rows = tableBuffer
      .filter((r) => !/^\s*\|?[\s|:-]+\|?\s*$/.test(r)) // descarta separador ---
      .map((r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
    const [head, ...body] = rows;
    blocks.push(
      <div key={`tbl-${blocks.length}`} className="my-2 overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          {head && (
            <thead>
              <tr>
                {head.map((c, idx) => (
                  <th key={idx} className="border px-2 py-1 text-left font-semibold bg-muted">
                    {renderInline(c, `th-${idx}`)}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {body.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, ci) => (
                  <td key={ci} className="border px-2 py-1 align-top">
                    {renderInline(c, `td-${ri}-${ci}`)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableBuffer = [];
  };

  while (i < lines.length) {
    const line = lines[i];

    // Código en bloque
    if (/^```/.test(line)) {
      flushList();
      flushTable();
      const lang = line.replace(/^```/, "").trim().toLowerCase();
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        code.push(lines[i]);
        i++;
      }
      i++; // cierre
      if (lang === "mermaid") {
        blocks.push(
          <div key={`mmd-${blocks.length}`} className="my-2">
            <MermaidDiagram code={code.join("\n")} />
          </div>
        );
      } else {
        blocks.push(
          // `whitespace-pre-wrap break-words`: el bloque vive en paneles angostos
          // (chat, tarjeta de artefacto); con `pre` a secas una línea larga
          // ensanchaba al contenedor y el texto de al lado quedaba cortado.
          <pre
            key={`pre-${blocks.length}`}
            className="my-2 overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs font-mono"
          >
            <code>{code.join("\n")}</code>
          </pre>
        );
      }
      continue;
    }

    // Tabla
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushList();
      tableBuffer.push(line);
      i++;
      continue;
    } else if (tableBuffer.length) {
      flushTable();
    }

    // Lista
    if (/^\s*[-*]\s+/.test(line)) {
      tableBuffer.length && flushTable();
      listBuffer.push(line.trim());
      i++;
      continue;
    } else if (listBuffer.length) {
      flushList();
    }

    // Encabezados
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushList();
      flushTable();
      const level = h[1].length;
      const size =
        level <= 1 ? "text-base font-bold" : level === 2 ? "text-sm font-bold" : "text-sm font-semibold";
      blocks.push(
        <p key={`h-${blocks.length}`} className={`mt-3 mb-1 ${size}`}>
          {renderInline(h[2], `h-${blocks.length}`)}
        </p>
      );
      i++;
      continue;
    }

    // Línea en blanco
    if (line.trim() === "") {
      flushList();
      flushTable();
      i++;
      continue;
    }

    // Párrafo
    flushList();
    blocks.push(
      <p key={`p-${blocks.length}`} className="my-1 leading-relaxed">
        {renderInline(line, `p-${blocks.length}`)}
      </p>
    );
    i++;
  }
  flushList();
  flushTable();

  return <div className={className}>{blocks}</div>;
}
