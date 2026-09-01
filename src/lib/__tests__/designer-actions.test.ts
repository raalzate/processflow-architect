/**
 * El catálogo es la única lista de acciones del diseñador: lo que no esté acá no
 * aparece en el menú nativo. Lo que se prueba es que el menú no tenga entradas
 * muertas ni repetidas —un item que no ejecuta nada es peor que no tenerlo— y que
 * todo lo que la barra del lienzo ofrece esté también en el menú, que es el pedido
 * que originó el catálogo.
 */

import { describe, it, expect } from "vitest";
import {
  ACELERADORES_EDICION_NATIVA,
  DESIGNER_MENU,
  idsDelMenu,
  type DesignerActionId,
  type DesignerMenuItem,
} from "../designer-actions";

const recorrer = (items: DesignerMenuItem[]): DesignerMenuItem[] =>
  items.flatMap((i) => [i, ...(i.submenu ? recorrer(i.submenu) : [])]);

describe("DESIGNER_MENU", () => {
  it("todo item es acción, separador o submenú con rótulo (nada mudo)", () => {
    for (const item of recorrer(DESIGNER_MENU)) {
      if (item.separator) continue;
      expect(item.label, JSON.stringify(item)).toBeTruthy();
      expect(Boolean(item.id) || Boolean(item.submenu?.length), item.label).toBe(true);
    }
  });

  it("no repite acciones: dos items que hacen lo mismo confunden más de lo que ayudan", () => {
    const ids = idsDelMenu();
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("los aceleradores tienen la forma que espera Electron", () => {
    for (const item of recorrer(DESIGNER_MENU)) {
      if (!item.accelerator) continue;
      expect(item.accelerator, item.label).toMatch(/^(CmdOrCtrl\+|Alt\+|Shift\+)*[A-Za-z0-9/]+$|^(Delete|Escape)$/);
    }
  });

  it("no pisa los aceleradores de edición nativa (issue #227)", () => {
    // Los aceleradores del menú de Electron se resuelven ANTES que la página y no
    // consultan el foco: un `CmdOrCtrl+V` en el menú «Diseño» se come el pegar del
    // sistema en TODO input de la app (se vio al configurar la llave de API). El
    // lienzo atiende estas teclas por su propio handler, que sí respeta el foco.
    for (const item of recorrer(DESIGNER_MENU)) {
      if (!item.accelerator) continue;
      expect(ACELERADORES_EDICION_NATIVA as readonly string[], item.label).not.toContain(item.accelerator);
    }
  });

  it("está TODO lo que ofrece la barra del lienzo (issue #171)", () => {
    // La barra tiene deshacer/rehacer, borrar, Organizar y el menú «Opciones»
    // (Relaciones, Exportar, Contexto, Metadatos, Ayuda, Reiniciar). Si algo se
    // agrega ahí y no acá, deja de existir para quien usa el menú del sistema.
    const enLaBarra: DesignerActionId[] = [
      "undo",
      "redo",
      "delete",
      "arrange",
      "arrange-ai",
      "routing-selection-straight",
      "routing-view-orthogonal",
      "dash-selection-on",
      "export",
      "export-png",
      "context",
      "metadata",
      "help",
      "clear",
    ];
    const enElMenu = new Set(idsDelMenu());
    for (const id of enLaBarra) expect(enElMenu.has(id), id).toBe(true);
  });

  it("idsDelMenu entra a los submenús y deja fuera los separadores", () => {
    const ids = idsDelMenu();
    expect(ids).toContain("routing-view-curved");
    expect(ids.every(Boolean)).toBe(true);
  });
});
