/**
 * Frontera de red de la suite: en un test, salir a internet es un error.
 *
 * Era la deuda declarada «sin test de frontera de red»: nada impedía que un test
 * llamara de verdad a un proveedor de IA. Un test así pasa en la máquina del que
 * lo escribió, falla en CI sin conexión, cuesta dinero y —peor— puede filtrar una
 * llave. Acá `fetch` y los `request` de node:http/https se reemplazan por algo que
 * REVIENTA con un mensaje que dice qué hacer.
 *
 * Un test que necesita hablar con la red la simula: `vi.stubGlobal("fetch", …)` o
 * `vi.mock` del módulo. Eso sigue funcionando: pisa este stub a propósito y de
 * forma visible en el propio test.
 */
import http from "node:http";
import https from "node:https";
import { beforeEach } from "vitest";

const explica = (que: string, destino: string) =>
  new Error(
    [
      `Frontera de red: un test intentó ${que} a ${destino}.`,
      "La suite corre offline a propósito (CI no tiene red y una llamada real cuesta dinero o filtra llaves).",
      'Simulá la red en el test: vi.stubGlobal("fetch", vi.fn()) o vi.mock del módulo que la usa.',
      "Definido en vitest.setup.ts.",
    ].join("\n"),
  );

/** Sale de una entrada de `http.request` el destino, para que el error lo nombre. */
const destinoDe = (arg: unknown) => {
  if (typeof arg === "string") return arg;
  if (arg && typeof arg === "object") {
    const o = arg as { href?: string; host?: string; hostname?: string; path?: string };
    return o.href ?? `${o.host ?? o.hostname ?? "?"}${o.path ?? ""}`;
  }
  return "un destino desconocido";
};

const bloquear = () => {
  globalThis.fetch = (input: any) => {
    throw explica("hacer fetch", destinoDe(input?.url ?? input));
  };
  for (const mod of [http, https] as any[]) {
    for (const metodo of ["request", "get"]) {
      mod[metodo] = (...args: unknown[]) => {
        throw explica(`usar ${mod === https ? "https" : "http"}.${metodo}`, destinoDe(args[0]));
      };
    }
  }
};

bloquear();

// `vi.stubGlobal` se revierte entre tests (restoreMocks/unstubGlobals), y un test
// que pise `fetch` no debe dejar la puerta abierta para el siguiente: se vuelve a
// cerrar antes de cada uno.
beforeEach(() => {
  bloquear();
});
