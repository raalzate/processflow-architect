/**
 * @fileOverview Un concepto, muchas vistas: vínculos entre vistas (spec 027 · US6) — PURO.
 *
 * El mismo *Pagos* aparece como Contexto en el Event Storming, como Pool en el
 * BPMN y como Sistema en el C4. Acá se SUGIEREN los vínculos (FR-038) —nunca se
 * aplican solos— y se VALIDAN contra el reglamento (FR-039).
 *
 * Decisión (Q8, 2026-11-09): dos cajas de la misma familia general (Contexto y
 * Pool son Frontera; Actor y Persona son Agente) se sugieren como «es el mismo
 * que». Un Agente y una Frontera con el mismo nombre NO pueden ser el mismo
 * elemento —son clases disjuntas—: el Sistema *Pagos* REALIZA el Contexto
 * *Pagos* (lo implementa), y así se sugiere. Las demás parejas disjuntas
 * (un Evento y un Actor que se llaman igual) no se sugieren: es casualidad.
 */

import type { ExtremoVinculo, VinculoVistas } from "../views-types";
import type { Conocimiento } from "./conocimiento";
import { RDF_TYPE, iriElemento, iriGeneral } from "./iri";
import { tboxDe } from "./tbox";
import type { Hallazgo, Termino } from "./types";
import { plana } from "./validate";

export type TipoVinculo = VinculoVistas["tipo"];

/** Un vínculo propuesto: todavía no es del proyecto (FR-038). */
export interface VinculoSugerido {
  id: string;
  tipo: TipoVinculo;
  a: ExtremoVinculo;
  b: ExtremoVinculo;
  razon: string;
}

/** Id estable: el mismo par sugerido dos veces es el mismo vínculo (y se reconoce si se rechazó). */
export function idVinculo(tipo: TipoVinculo, a: ExtremoVinculo, b: ExtremoVinculo): string {
  const ea = `${a.vista}/${a.nodo}`;
  const eb = `${b.vista}/${b.nodo}`;
  // «Es el mismo que» es simétrica: el orden de los extremos no cambia el vínculo.
  const [x, y] = tipo === "es_mismo_que" && eb < ea ? [eb, ea] : [ea, eb];
  return `${tipo}:${x}~${y}`;
}

const AGENTE = iriGeneral("Agente");
const FRONTERA = iriGeneral("Frontera");

/** Clases generales que tiene el elemento (ya razonadas: subclase sube hasta la general). */
function generalesDe(k: Conocimiento, iri: Termino): Set<Termino> {
  return new Set(k.store.match(iri, RDF_TYPE).map((h) => h.o).filter((c) => /^pf:[A-Z]/.test(c)));
}

/** ¿Hay un par de clases disjuntas entre los dos conjuntos? Devuelve el par. */
function choque(k: Conocimiento, a: Set<Termino>, b: Set<Termino>): [Termino, Termino] | undefined {
  for (const n of k.notaciones)
    for (const [x, y] of tboxDe(n).disjuntas)
      if ((a.has(x) && b.has(y)) || (a.has(y) && b.has(x))) return a.has(x) ? [x, y] : [y, x];
  return undefined;
}

/**
 * Vínculos candidatos entre cajas de vistas DISTINTAS con el mismo nombre
 * aplanado (sin acentos, mayúsculas ni separadores). Nada que ya esté decidido
 * —aceptado o rechazado— vuelve a sugerirse.
 */
export function sugerirVinculos(k: Conocimiento, decididos: readonly VinculoVistas[] = []): VinculoSugerido[] {
  const ya = new Set(decididos.map((v) => idVinculo(v.tipo, v.a, v.b)));
  // Un par ya decidido con CUALQUIER tipo no se vuelve a ofrecer con el otro.
  const pares = new Set(decididos.flatMap((v) => [`${v.a.vista}/${v.a.nodo}~${v.b.vista}/${v.b.nodo}`, `${v.b.vista}/${v.b.nodo}~${v.a.vista}/${v.a.nodo}`]));
  const porNombre = new Map<string, typeof k.elementos>();
  for (const e of k.elementos) {
    const n = plana(e.nombre).replace(/ /g, "");
    if (!n) continue;
    porNombre.set(n, [...(porNombre.get(n) ?? []), e]);
  }
  const out: VinculoSugerido[] = [];
  for (const grupo of porNombre.values())
    for (let i = 0; i < grupo.length; i++)
      for (let j = i + 1; j < grupo.length; j++) {
        const [x, y] = [grupo[i], grupo[j]];
        if (x.vista === y.vista || x.proyecto !== y.proyecto) continue;
        const gx = generalesDe(k, x.iri);
        const gy = generalesDe(k, y.iri);
        const c = choque(k, gx, gy);
        let tipo: TipoVinculo;
        let a = { vista: x.vista, nodo: x.id };
        let b = { vista: y.vista, nodo: y.id };
        let razon: string;
        if (!c) {
          tipo = "es_mismo_que";
          razon = `Se llaman igual («${x.nombre}») en dos vistas y son de clases compatibles.`;
        } else if (c.includes(AGENTE) && c.includes(FRONTERA)) {
          tipo = "realiza";
          // El Agente (sistema, actor) realiza la Frontera (contexto, pool).
          if (!gx.has(AGENTE)) [a, b] = [b, a];
          razon = `Se llaman igual («${x.nombre}»), pero uno es quien hace y el otro la zona que delimita: no pueden ser el mismo elemento, uno implementa al otro.`;
        } else continue;
        const id = idVinculo(tipo, a, b);
        if (ya.has(id) || pares.has(`${a.vista}/${a.nodo}~${b.vista}/${b.nodo}`)) continue;
        out.push({ id, tipo, a, b, razon });
      }
  return out;
}

/**
 * ¿El vínculo es válido en este conocimiento? `null` si sí. Rechaza: extremos
 * que no existen, extremos en la misma vista y «es el mismo que» entre clases
 * disjuntas (FR-039, US6-AC4), con la regla incumplida.
 */
export function validarVinculo(
  k: Conocimiento,
  v: Pick<VinculoVistas, "tipo" | "a" | "b">,
  proyecto = k.elementos[0]?.proyecto ?? ""
): Hallazgo | null {
  const ia = iriElemento(proyecto, v.a.vista, v.a.nodo);
  const ib = iriElemento(proyecto, v.b.vista, v.b.nodo);
  const ea = k.elementos.find((e) => e.iri === ia);
  const eb = k.elementos.find((e) => e.iri === ib);
  if (!ea || !eb)
    return {
      forma: "VINCULO-ROTO",
      severidad: "error",
      mensaje: `El vínculo apunta a una caja que no existe (${!ea ? `${v.a.vista}/${v.a.nodo}` : `${v.b.vista}/${v.b.nodo}`}).`,
      sugerencia: "Elegí dos cajas que estén en el proyecto.",
    };
  if (v.a.vista === v.b.vista)
    return {
      forma: "VINCULO-MISMA-VISTA",
      severidad: "error",
      nodo: v.a.nodo,
      vista: v.a.vista,
      mensaje: `«${ea.nombre}» y «${eb.nombre}» están en la misma vista: un vínculo une vistas distintas; dentro de una vista se dibuja una flecha.`,
    };
  if (v.tipo === "es_mismo_que") {
    const c = choque(k, generalesDe(k, ia), generalesDe(k, ib));
    if (c)
      return {
        forma: "EQUIVALENCIA-DISJUNTA",
        severidad: "error",
        nodo: v.a.nodo,
        vista: v.a.vista,
        esperado: "clases compatibles",
        encontrado: `${c[0]} ≢ ${c[1]}`,
        mensaje: `«${ea.nombre}» y «${eb.nombre}» no pueden ser el mismo elemento: ${c[0]} y ${c[1]} son clases disjuntas.`,
        sugerencia:
          c.includes(AGENTE) && c.includes(FRONTERA)
            ? "Si uno implementa al otro, vinculalos con «realiza»."
            : "Revisá el vínculo: son cosas de naturaleza distinta.",
      };
  }
  return null;
}
