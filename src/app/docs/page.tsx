"use client";

/**
 * @fileOverview Documentación in-app del diseñador.
 *
 * Reemplaza al enlace externo del menú Ayuda. Explica el lienzo (contenedores,
 * conexiones, estados del cambio, vistas) y TODOS los componentes gráficos de
 * cada notación. Las fichas de elementos se AUTOGENERAN del registro
 * (`notations.ts` + `notation-help.ts`): si se añade un tipo nuevo, aparece
 * aquí solo, con su misma forma, color e icono del lienzo.
 */

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  MousePointerSquareDashed,
  GitCompareArrows,
  Layers,
  Boxes,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BetaBadge, SofkaCredits } from "@/components/layout/SofkaCredits";
import { versionLabel } from "@/lib/credits";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { NOTATION_LIST, type Notation, type NotationElement } from "@/lib/notations";
import { NOTATION_HELP } from "@/lib/notation-help";
import { iconForType, NodeShape, CHANGE_STATES } from "@/components/graph/designer/DesignerCanvas";

// Secciones: lienzo + estados + vistas + una por notación (para el sidebar).
const SECTIONS = [
  { id: "lienzo", label: "El lienzo", icon: MousePointerSquareDashed },
  { id: "estados", label: "Estados del cambio", icon: GitCompareArrows },
  { id: "vistas", label: "Vistas", icon: Layers },
  ...NOTATION_LIST.map((n) => ({ id: `not-${n.id}`, label: n.label, icon: Boxes })),
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

/** Vista previa en miniatura de un elemento, con su MISMO estilo del lienzo. */
function ElementPreview({ el }: { el: NotationElement }) {
  const Icon = iconForType(el.type);
  const w = 96;
  const h = 44;
  return (
    <svg width={w} height={h} className="shrink-0">
      {el.container ? (
        <rect
          x={2}
          y={2}
          width={w - 4}
          height={h - 4}
          rx={8}
          strokeDasharray="6 6"
          strokeWidth={2}
          className={cn("fill-transparent", el.stroke ?? "stroke-muted-foreground")}
        />
      ) : (
        <NodeShape
          shape={el.shape ?? "rounded"}
          w={w}
          h={h}
          compact={el.compact}
          strokeWidth={2}
          className={cn(el.transparent ? "fill-transparent" : el.bg, el.stroke ?? el.border)}
        />
      )}
      {!el.hideIcon && (
        <foreignObject width={w} height={h} className="pointer-events-none">
          <div className={cn("w-full h-full flex items-center justify-center", el.text)}>
            <Icon className="w-4 h-4" />
          </div>
        </foreignObject>
      )}
    </svg>
  );
}

/** Ficha de un elemento: preview + nombre + descripción y ejemplo del catálogo. */
function ElementCard({ el }: { el: NotationElement }) {
  const help = NOTATION_HELP[el.type];
  return (
    <div className="flex items-start gap-4 rounded-lg border bg-card p-3">
      <ElementPreview el={el} />
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm">{el.type}</span>
          {el.container && (
            <Badge variant="outline" className="text-2xs px-1 py-0">
              contenedor
            </Badge>
          )}
          {el.compact && (
            <Badge variant="outline" className="text-2xs px-1 py-0">
              símbolo compacto
            </Badge>
          )}
        </div>
        {help ? (
          <>
            <p className="text-sm text-muted-foreground mt-1">{help.description}</p>
            <p className="text-xs text-muted-foreground mt-1.5 italic">
              <span className="font-medium not-italic">Ejemplo: </span>
              {help.example}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground mt-1 italic">Sin descripción.</p>
        )}
      </div>
    </div>
  );
}

/** Sección completa de una notación: descripción + grupos de la paleta. */
function NotationSection({ notation }: { notation: Notation }) {
  const byType = Object.fromEntries(notation.elements.map((e) => [e.type, e]));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Boxes className="w-5 h-5" /> {notation.label}
        </CardTitle>
        <CardDescription className="mt-1.5">{notation.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {notation.paletteGroups.map((g) => (
          <div key={g.label}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              {g.label}
            </h3>
            <div className="space-y-2">
              {g.types.map((t) => (byType[t] ? <ElementCard key={t} el={byType[t]} /> : null))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState<SectionId>("lienzo");
  const scrollRef = useRef<HTMLElement | null>(null);

  // Resalta en el sidebar la sección visible (scroll-spy sobre el contenedor).
  useEffect(() => {
    const rootEl = scrollRef.current;
    if (!rootEl) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveSection(visible.target.id as SectionId);
      },
      { root: rootEl, rootMargin: "-10% 0px -60% 0px" }
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const scrollToSection = (id: SectionId) => {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="bg-card border-b shadow-sm w-full p-4 z-10 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-foreground font-headline flex items-center gap-2">
            <BookOpen className="w-5 h-5" /> Documentación del diseñador
          </h1>
          <p className="text-sm text-muted-foreground">
            El lienzo, los estados del cambio, las vistas y todos los componentes gráficos de cada
            notación (DDD, BPMN, C4, UML).
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Analizador
          </Link>
        </Button>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Sidebar de navegación entre secciones (scroll-spy). */}
        <aside className="w-60 shrink-0 border-r bg-card p-4 hidden md:block overflow-y-auto">
          <nav className="space-y-1">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => scrollToSection(s.id)}
                className={cn(
                  "w-full flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-left transition-colors",
                  activeSection === s.id
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <s.icon className="w-4 h-4 shrink-0" />
                {s.label}
              </button>
            ))}
          </nav>
        </aside>

        <main ref={scrollRef} className="flex-1 overflow-y-auto p-8">
          <div className="w-full max-w-3xl mx-auto space-y-6">
            {/* ===== El lienzo ===== */}
            <section id="lienzo" className="scroll-mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MousePointerSquareDashed className="w-5 h-5" /> El lienzo
                  </CardTitle>
                  <CardDescription className="mt-1.5">
                    Cómo se construye un diagrama en el diseñador, sea cual sea la notación.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    <b className="text-foreground">Añadir elementos:</b> arrastra cualquier tipo
                    desde la paleta de la izquierda al lienzo. El selector de arriba de la paleta
                    cambia la notación de la vista activa (DDD, BPMN, C4 o UML) y con ella los
                    tipos disponibles.
                  </p>
                  <p>
                    <b className="text-foreground">Contenedores:</b> los tipos marcados como
                    contenedor (borde discontinuo: Agregado, Pool, Carril, Límite de Sistema,
                    Paquete…) agrupan a los nodos que sueltes dentro. Se redimensionan desde su
                    esquina inferior derecha.
                  </p>
                  <p>
                    <b className="text-foreground">Conectar:</b> al pasar el ratón sobre un nodo
                    aparecen 4 puertos azules; arrastra desde uno hasta otro elemento para crear la
                    relación. Doble clic sobre la línea añade un punto de quiebre y doble clic
                    sobre su etiqueta la edita (en compuertas y decisiones, etiqueta cada rama con
                    su condición: Sí / No / la guarda). En enrutado curvo la manija redonda es el
                    vértice del arco: arrástrala al otro lado de la línea para invertir la comba
                    (doble clic la restablece), o usa «Invertir curva» en la ficha del enlace. La
                    etiqueta se arrastra cuando tapa algo y «Centrar etiqueta» la devuelve al trazo.
                  </p>
                  <p>
                    <b className="text-foreground">Editar:</b> doble clic en un elemento abre su
                    ficha: nombre, descripción, tipo, estado del cambio, tecnologías (se muestran
                    como <i>[java, spring]</i> bajo el nombre), colores personalizados y la vista
                    embebida. <b className="text-foreground">No hay botón «Guardar»:</b> lo que
                    escribís se guarda solo y la ficha se cierra con <i>Esc</i> o con «Cerrar»
                    (Deshacer, <i>Ctrl/⌘+Z</i>, revierte). Tampoco es modal: con ella abierta,
                    hacer clic en otro elemento pasa a editar ESE.
                  </p>
                  <p>
                    <b className="text-foreground">Copiar y pegar:</b> clic derecho sobre un
                    elemento abre el menú contextual (editar, copiar, cortar, duplicar, pegar aquí,
                    eliminar); sobre el vacío, ofrece pegar en ese punto y seleccionar todo. Con el
                    teclado: <i>Ctrl/⌘+C · X · V</i>, <i>Ctrl/⌘+D</i> duplica y <i>Ctrl/⌘+A</i>
                    selecciona todo lo visible. Copiar un contenedor se lleva su contenido y los
                    enlaces internos; lo pegado llega con nombre libre y queda seleccionado.
                  </p>
                  <p>
                    <b className="text-foreground">Vista embebida (subproceso):</b> un elemento
                    puede enlazar otra vista para detallarlo (estilo «call activity» BPMN). El nodo
                    muestra una marca <b>⊞</b> apoyada en su borde inferior; clic en ella para
                    entrar y darle profundidad. El menú de clic derecho trae «Crear subproceso» y
                    «Abrir subproceso» (deshabilitado si el elemento todavía no tiene vista).
                  </p>
                  <p>
                    <b className="text-foreground">Tipo de relación (UML):</b> en la ficha del
                    enlace se elige qué relación es, y la PUNTA lo dice: flecha (asociación),
                    triángulo hueco (herencia), triángulo hueco punteado (realización/implementa),
                    rombo relleno del lado del todo (composición), rombo hueco (agregación) y
                    punteada con flecha (dependencia).
                  </p>
                  <p>
                    <b className="text-foreground">Secuencia UML:</b> arrastra una
                    <i> Línea de Vida</i> por participante — es un contenedor y el tiempo baja por
                    su línea punteada. Las <i>Activaciones</i> van dentro, los <i>Fragmentos</i>
                    encierran lo condicional (alt · opt · loop · par) y los mensajes son aristas:
                    continua la llamada, punteada el retorno.
                  </p>
                  <p>
                    <b className="text-foreground">Símbolos compactos:</b> eventos, compuertas y
                    pseudoestados se dibujan pequeños (círculo o rombo) con el nombre DEBAJO de la
                    forma, como en las herramientas BPMN/UML clásicas. Las figuras anchas (tareas,
                    casos de uso, sistemas) llevan el nombre dentro.
                  </p>
                </CardContent>
              </Card>
            </section>

            {/* ===== Estados del cambio ===== */}
            <section id="estados" className="scroll-mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <GitCompareArrows className="w-5 h-5" /> Estados del cambio
                  </CardTitle>
                  <CardDescription className="mt-1.5">
                    Cada elemento declara si es nuevo, se modifica o debe eliminarse. Con eso el
                    panel «Elementos Principales» se convierte en la lista de trabajo del equipo.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {CHANGE_STATES.map((s) => (
                    <div key={s.value} className="flex items-center gap-3 text-sm">
                      <span className={cn("h-3 w-3 rounded-full shrink-0", s.dot)} />
                      <span className="font-medium w-28">{s.label}</span>
                      <span className="text-muted-foreground">
                        {s.value === "nuevo" && "Elemento que no existe aún: se propone crear. Insignia verde en el nodo."}
                        {s.value === "modificado" && "Ya existe pero cambia su comportamiento o contrato. Insignia ámbar."}
                        {s.value === "sin_cambios" && "Está en el diagrama solo como contexto; no genera trabajo."}
                        {s.value === "existente" && "Ya existe y se integra tal cual (p. ej. un sistema externo)."}
                        {s.value === "eliminado" && "Debe retirarse: el nodo queda atenuado y tachado, con insignia roja."}
                      </span>
                    </div>
                  ))}
                  <p className="text-sm text-muted-foreground pt-2">
                    Se cambia desde la ficha del elemento (doble clic → «Estado del cambio»). Los
                    grupos del panel lateral («Cambios nuevos», «Modificados», «Eliminados»)
                    incluyen tanto el modelo como los elementos de las vistas, con la insignia de
                    su vista de origen.
                  </p>
                </CardContent>
              </Card>
            </section>

            {/* ===== Vistas ===== */}
            <section id="vistas" className="scroll-mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Layers className="w-5 h-5" /> Vistas
                  </CardTitle>
                  <CardDescription className="mt-1.5">
                    Un proyecto tiene su modelo («Modelo», la pestaña base) y hasta 50 vistas
                    adicionales, cada una con su propia notación.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    Se crean con <b className="text-foreground">«+ Nueva vista»</b> en la barra
                    inferior, se reordenan arrastrando su pestaña y también pueden llegar
                    directamente desde Claude Code vía MCP (<i>export_as_view</i>).
                  </p>
                  <p>
                    El panel <b className="text-foreground">«Vistas»</b> del sidebar lista cada
                    vista con su notación y conteo; al expandirla se ven sus elementos con su
                    estado del cambio, y el clic salta a esa vista.
                  </p>
                  <p>
                    Hasta 10 vistas pueden <b className="text-foreground">inyectarse como contexto
                    al agente</b> de IA (escribe <b>@</b> en el chat) para que analice o genere
                    artefactos sobre ellas.
                  </p>
                </CardContent>
              </Card>
            </section>

            {/* ===== Una sección por notación (autogenerada del registro) ===== */}
            {NOTATION_LIST.map((n) => (
              <section id={`not-${n.id}`} key={n.id} className="scroll-mt-4">
                <NotationSection notation={n} />
              </section>
            ))}

            {/* ===== Acerca de: versión, canal y crédito de autoría ===== */}
            <section id="acerca-de" className="scroll-mt-4 border-t pt-6">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-semibold">Acerca de ProcessFlow Architect</h2>
                <BetaBadge />
              </div>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Versión <code>{versionLabel()}</code>: el modelo, las vistas y el agente de
                IA local siguen en evolución y el formato de los proyectos puede cambiar
                entre versiones.
              </p>
              <SofkaCredits className="mt-4" />
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
