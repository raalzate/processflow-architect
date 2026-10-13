/**
 * @fileOverview Proyectos de la app gestionados por MCP (PURO, #534).
 *
 * El agente podía crear proyectos (`export_to_app`) pero no corregir dónde
 * quedaban: si el proyecto caía en otra organización, o con otro nombre, había que
 * pedirle al humano que lo moviera o lo borrara a mano. Y ninguna respuesta decía
 * en qué organización había quedado algo, así que el error se descubría tarde.
 *
 * Acá viven las reglas; el renderer aplica. Igual que las vistas (`app-actions`):
 * nombre resuelto sin adivinar, y el borrado exige el nombre exacto.
 */

import { buscarProyectoGuardado, claveProyecto, nombreVisible } from "./project-update";
import { avisoOrganizacion, ubicacion } from "./app-state";

export interface ProyectoGuardado {
  id: string;
  name: string;
  orgId?: string;
  content?: { nombre_proyecto?: string; notation?: string; fecha_analisis?: string } | null;
}

export interface ProyectoBrief {
  name: string;
  org: string | null;
  notation?: string;
  views: number;
  fecha?: string;
  activo: boolean;
}

export type ProjectActionRequest =
  | { kind: "move-project"; project: string; org: string | null }
  | { kind: "rename-project"; project: string; newName: string }
  | { kind: "delete-project"; project: string };

export type ProjectActionPlan =
  | { ok: true; id: string; name: string; org?: string | null; newName?: string }
  | { ok: false; error: string };

const lista = (archivos: ProyectoGuardado[]) =>
  archivos.length ? archivos.map((f) => `"${nombreVisible(f.name)}"`).join(", ") : "(ninguno)";

// Viven en app-state.ts (sin dependencias) para que el retrato los use sin ciclos.
export { avisoOrganizacion, ubicacion } from "./app-state";

/** Respuesta de una entrega a la app: qué proyecto, qué pasó y dónde quedó. */
export function mensajeEntrega(input: {
  accion: "creado" | "actualizado";
  proyecto: string;
  org: string | null;
  orgApp?: string | null;
  detalle?: string;
}): string {
  const { accion, proyecto, org, orgApp, detalle } = input;
  const aviso = avisoOrganizacion(org, orgApp);
  return [
    `Proyecto "${nombreVisible(proyecto)}" ${accion} en ${ubicacion(org)}.${detalle ? ` ${detalle}` : ""}`,
    aviso,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Respuesta de `move_project`, con el aviso si el humano mira otra organización. */
export function mensajeMovido(proyecto: string, org: string | null, orgApp: string | null | undefined): string {
  const visible = nombreVisible(proyecto);
  const hecho = org
    ? `Proyecto "${visible}" movido a ${ubicacion(org)}.`
    : `Proyecto "${visible}" quitado de su organización: ahora está sin organización.`;
  return [hecho, avisoOrganizacion(org, orgApp)].filter(Boolean).join("\n");
}

/** Respuesta de `delete_project`: qué se borró y de dónde. */
export const mensajeEliminado = (proyecto: string, org: string | null): string =>
  `Proyecto "${nombreVisible(proyecto)}" eliminado (${org ? `estaba en ${ubicacion(org)}` : "no tenía organización"}).`;

/** Decide qué proyecto toca una acción, sin ejecutarla. */
export function planProjectAction(
  req: ProjectActionRequest,
  archivos: ProyectoGuardado[],
  orgs: string[]
): ProjectActionPlan {
  // Borrar exige el nombre EXACTO (con o sin .json): lo destructivo no se resuelve
  // por parecido. Mover y renombrar aceptan el nombre escrito de memoria.
  const objetivo =
    req.kind === "delete-project"
      ? archivos.filter((f) => f.name === req.project.trim() || nombreVisible(f.name) === req.project.trim())
      : [buscarProyectoGuardado(archivos, req.project)].filter((f): f is ProyectoGuardado => !!f);

  if (objetivo.length !== 1) {
    const exacto = req.kind === "delete-project" ? " Para borrar hace falta el nombre exacto." : "";
    return { ok: false, error: `No hay un proyecto llamado "${req.project}".${exacto} Los que hay: ${lista(archivos)}.` };
  }
  const f = objetivo[0];

  if (req.kind === "move-project") {
    const org = req.org?.trim() || null;
    if (org && !orgs.includes(org)) {
      return {
        ok: false,
        error: `No existe la organización "${org}". Las que hay: ${orgs.length ? orgs.map((o) => `"${o}"`).join(", ") : "(ninguna)"}. Creala con create_org.`,
      };
    }
    if ((f.orgId ?? null) === org) {
      return { ok: false, error: `"${nombreVisible(f.name)}" ya está en ${ubicacion(org)}: no hay nada que mover.` };
    }
    return { ok: true, id: f.id, name: f.name, org };
  }

  if (req.kind === "rename-project") {
    const nuevo = nombreVisible(req.newName?.trim() ?? "");
    if (!nuevo) return { ok: false, error: "El nombre nuevo no puede estar vacío." };
    if (claveProyecto(nuevo) === claveProyecto(f.name) && nuevo === nombreVisible(f.name)) {
      return { ok: false, error: `El proyecto ya se llama "${nuevo}": no hay nada que cambiar.` };
    }
    const choque = archivos.find((o) => o.id !== f.id && claveProyecto(o.name) === claveProyecto(nuevo));
    if (choque) return { ok: false, error: `Ya hay un proyecto llamado "${nombreVisible(choque.name)}". Elegí otro nombre.` };
    return { ok: true, id: f.id, name: f.name, newName: nuevo };
  }

  return { ok: true, id: f.id, name: f.name };
}

/** `list_projects`: agrupados por organización, con lo que sirve para decidir. */
export function formatProjectList(briefs: ProyectoBrief[], opts: { org?: string | null } = {}): string {
  const filtrados = opts.org === undefined ? briefs : briefs.filter((b) => (b.org ?? null) === (opts.org ?? null));
  if (!filtrados.length) {
    return opts.org === undefined ? "No hay proyectos guardados en la app." : `No hay proyectos en ${ubicacion(opts.org)}.`;
  }
  const grupos = new Map<string | null, ProyectoBrief[]>();
  for (const b of filtrados) grupos.set(b.org ?? null, [...(grupos.get(b.org ?? null) ?? []), b]);
  const orden = [...grupos.keys()].sort((a, b) => (a === null ? 1 : b === null ? -1 : a.localeCompare(b)));

  const lineas = [
    `Proyectos de la app (${filtrados.length})${opts.org === undefined ? "" : `, filtrado por ${ubicacion(opts.org)}`}:`,
  ];
  for (const org of orden) {
    const items = grupos.get(org)!;
    lineas.push("", org ? `Organización "${org}" (${items.length})` : `Sin organización (${items.length})`);
    for (const b of items) {
      const partes = [`"${nombreVisible(b.name)}"`, b.notation ?? "ddd", `${b.views} ${b.views === 1 ? "vista" : "vistas"}`];
      if (b.fecha) partes.push(b.fecha);
      if (b.activo) partes.push("ACTIVO");
      lineas.push(`- ${partes.join(" · ")}`);
    }
  }
  return lineas.join("\n");
}
