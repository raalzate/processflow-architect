/**
 * @fileOverview La IA propone hechos, el humano decide (spec 027 · T33, US8) — PURO.
 *
 * La IA lee un documento y devuelve hechos `{s, p, o, cita}`: «PagoRealizado es
 * Evento», «Pagar dispara PagoRealizado». Antes de mostrarse, cada uno pasa por
 * el reglamento (FR-036): un predicado que no existe, uno cuyo dominio o rango
 * no encaja, un elemento del que no se sabe el tipo o una propuesta sin cita a
 * la fuente quedan marcados y NO se pueden aceptar (US8-AC2). Lo aceptado entra
 * al diagrama como cualquier caja o flecha —con su predicado— y con la
 * PROCEDENCIA en la ficha del elemento: IA, fuente y quién aceptó (US8-AC3).
 *
 * La IA no cambia tipos: proponer que algo que ya existe «es» otra cosa se
 * marca como conflicto, no se aplica.
 */

import { addContainer, addEdge, addNode, updateNode, type DiagramModel } from "../mcp/diagram-builder";
import { DEFAULT_NOTATION_ID, isNotationContainer, notationTypes, type NotationId } from "../notations";
import { validarPredicado } from "./predicate-guess";
import { tboxDe } from "./tbox";
import { plana } from "./validate";

export interface HechoPropuesto {
  s: string;
  p: string;
  o: string;
  /** El pasaje de la fuente que lo sostiene. */
  cita: string;
}

export interface PropuestaRevisada extends HechoPropuesto {
  id: string;
  /** «X es Tipo» declara un elemento; si no, es una relación. */
  clase: "tipo" | "relacion";
  valida: boolean;
  motivo?: string;
  /** Tipo de la notación (clase «tipo») o id del predicado (clase «relacion»). */
  resuelto?: string;
  /** Los extremos que todavía no existen en el diagrama. */
  nuevos: string[];
}

export interface Procedencia {
  fuente: string;
  aceptadoPor: string;
  fecha: string;
}

const ES = new Set(["es", "es un", "es una", "tipo", "tipo de", "rdf type", "a"]);
export const MAX_PROPUESTAS = 40;

/** Id estable de una propuesta: la misma tripleta, la misma propuesta. */
const idDe = (h: HechoPropuesto) => `${plana(h.s)}|${plana(h.p)}|${plana(h.o)}`;

function predicadoDeTexto(notation: NotationId, p: string): string | undefined {
  const buscado = plana(p.replace(/_/g, " "));
  const ps = tboxDe(notation).predicados;
  return (
    ps.find((x) => plana(x.id.replace(/_/g, " ")) === buscado || plana(x.etiqueta) === buscado) ??
    ps.find((x) => x.sinonimos.some((s) => plana(s) === buscado))
  )?.id;
}

export function revisarPropuestas(model: DiagramModel, hechos: readonly HechoPropuesto[]): PropuestaRevisada[] {
  const notation = (model.meta.notation ?? DEFAULT_NOTATION_ID) as NotationId;
  const tipos = notationTypes(notation);
  const existente = (nombre: string) => model.nodes.find((n) => plana(n.nombre) === plana(nombre));
  const tipoDeTexto = (t: string) => tipos.find((x) => plana(x) === plana(t));

  const lote = hechos.slice(0, MAX_PROPUESTAS);
  // Primero los tipos declarados en el lote: una relación puede apoyarse en un
  // elemento nuevo. Un nombre nuevo con DOS tipos distintos es un conflicto: no
  // se elige uno, porque el humano podría aceptar el otro y la relación validada
  // contra el primero entraría sin cumplir el reglamento.
  const declarados = new Map<string, Set<string>>();
  for (const h of lote)
    if (ES.has(plana(h.p))) {
      const t = tipoDeTexto(h.o);
      if (t && !existente(h.s)) declarados.set(plana(h.s), (declarados.get(plana(h.s)) ?? new Set()).add(t));
    }
  const enConflicto = (nombre: string) => (declarados.get(plana(nombre))?.size ?? 0) > 1;
  const tipoDe = (nombre: string) => {
    const ya = existente(nombre)?.tipo_elemento;
    if (ya) return ya;
    const ts = declarados.get(plana(nombre));
    return ts?.size === 1 ? [...ts][0] : undefined;
  };
  const conflicto = (nombre: string) =>
    `La IA propone dos tipos distintos para «${nombre}» (${[...declarados.get(plana(nombre))!].join(" y ")}): no se integra nada que dependa de él.`;
  // Un par, una flecha: la segunda propuesta entre los mismos extremos no puede entrar.
  const pares = new Set<string>();

  const vistos = new Set<string>();
  const out: PropuestaRevisada[] = [];
  for (const h of lote) {
    const id = idDe(h);
    if (vistos.has(id)) continue;
    vistos.add(id);
    const base = { ...h, id, nuevos: [] as string[] };
    const mal = (clase: PropuestaRevisada["clase"], motivo: string): PropuestaRevisada => ({ ...base, clase, valida: false, motivo });
    const esTipo = ES.has(plana(h.p));
    if (!h.cita?.trim()) {
      out.push(mal(esTipo ? "tipo" : "relacion", "No cita la fuente: sin el pasaje no hay cómo verificarlo."));
      continue;
    }
    if (esTipo && enConflicto(h.s)) {
      out.push(mal("tipo", conflicto(h.s)));
      continue;
    }
    if (esTipo) {
      const t = tipoDeTexto(h.o);
      const ya = existente(h.s);
      if (!t) out.push(mal("tipo", `«${h.o}» no es un tipo de esta notación (${tipos.slice(0, 6).join(", ")}…).`));
      else if (ya && ya.tipo_elemento !== t)
        out.push(mal("tipo", `«${ya.nombre}» ya existe como ${ya.tipo_elemento}: la IA no cambia tipos; si corresponde, cambialo vos en la ficha.`));
      else if (ya) out.push(mal("tipo", `«${ya.nombre}» ya está en el diagrama como ${t}.`));
      else out.push({ ...base, clase: "tipo", valida: true, resuelto: t, nuevos: [h.s] });
      continue;
    }
    const pid = predicadoDeTexto(notation, h.p);
    if (!pid) {
      out.push(mal("relacion", `«${h.p}» no es un predicado de esta notación.`));
      continue;
    }
    const choca = [h.s, h.o].find(enConflicto);
    if (choca) {
      out.push(mal("relacion", conflicto(choca)));
      continue;
    }
    const ts = tipoDe(h.s);
    const to = tipoDe(h.o);
    const sinTipo = [!ts && h.s, !to && h.o].filter(Boolean) as string[];
    if (sinTipo.length) {
      out.push(mal("relacion", `No se sabe qué es ${sinTipo.map((x) => `«${x}»`).join(" ni ")}: falta la propuesta «… es <tipo>».`));
      continue;
    }
    const hallazgo = validarPredicado(pid, ts!, to!, notation);
    if (hallazgo) {
      out.push({ ...mal("relacion", `${hallazgo.mensaje}${hallazgo.sugerencia ? ` ${hallazgo.sugerencia}` : ""}`), resuelto: pid });
      continue;
    }
    const fs = existente(h.s);
    const fd = existente(h.o);
    if (fs && fd && model.edges.some((e) => e.fuente === fs.id && e.destino === fd.id)) {
      out.push(mal("relacion", `Ya hay una flecha de «${fs.nombre}» a «${fd.nombre}».`));
      continue;
    }
    const par = `${plana(h.s)}>${plana(h.o)}`;
    if (pares.has(par)) {
      out.push(mal("relacion", `De «${h.s}» a «${h.o}» ya se propone otra flecha en este lote: un par lleva una sola.`));
      continue;
    }
    pares.add(par);
    out.push({ ...base, clase: "relacion", valida: true, resuelto: pid, nuevos: [h.s, h.o].filter((x) => !existente(x)) });
  }
  return out;
}

const textoProcedencia = (h: HechoPropuesto, p: Procedencia) =>
  `IA · ${p.fuente} · aceptó ${p.aceptadoPor} · ${p.fecha}: ${h.s} ${h.p} ${h.o} — «${h.cita.trim()}»`;

/**
 * Integra las propuestas ACEPTADAS (sólo las válidas). Una relación que
 * necesita un elemento nuevo cuya propuesta de tipo no se aceptó se omite y se
 * informa: nada entra sin que el humano lo haya elegido.
 */
export function aplicarPropuestas(
  model: DiagramModel,
  aceptadas: readonly PropuestaRevisada[],
  procedencia: Procedencia
): { model: DiagramModel; aplicadas: string[]; omitidas: { id: string; motivo: string }[] } {
  const notation = (model.meta.notation ?? DEFAULT_NOTATION_ID) as NotationId;
  let m = model;
  const aplicadas: string[] = [];
  const omitidas: { id: string; motivo: string }[] = [];
  const nodoDe = (nombre: string) => m.nodes.find((n) => plana(n.nombre) === plana(nombre));
  const anotar = (nombre: string, h: HechoPropuesto) => {
    const n = nodoDe(nombre);
    if (!n) return;
    const previo = n.metadata?.find((x) => x.clave === "procedencia")?.valor;
    const valor = previo ? `${previo}\n${textoProcedencia(h, procedencia)}` : textoProcedencia(h, procedencia);
    m = updateNode(m, n.id, { metadata: [{ clave: "procedencia", valor }] });
  };

  for (const p of aceptadas.filter((x) => x.valida && x.clase === "tipo")) {
    if (nodoDe(p.s)) continue;
    const tipo = p.resuelto!;
    m = isNotationContainer(tipo)
      ? addContainer(m, { nombre: p.s.trim(), tipo_elemento: tipo }).model
      : addNode(m, { nombre: p.s.trim(), tipo_elemento: tipo }).model;
    anotar(p.s, p);
    aplicadas.push(p.id);
  }
  for (const p of aceptadas.filter((x) => x.valida && x.clase === "relacion")) {
    const fs = nodoDe(p.s);
    const fd = nodoDe(p.o);
    if (!fs || !fd) {
      omitidas.push({ id: p.id, motivo: `Falta aceptar qué es «${!fs ? p.s : p.o}».` });
      continue;
    }
    // Se revalida contra el modelo que se recibe AHORA: el veredicto se dio sobre
    // el de cuando se propuso, y entre medio el humano pudo editar o aceptar otro tipo.
    const hallazgo = validarPredicado(p.resuelto!, fs.tipo_elemento, fd.tipo_elemento, notation);
    if (hallazgo) {
      omitidas.push({ id: p.id, motivo: hallazgo.mensaje });
      continue;
    }
    if (m.edges.some((e) => e.fuente === fs.id && e.destino === fd.id)) {
      omitidas.push({ id: p.id, motivo: `Ya hay una flecha de «${fs.nombre}» a «${fd.nombre}».` });
      continue;
    }
    const decl = tboxDe(notation).predicados.find((x) => x.id === p.resuelto);
    m = addEdge(m, { fuente: fs.id, destino: fd.id, descripcion: decl?.etiqueta ?? p.p, predicado: p.resuelto });
    anotar(p.s, p);
    aplicadas.push(p.id);
  }
  return { model: m, aplicadas, omitidas };
}
