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
  Users,
  GitBranch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppCredits, BetaBadge } from "@/components/layout/AppCredits";
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
  { id: "cooperativo", label: "Trabajo cooperativo", icon: Users },
  { id: "ramas-versiones", label: "Ramas y versiones", icon: GitBranch },
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
        <CardDescription>{notation.description}</CardDescription>
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
      <header className="bg-card border-b shadow-xs w-full p-4 z-10 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-foreground font-headline flex items-center gap-2">
            <BookOpen className="w-5 h-5" /> Documentación de ProcessFlow
          </h1>
          <p className="text-sm text-muted-foreground">
            Cómo diseñar, trabajar con otras personas y gestionar ramas, versiones y permisos.
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
          <nav className="space-y-1" aria-label="Secciones de documentación">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => scrollToSection(s.id)}
                aria-current={activeSection === s.id ? "location" : undefined}
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
                  <CardDescription>
                    Cómo se construye un diagrama en el diseñador, sea cual sea la notación.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    <b className="text-foreground">Añadir elementos:</b> arrastra cualquier tipo
                    desde la paleta de la izquierda al lienzo. El selector de arriba de la paleta
                    cambia la notación de la vista activa (DDD, BPMN, C4, UML, MER o General) y con ella los
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
                    <b className="text-foreground">Referencias (metadatos):</b> en la ficha, cada
                    elemento —nodo o contenedor— lleva una lista de{" "}
                    <i>clave · valor · url</i> con <b className="text-foreground">dónde vive de
                    verdad</b>: el repositorio del componente, la wiki que lo explica, el tablero,
                    el equipo dueño. Las urls <i>http(s)</i> quedan como enlace y se abren en el
                    navegador del sistema; cualquier otro esquema se muestra como texto. Un agente
                    las escribe por MCP (<i>metadata</i> en <i>add_node</i>, <i>add_container</i> y{" "}
                    <i>update_element</i>), y <i>review_diagram</i> avisa qué cajas quedaron sin
                    referencia.
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
                  <CardDescription>
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
                  <CardDescription>
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

            <section id="cooperativo" className="scroll-mt-4" aria-labelledby="cooperativo-title">
              <Card>
                <CardHeader>
                  <CardTitle id="cooperativo-title" className="flex items-center gap-2">
                    <Users className="w-5 h-5" /> Trabajo cooperativo
                  </CardTitle>
                  <CardDescription>
                    Un mismo proyecto, varias personas y cambios en vivo. Los pasos se realizan desde la pantalla.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 text-sm text-muted-foreground">
                  <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                    <h3 className="font-semibold text-foreground">Para empezar</h3>
                    <p>
                      Una persona abre el proyecto y se convierte en <b className="text-foreground">anfitrión</b>.
                      Las demás se unen mediante una invitación y reciben su propia copia vinculada.
                      Todos deben utilizar una versión compatible de ProcessFlow en Windows, macOS o Linux.
                    </p>
                    <p>
                      La conexión se configura automáticamente, tanto en la misma red como por Internet.
                      La interfaz no te pide direcciones IP, puertos ni contratar un proveedor.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-semibold text-foreground">Crear el proyecto compartido: anfitrión</h3>
                    <ol className="list-decimal pl-5 space-y-2">
                      <li>Abre el proyecto que quieres compartir y pulsa <b className="text-foreground">Colaborar</b> en la cabecera.</li>
                      <li>Escribe tu nombre en <b className="text-foreground">Nombre que ven los demás</b>.</li>
                      <li>Pulsa <b className="text-foreground">Vincular este proyecto y ser anfitrión</b>. El panel pasará a mostrar tu rol y el estado del proyecto vinculado.</li>
                      <li>En <b className="text-foreground">Permiso de la siguiente persona</b>, elige <b>Editar</b> o <b>Solo lectura</b>.</li>
                      <li>Pulsa <b className="text-foreground">Generar invitación</b> y después <b className="text-foreground">Copiar invitación</b>. Compártela en privado con esa persona.</li>
                      <li>Genera otra invitación para el siguiente compañero. Cada invitación queda asociada al dispositivo de la primera persona que la utiliza.</li>
                    </ol>
                    <p>Mantén la aplicación del anfitrión abierta para recibir participantes y sus cambios.</p>
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-semibold text-foreground">Unirse: participante invitado</h3>
                    <ol className="list-decimal pl-5 space-y-2">
                      <li>Abre ProcessFlow y pulsa <b className="text-foreground">Colaborar</b>.</li>
                      <li>Escribe el nombre que quieres mostrar a tus compañeros.</li>
                      <li>Pega la invitación completa en <b className="text-foreground">Invitación de otra persona</b>.</li>
                      <li>Pulsa <b className="text-foreground">Vincular una copia y unirme</b> y espera a recibir la primera copia.</li>
                      <li>Cuando aparezca el contenido y se confirme la conexión, elige una rama con permiso de edición y una vista para trabajar.</li>
                    </ol>
                    <p>
                      Se crea una copia vinculada independiente; tu proyecto anterior no se sustituye.
                      Si te invitaron con <b>Solo lectura</b>, podrás consultar el contenido, pero no publicar ediciones.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-semibold text-foreground">Quién está conectado y qué se ve en vivo</h3>
                    <p>
                      Abre <b className="text-foreground">Proyecto vinculado</b> para ver <b>Personas conectadas</b>,
                      sus nombres, permisos y las ramas y vistas donde están. La cabecera también muestra el número de personas conectadas.
                    </p>
                    <p>
                      Los punteros tienen un color y un nombre. Puedes ver selecciones, movimientos y la flecha
                      que otro compañero está trazando. Para ver esa presencia deben coincidir en <b className="text-foreground">la misma rama y vista</b>.
                      Si alguien está en otra rama o en otra vista, seguirá apareciendo en la lista de personas,
                      aunque su puntero no se dibuje en tu lienzo.
                    </p>
                    <p>
                      Cada persona puede navegar sin mover la pantalla de las demás.
                      <b className="text-foreground"> Abrir proyecto en otra ventana</b> permite consultar o editar otra vista;
                      una ventana adicional del mismo dispositivo no representa una persona nueva en el cupo.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-semibold text-foreground">Desconectarse y continuar otro día</h3>
                    <p>
                      Los cambios y el vínculo quedan guardados localmente. Si se pierde la conexión, la copia
                      invitada reintenta automáticamente cada <b className="text-foreground">5 segundos</b>.
                      Puedes usar <b className="text-foreground">Reconectar</b>, cuando aparezca, para solicitar un intento inmediato.
                      No necesitas pegar de nuevo la invitación por una interrupción normal de red.
                    </p>
                    <p>
                      Al reconectar se intercambian las modificaciones pendientes en ambos sentidos. Puedes cerrar
                      y volver a abrir el mismo proyecto vinculado otro día. El anfitrión debe estar disponible;
                      un cambio que existe únicamente en un equipo apagado llegará cuando ese equipo vuelva a conectar.
                    </p>
                    <p>
                      Comprueba los avisos <b>Copia local guardada</b>, <b>Guardando cambios…</b> o
                      <b> Esperando la primera copia</b>. Antes de recibir esa primera copia no des por completa la sincronización.
                      Las fusiones y los cambios de permisos requieren la conexión con el anfitrión.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-semibold text-foreground">Redes y cupo de participantes</h3>
                    <p>
                      En una sala pueden convivir conexiones por red local (LAN), conexión directa (P2P) y respaldo
                      mediante intermediario (relay). La aplicación elige una ruta por persona e intenta mejorarla
                      sin pedirte configuración. Una red que bloquee todas las rutas puede impedir la conexión.
                    </p>
                    <p>
                      El cupo base mostrado es de <b className="text-foreground">5 personas, incluido el anfitrión</b>.
                      Para admitir más se evalúan los recursos del anfitrión, el tamaño del proyecto y las rutas de red.
                      El cupo es una estimación, no una garantía de fluidez para cualquier equipo.
                      Las rutas pueden combinarse; sus cupos no se suman como grupos de personas independientes.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-semibold text-foreground">Qué se comparte y cómo salir</h3>
                    <p>
                      Se comparten el modelo, las vistas, sus textos de referencia y adjuntos incluidos,
                      las versiones y los resultados de análisis del proyecto. Tu chat, llaves de proveedores,
                      carpetas locales, selección y zoom no se convierten en contenido compartido.
                    </p>
                    <p>
                      Cerrar la aplicación conserva el vínculo para la próxima sesión.
                      Para desvincular esa copia, abre <b className="text-foreground">Copia de recuperación y vínculo → Salir del proyecto compartido</b>:
                      se conserva la copia visible, pero deja de sincronizarse. <b>Descargar recuperación</b> guarda
                      contenido e historial para recuperación; importar la copia no vuelve a crear la conexión automáticamente.
                    </p>
                    <p>
                      El anfitrión puede retirar el acceso desde <b className="text-foreground">Personas con acceso → Revocar</b>.
                      Si un permiso fue revocado, pulsar Reconectar no lo concede de nuevo.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-semibold text-foreground">Si algo no aparece</h3>
                    <ul className="list-disc pl-5 space-y-2">
                      <li><b>No veo un puntero:</b> comprueba que ambos estén en la misma rama y vista y que no estés consultando una versión histórica.</li>
                      <li><b>No puedo escribir:</b> revisa tu rol, los permisos de la rama y si aparece un aviso de Solo lectura.</li>
                      <li><b>Aparece Sin conexión:</b> comprueba que el anfitrión tenga abierta la aplicación; espera el reintento o pulsa Reconectar.</li>
                      <li><b>No encuentro las ramas:</b> primero vincula el proyecto; después usa el botón <b>Rama:</b> de la cabecera. Siguen disponibles aunque solo esté conectado el anfitrión.</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </section>

            <section id="ramas-versiones" className="scroll-mt-4" aria-labelledby="ramas-versiones-title">
              <Card>
                <CardHeader>
                  <CardTitle id="ramas-versiones-title" className="flex items-center gap-2">
                    <GitBranch className="w-5 h-5" /> Ramas y versiones
                  </CardTitle>
                  <CardDescription>
                    Trabajar en paralelo, guardar puntos del historial y revisar qué se incorpora a Principal.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 text-sm text-muted-foreground">
                  <p>
                    Las ramas de esta guía pertenecen a los diagramas de tu proyecto y se administran desde la pantalla.
                    No necesitas comandos ni una cuenta de GitHub. Se habilitan al vincular el proyecto y siguen
                    disponibles aunque estés solo en la sala.
                  </p>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-left">
                      <caption className="sr-only">Conceptos de ramas y versiones</caption>
                      <thead className="bg-muted/30 text-foreground"><tr><th scope="col" className="p-3">Nombre</th><th scope="col" className="p-3">Qué significa</th></tr></thead>
                      <tbody className="divide-y">
                        <tr><th scope="row" className="p-3 font-medium text-foreground">Vista</th><td className="p-3">Un diagrama del proyecto. Una rama puede contener varias vistas.</td></tr>
                        <tr><th scope="row" className="p-3 font-medium text-foreground">Rama</th><td className="p-3">Una línea de trabajo con su propio borrador e historial. Una o varias personas pueden editarla.</td></tr>
                        <tr><th scope="row" className="p-3 font-medium text-foreground">Autoguardado</th><td className="p-3">Conserva las modificaciones del borrador mientras trabajas.</td></tr>
                        <tr><th scope="row" className="p-3 font-medium text-foreground">Versión o commit</th><td className="p-3">Un punto del historial con nombre, autor y fecha. Incluye las vistas que seleccionaste al guardarlo.</td></tr>
                        <tr><th scope="row" className="p-3 font-medium text-foreground">Solicitud de fusión o pull request</th><td className="p-3">Pide revisar una versión guardada para incorporarla a Principal. Enviarla no la aprueba.</td></tr>
                        <tr><th scope="row" className="p-3 font-medium text-foreground">Fusionar o merge</th><td className="p-3">Incorporar los cambios revisados a la rama de destino.</td></tr>
                        <tr><th scope="row" className="p-3 font-medium text-foreground">Traer cambios o pull</th><td className="p-3">Combinar una versión de Principal con el trabajo de tu rama, revisando las diferencias.</td></tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-semibold text-foreground">Principal y Trabajo compartido</h3>
                    <p>
                      <b className="text-foreground">Principal</b> conserva lo aprobado. El anfitrión controla quién
                      puede editarla, aprobar fusiones o restaurarla. Un invitado sin esos permisos la consulta en solo lectura.
                    </p>
                    <p>
                      <b className="text-foreground">Trabajo compartido</b> es la rama inicial para editar en vivo.
                      Si varias personas están en ella, sus cambios forman parte del mismo borrador.
                      Para revisar aportes por separado, crea una rama por tarea o por persona.
                      Cambiar de rama conserva el borrador de la anterior; editar una rama no modifica automáticamente las otras.
                    </p>
                    <p>
                      Ejemplo: Ana trabaja en <b>Mejorar pedidos</b> y Luis en <b>Ajustar acceso</b>.
                      Cada uno guarda una versión y la envía a revisión. Principal recibe los cambios cuando una persona autorizada los fusiona.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-semibold text-foreground">Crear o elegir una rama</h3>
                    <ol className="list-decimal pl-5 space-y-2">
                      <li>Abre el botón <b className="text-foreground">Rama:</b> en la cabecera.</li>
                      <li>Para continuar en otra existente, selecciónala en <b className="text-foreground">Rama activa</b>.</li>
                      <li>Para crear una, pulsa <b className="text-foreground">Nueva</b>, escribe su nombre y pulsa <b className="text-foreground">Crear rama</b>.</li>
                    </ol>
                    <p>
                      La nueva rama parte de una versión guardada. Guarda primero si quieres incluir tus cambios recientes en ese punto de partida.
                      Desde Historial también puedes elegir una versión concreta y usar <b>Crear rama desde aquí</b>.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-semibold text-foreground">Guardar una versión y elegir las vistas</h3>
                    <ol className="list-decimal pl-5 space-y-2">
                      <li>En la rama que estás editando, abre <b className="text-foreground">Rama: → Guardar versión</b>.</li>
                      <li>Escribe un <b className="text-foreground">Nombre corto del cambio</b> que explique lo realizado; por ejemplo, <b>Aclarar el flujo de pedidos</b>.</li>
                      <li>Abre <b className="text-foreground">Vistas incluidas</b>. Marca todas o solo las que quieras guardar. <b>Datos comunes</b> incluye nombre, referencias, artefactos y análisis.</li>
                      <li>Pulsa <b className="text-foreground">Guardar</b>. Comprueba el aviso <b>Versión guardada</b> y consulta el resultado en Historial.</li>
                    </ol>
                    <p>
                      Lo que no selecciones continúa en el borrador. Si varias personas editan la misma rama,
                      la versión incluye las contribuciones visibles de todos en las vistas seleccionadas.
                      <b className="text-foreground"> Guardar una versión todavía no cambia Principal.</b>
                    </p>
                    <p>
                      Los vínculos a vistas que ya fueron borradas se retiran automáticamente al guardar o preparar una fusión,
                      sin eliminar sus componentes. Si una vista vinculada todavía existe pero quedó fuera de la selección,
                      inclúyela para conservar el subproceso completo; su enlace no se elimina como si estuviera borrada.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-semibold text-foreground">Enviar el trabajo al anfitrión</h3>
                    <ol className="list-decimal pl-5 space-y-2">
                      <li>Guarda una versión. El botón de envío permanece deshabilitado mientras solo exista la versión inicial.</li>
                      <li>Pulsa <b className="text-foreground">Enviar al anfitrión para fusionar</b>.</li>
                      <li>Comprueba la versión indicada y ajusta <b className="text-foreground">Vistas a enviar</b> si quieres enviar solo una parte.</li>
                      <li>Pulsa <b className="text-foreground">Enviar solicitud</b>. El anfitrión verá el aviso y el contador de solicitudes pendientes.</li>
                    </ol>
                    <p>
                      Puedes seguir trabajando. Los cambios realizados después de la versión enviada no entran en esa solicitud;
                      guarda otra versión para proponerlos después. Si eres el anfitrión, la acción se llama
                      <b className="text-foreground"> Fusionar rama en Principal</b> y continúa con <b>Revisar y fusionar ahora</b>.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-semibold text-foreground">Revisar y fusionar: anfitrión o persona autorizada</h3>
                    <ol className="list-decimal pl-5 space-y-2">
                      <li>Abre el aviso de solicitud o entra en <b className="text-foreground">Rama: → Solicitudes</b>.</li>
                      <li>Elige la solicitud y pulsa <b className="text-foreground">Revisar y fusionar</b>.</li>
                      <li>Comprueba las vistas y la comparación antes/después. Si hay un conflicto, elige qué valor conservar antes de confirmar.</li>
                      <li>Confirma la fusión desde la revisión. También puedes cancelar o rechazar la solicitud sin incorporarla.</li>
                    </ol>
                    <p>
                      Hasta confirmar, la revisión no cambia el destino. Si alguien modificó el destino durante la revisión,
                      vuelve a compararlo antes de aplicar. Una fusión parcial no da por aprobadas las vistas restantes.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-semibold text-foreground">Traer Principal conservando tu trabajo</h3>
                    <ol className="list-decimal pl-5 space-y-2">
                      <li>Entra en tu rama de trabajo y abre <b className="text-foreground">Rama: → Traer cambios</b>.</li>
                      <li>Revisa la última versión guardada de Principal y las vistas seleccionadas; por defecto se ofrecen todas.</li>
                      <li>Examina la combinación propuesta. Se conservan las modificaciones compatibles de tu borrador, incluso las que aún no tienen commit.</li>
                      <li>Resuelve las diferencias que afecten el mismo campo o la eliminación de componentes conectados, y confirma cuando el resultado sea correcto.</li>
                    </ol>
                    <p>
                      Traer cambios combina el trabajo; no sustituye todo tu borrador por una copia sin revisar.
                      Se crea un punto de recuperación antes de aplicar. Si cancelas la revisión, tu rama continúa como estaba.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-semibold text-foreground">Consultar el árbol, volver y restaurar</h3>
                    <p>
                      <b className="text-foreground">Historial</b> muestra versiones con nombre, autor, fecha y sus conexiones en el árbol.
                      Haz clic en una versión para verla o elige un momento para consultar la última versión guardada hasta esa fecha.
                      El historial registra versiones guardadas, no cada movimiento del ratón.
                    </p>
                    <p>
                      Al mirar una versión anterior aparece <b>Solo lectura</b>. Tu borrador sigue guardado:
                      pulsa <b className="text-foreground">Volver a mi rama actual</b> para continuar editando y ver los punteros de esa rama.
                    </p>
                    <p>
                      Para recuperar contenido, selecciona la versión, revisa las vistas y usa <b className="text-foreground">Restaurar versión</b>.
                      La restauración crea una nueva versión y conserva el historial posterior; no lo borra.
                      También puedes usar <b>Crear rama desde aquí</b> para continuar desde ese punto en otra rama.
                      Restaurar Principal requiere su permiso específico.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-semibold text-foreground">Permisos y asistentes de IA</h3>
                    <p>
                      El anfitrión administra <b className="text-foreground">Rama: → Permisos</b>.
                      Puede permitir edición en una rama a todos los editores o asignar personas concretas.
                      Los permisos especiales de Principal son independientes: <b>aprobar fusiones</b>,
                      <b> editar directamente</b> y <b>restaurar versiones</b>. Pueden tener vencimiento;
                      el permiso de fusión también puede limitarse a una solicitud concreta.
                    </p>
                    <p>
                      El chat del proyecto y los asistentes conectados por MCP pueden consultar ramas, trabajar en ellas,
                      guardar versiones y ayudar a revisar cambios según sus permisos.
                      <b className="text-foreground"> Una IA de un invitado no puede modificar Principal</b>,
                      aunque esa persona tenga permiso para editarla manualmente. Para trabajar con IA en Principal debe actuar el anfitrión.
                      El asistente limitado a una caja no administra el historial completo del proyecto.
                    </p>
                  </div>

                  <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                    <h3 className="font-semibold text-foreground">Recorrido habitual</h3>
                    <p>
                      Unirse → elegir o crear rama → editar → Guardar versión → Enviar solicitud →
                      revisión del anfitrión → fusión en Principal → Traer cambios a las otras ramas.
                    </p>
                    <p>
                      Usa el autoguardado para conservar el trabajo en curso, las versiones para marcar avances
                      y las solicitudes para decidir qué se aprueba. Son tres pasos distintos.
                    </p>
                  </div>
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
              <AppCredits className="mt-4" />
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
