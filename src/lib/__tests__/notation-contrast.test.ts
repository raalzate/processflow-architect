/**
 * Contraste de la paleta contra el LIENZO, que es siempre oscuro.
 *
 * El registro es datos, así que nadie se entera de que un tono quedó ilegible
 * hasta que lo ve en pantalla —y en una notación que no estaba mirando—. Estas
 * reglas son mecánicas: la escala de Tailwind dice si un tono es claro u oscuro.
 *
 * No fijan QUÉ color usa cada tipo (eso es decisión de notación, y el matiz es
 * canon: naranja el evento, azul el comando); fijan que el relleno sea oscuro y
 * el texto claro, para que todas las notaciones se lean igual sobre el lienzo.
 */
import { describe, it, expect } from "vitest";
import { NOTATION_LIST, type NotationElement } from "../notations";

/** Tono de una clase tailwind `prefijo-color-tono` (o null si no lo lleva). */
const tono = (clase: string): number | null => {
  const m = /-(\d{2,3})(?:\/\d+)?$/.exec(clase.trim());
  return m ? Number(m[1]) : null;
};

const etiqueta = (n: { id: string }, e: NotationElement) => `${n.id} · ${e.type}`;

describe("contraste sobre el lienzo oscuro", () => {
  it("ningún relleno de nodo CON TEXTO DENTRO es claro", () => {
    for (const n of NOTATION_LIST) {
      for (const e of n.elements) {
        if (e.transparent || e.bg.includes("transparent")) continue;
        // Los símbolos compactos (punto inicial, estado final, compuertas) no
        // llevan texto dentro —su nombre va debajo— y su figura ES el
        // significado: el pseudoestado inicial de UML es un disco SÓLIDO, y
        // sobre lienzo oscuro sólido quiere decir claro. Ahí un tono bajo no es
        // una mancha, es la simbología.
        // La excepción es el símbolo sólido SIN icono (`hideIcon`), no todo lo
        // compacto: una compuerta BPMN sí lleva icono dentro y debe cumplir.
        if (e.compact && e.hideIcon) continue;
        const t = tono(e.bg);
        // En una caja con texto sí: un -100 sobre lienzo oscuro encandila y el
        // texto claro encima desaparece. De -500 en adelante hay cuerpo.
        expect(t === null || t >= 500, `${etiqueta(n, e)} → ${e.bg}`).toBe(true);
      }
    }
  });

  it("ningún texto de nodo es oscuro, salvo que declare variante para el tema", () => {
    for (const n of NOTATION_LIST) {
      for (const e of n.elements) {
        if (e.text.includes("dark:") || e.text.includes("white")) continue;
        const t = tono(e.text);
        expect(t === null || t <= 300, `${etiqueta(n, e)} → ${e.text}`).toBe(true);
      }
    }
  });

  it("el texto del elemento contrasta con SU PROPIO relleno", () => {
    // Antes existía `paletteText`: un tono alterno para el chip de la paleta,
    // que tenía fondo blanco. Con la app oscura (spec 003) el chip usa el mismo
    // relleno que el nodo, así que ese campo dejaba letra oscura sobre fondo
    // oscuro y se eliminó. Lo que hay que sostener es esto: relleno oscuro con
    // texto claro, en un solo par por elemento.
    for (const n of NOTATION_LIST) {
      for (const e of n.elements) {
        if (e.transparent || e.bg.includes("transparent")) continue;
        // Compactos y rombos llevan el nombre FUERA de la figura (el lienzo los
        // dibuja con `labelOutside`), así que su texto contrasta contra el
        // lienzo, no contra su relleno.
        if (e.compact || e.shape === "diamond") continue;
        const fondo = tono(e.bg);
        const letra = e.text.includes("white") ? 0 : tono(e.text);
        if (fondo === null || letra === null) continue;
        expect(
          fondo - letra,
          `${etiqueta(n, e)} → ${e.text} sobre ${e.bg}: sin salto de luminosidad`,
        ).toBeGreaterThanOrEqual(400);
      }
    }
  });

  it("todo nodo con relleno declara contorno (en SVG, `border-*` no pinta)", () => {
    for (const n of NOTATION_LIST) {
      for (const e of n.elements) {
        expect(e.stroke, `${etiqueta(n, e)} sin stroke`).toBeTruthy();
      }
    }
  });
});
