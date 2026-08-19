"use client";

/**
 * Editor de un artefacto LARGO. El visor original (un `textarea` en una modal
 * de 3xl) alcanzaba para veinte líneas; con una propuesta técnica de verdad no
 * se puede navegar, ni buscar, ni saber dónde estás parado.
 *
 * Lo que agrega: índice de encabezados navegable, búsqueda y reemplazo,
 * estadísticas del documento, posición del cursor, scroll sincronizado con la
 * vista previa, atajos de teclado y borrador que sobrevive cerrar la modal.
 *
 * Toda la lógica de texto es pura y vive en `src/lib/artifacts/` (§P3):
 * `editing.ts` (barra Markdown, pegado, payload) y `outline.ts` (índice,
 * estadísticas, búsqueda). Acá sólo hay DOM y foco.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Markdown } from "./Markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  applyMarkdownAction,
  insertAtSelection,
  type MarkdownAction,
} from "@/lib/artifacts/editing";
import {
  documentOutline,
  documentStats,
  findMatches,
  lineOffsets,
  nextMatchIndex,
  replaceAllMatches,
  replaceMatch,
} from "@/lib/artifacts/outline";
import {
  Bold,
  ChevronLeft,
  ChevronRight,
  Code,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTree,
  Quote,
  Replace,
  Search,
  Table,
  X,
} from "lucide-react";

/** Barra de acciones Markdown. */
const BARRA: { action: MarkdownAction; Icon: typeof Bold; label: string }[] = [
  { action: "heading", Icon: Heading2, label: "Título" },
  { action: "bold", Icon: Bold, label: "Negrita" },
  { action: "italic", Icon: Italic, label: "Cursiva" },
  { action: "code", Icon: Code, label: "Código" },
  { action: "bullet", Icon: List, label: "Lista" },
  { action: "numbered", Icon: ListOrdered, label: "Lista numerada" },
  { action: "quote", Icon: Quote, label: "Cita" },
  { action: "link", Icon: Link2, label: "Enlace" },
  { action: "table", Icon: Table, label: "Tabla" },
];

export interface ArtifactEditorHandle {
  /** Pega texto en el cursor (lo usa el botón «Pegar» de la modal). */
  paste: (text: string) => void;
}

export function ArtifactEditor({
  value,
  onChange,
  onSave,
  preview,
  editorRef,
}: {
  value: string;
  onChange: (next: string) => void;
  /** ⌘S / Ctrl+S: guardar sin ir al botón. */
  onSave: () => void;
  preview: boolean;
  editorRef?: React.MutableRefObject<ArtifactEditorHandle | null>;
}) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [hit, setHit] = useState(0);
  const [cursor, setCursor] = useState(0);

  const outline = useMemo(() => documentOutline(value), [value]);
  const stats = useMemo(() => documentStats(value), [value]);
  const matches = useMemo(
    () => (query ? findMatches(value, query, { caseSensitive }) : []),
    [value, query, caseSensitive]
  );

  /** Línea:columna del cursor, para orientarse en un documento largo. */
  const posicion = useMemo(() => {
    const offsets = lineOffsets(value);
    let linea = 0;
    for (let i = 0; i < offsets.length; i++) if (offsets[i] <= cursor) linea = i;
    return { line: linea + 1, col: cursor - offsets[linea] + 1 };
  }, [value, cursor]);

  const seleccionar = useCallback((start: number, end: number) => {
    const el = areaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(start, end);
    // `scrollTop` proporcional: el textarea no tiene «scrollIntoView» de rangos.
    const antes = el.value.slice(0, start).split("\n").length - 1;
    const alto = el.scrollHeight / Math.max(1, el.value.split("\n").length);
    el.scrollTop = Math.max(0, antes * alto - el.clientHeight / 3);
    setCursor(start);
  }, []);

  const sel = () => {
    const el = areaRef.current;
    return el ? { start: el.selectionStart, end: el.selectionEnd } : { start: value.length, end: value.length };
  };

  const aplicar = useCallback(
    (r: { text: string; start: number; end: number }) => {
      onChange(r.text);
      requestAnimationFrame(() => seleccionar(r.start, r.end));
    },
    [onChange, seleccionar]
  );

  useEffect(() => {
    if (!editorRef) return;
    editorRef.current = { paste: (texto: string) => aplicar(insertAtSelection(value, sel(), texto)) };
  }, [editorRef, aplicar, value]);

  /** Salta a una coincidencia (índice del array `matches`). */
  const irA = useCallback(
    (indice: number) => {
      if (!matches.length) return;
      const i = ((indice % matches.length) + matches.length) % matches.length;
      setHit(i);
      seleccionar(matches[i].start, matches[i].end);
    },
    [matches, seleccionar]
  );

  const buscarSiguiente = useCallback(
    (atras = false) => {
      if (!matches.length) return;
      irA(nextMatchIndex(matches, atras ? cursor : cursor + 1, atras));
    },
    [matches, cursor, irA]
  );

  // Atajos: los del sistema (⌘S guardar, ⌘F buscar) y los de formato.
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "s") {
      e.preventDefault();
      onSave();
      return;
    }
    if (mod && e.key.toLowerCase() === "f") {
      e.preventDefault();
      setSearchOpen(true);
      return;
    }
    if (mod && e.key.toLowerCase() === "b") {
      e.preventDefault();
      aplicar(applyMarkdownAction(value, sel(), "bold"));
      return;
    }
    if (mod && e.key.toLowerCase() === "i") {
      e.preventDefault();
      aplicar(applyMarkdownAction(value, sel(), "italic"));
      return;
    }
    if (mod && e.key === "g") {
      e.preventDefault();
      buscarSiguiente(e.shiftKey);
      return;
    }
    // Tab dentro del editor indenta en vez de saltar de control: en un documento
    // largo se usa para anidar listas y perder el foco es peor que no indentar.
    if (e.key === "Tab") {
      e.preventDefault();
      aplicar(insertAtSelection(value, sel(), "  "));
    }
  };

  /** Scroll sincronizado editor → vista previa (proporcional al alto). */
  const onScroll = () => {
    const a = areaRef.current;
    const p = previewRef.current;
    if (!a || !p) return;
    const max = a.scrollHeight - a.clientHeight;
    if (max <= 0) return;
    p.scrollTop = (a.scrollTop / max) * (p.scrollHeight - p.clientHeight);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Barra Markdown + índice + búsqueda */}
      <div className="flex flex-wrap items-center gap-0.5 border-b px-2 py-1">
        <Button
          variant={outlineOpen ? "secondary" : "ghost"}
          size="icon"
          className="h-7 w-7"
          title="Índice del documento"
          aria-label="Índice del documento"
          onClick={() => setOutlineOpen((o) => !o)}
        >
          <ListTree className="h-3.5 w-3.5" />
        </Button>
        <span className="mx-1 h-4 w-px bg-border" />
        {BARRA.map(({ action, Icon: I, label }) => (
          <Button
            key={action}
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title={label}
            aria-label={label}
            onClick={() => aplicar(applyMarkdownAction(value, sel(), action))}
          >
            <I className="h-3.5 w-3.5" />
          </Button>
        ))}
        <span className="mx-1 h-4 w-px bg-border" />
        <Button
          variant={searchOpen ? "secondary" : "ghost"}
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => setSearchOpen((s) => !s)}
        >
          <Search className="h-3.5 w-3.5" /> Buscar
          <kbd className="ml-1 rounded border bg-muted px-1 text-2xs">⌘F</kbd>
        </Button>
      </div>

      {searchOpen && (
        <div className="flex flex-wrap items-center gap-1.5 border-b bg-muted/30 px-2 py-1.5">
          <Input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHit(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                buscarSiguiente(e.shiftKey);
              }
              if (e.key === "Escape") setSearchOpen(false);
            }}
            placeholder="Buscar en el documento…"
            className="h-7 w-52 text-xs"
            aria-label="Buscar en el documento"
          />
          <span className="min-w-16 text-2xs text-muted-foreground">
            {query ? (matches.length ? `${hit + 1}/${matches.length}` : "sin resultados") : ""}
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Anterior" onClick={() => buscarSiguiente(true)}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Siguiente" onClick={() => buscarSiguiente(false)}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={caseSensitive ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2 font-mono text-2xs"
            title="Distinguir mayúsculas"
            onClick={() => setCaseSensitive((c) => !c)}
          >
            Aa
          </Button>
          <span className="mx-1 h-4 w-px bg-border" />
          <Input
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            placeholder="Reemplazar por…"
            className="h-7 w-44 text-xs"
            aria-label="Reemplazar por"
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            disabled={!matches.length}
            onClick={() => {
              const m = matches[Math.min(hit, matches.length - 1)];
              if (!m) return;
              onChange(replaceMatch(value, m, replacement));
              requestAnimationFrame(() => seleccionar(m.start, m.start + replacement.length));
            }}
          >
            <Replace className="h-3.5 w-3.5" /> Uno
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            disabled={!matches.length}
            onClick={() => onChange(replaceAllMatches(value, query, replacement, { caseSensitive }).text)}
          >
            Todos ({matches.length})
          </Button>
          <Button variant="ghost" size="icon" className="ml-auto h-7 w-7" title="Cerrar" onClick={() => setSearchOpen(false)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Índice · editor · vista previa */}
      <div className="flex min-h-0 flex-1">
        {outlineOpen && (
          <nav className="w-56 shrink-0 overflow-y-auto border-r bg-muted/20 p-2" aria-label="Índice del documento">
            <p className="px-1 pb-1 text-2xs font-semibold uppercase text-muted-foreground">Índice</p>
            {outline.length === 0 ? (
              <p className="px-1 text-2xs text-muted-foreground">
                Sin encabezados. Usá <span className="font-mono">##</span> para dividir el documento.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {outline.map((h, i) => (
                  <li key={`${h.line}-${i}`}>
                    <button
                      type="button"
                      onClick={() => seleccionar(h.offset, h.offset)}
                      className="w-full truncate rounded px-1 py-0.5 text-left text-xs hover:bg-muted"
                      style={{ paddingLeft: `${(h.level - 1) * 10 + 4}px` }}
                      title={h.text}
                    >
                      <span className={h.level <= 2 ? "font-medium" : "text-muted-foreground"}>{h.text}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </nav>
        )}

        <div className={`grid min-h-0 flex-1 ${preview ? "md:grid-cols-2" : "grid-cols-1"}`}>
          <Textarea
            ref={areaRef}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setCursor(e.target.selectionStart);
            }}
            onKeyUp={(e) => setCursor((e.target as HTMLTextAreaElement).selectionStart)}
            onClick={(e) => setCursor((e.target as HTMLTextAreaElement).selectionStart)}
            onKeyDown={onKeyDown}
            onScroll={onScroll}
            spellCheck={false}
            aria-label="Editor Markdown del artefacto"
            // Mono + interlineado holgado: el Markdown se edita como texto, y con
            // la tipografía de la UI las tablas dejan de alinearse.
            className="h-full min-h-0 resize-none rounded-none border-0 border-r font-mono text-xs leading-relaxed focus-visible:ring-0 md:text-xs"
          />
          {preview && (
            <div ref={previewRef} className="min-h-0 overflow-y-auto bg-muted/10 p-4">
              <Markdown content={value} />
            </div>
          )}
        </div>
      </div>

      {/* Estado del documento */}
      <div className="flex flex-wrap items-center gap-3 border-t bg-muted/30 px-3 py-1 text-2xs text-muted-foreground">
        <span>
          {stats.words} palabras · {stats.chars} caracteres · {stats.lines} líneas · {stats.headings} encabezados
        </span>
        {stats.readingMinutes > 0 && <span>~{stats.readingMinutes} min de lectura</span>}
        <span className="ml-auto font-mono">
          L{posicion.line}:{posicion.col}
        </span>
        <span className="hidden sm:inline">⌘S guarda · ⌘F busca · ⌘B/⌘I formato · Tab indenta</span>
      </div>
    </div>
  );
}
