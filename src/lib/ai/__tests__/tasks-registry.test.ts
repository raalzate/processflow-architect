/**
 * P5 con mecanismo: «añadir una función de IA es declarar una `AiTask`».
 *
 * Hasta acá el principio era REVIEW: lo miraba un humano. Lo que se puede medir
 * es la consecuencia — TODA tarea exportada por `tasks.ts` tiene que ser ruteable
 * por el router sin que el router la conozca. Si alguien agrega una tarea a medias
 * (sin `buildPrompt` ni `remoteFlow`, con id repetido, con un tier inventado), el
 * router la aceptaría y el fallo aparecería recién en la UI, en runtime, con la IA
 * encendida. Acá aparece en el gate.
 *
 * El barrido es por `import *`: una tarea nueva entra a esta prueba sola. Eso es lo
 * que hace que el freno no envejezca — no hay lista que actualizar a mano.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as tasks from "@/lib/ai/tasks";
import { chooseProvider, type AiTask } from "@/lib/ai/router";
import { publicarEstadoIaLocal, resetEstadoIaLocal } from "@/lib/ai/local-capability";
import type { AiMode } from "@/lib/ai/remote-settings";

const declaradas = Object.entries(tasks).filter(
  ([nombre, valor]) =>
    nombre.endsWith("Task") &&
    !!valor &&
    typeof valor === "object" &&
    typeof (valor as AiTask).id === "string",
) as [string, AiTask][];

/**
 * Motores disponibles: `localAvailable` mira `window.electronAPI` **y** el estado
 * del motor local, que sin publicar arranca en `desconocido` (#202) — así que acá
 * se publica: este test habla del ruteo, no de la GPU.
 */
const conAmbosMotores = () => {
  vi.stubGlobal("window", {
    electronAPI: { litertGenerate: vi.fn(), remoteGenerate: vi.fn() },
    navigator: { gpu: {} },
  });
  publicarEstadoIaLocal("disponible");
};

beforeEach(conAmbosMotores);
afterEach(() => {
  vi.unstubAllGlobals();
  resetEstadoIaLocal();
});

describe("registro de AiTask (P5)", () => {
  it("hay tareas declaradas: si esto queda en cero, el barrido dejó de mirar", () => {
    expect(declaradas.length).toBeGreaterThan(0);
  });

  it("cada tarea trae id kebab-case único, tier válido y una forma de ejecutarse", () => {
    const vistos = new Set<string>();
    for (const [nombre, t] of declaradas) {
      expect(t.id, `${nombre}: id vacío`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(vistos.has(t.id), `${nombre}: id repetido "${t.id}"`).toBe(false);
      vistos.add(t.id);
      expect(["light", "heavy"], `${nombre}: tier inválido`).toContain(t.tier);
      // Sin `buildPrompt` ni `remoteFlow` no hay forma de correrla: el router
      // devolvería null y el usuario vería «ninguna IA disponible» sin causa.
      expect(Boolean(t.buildPrompt || t.remoteFlow), `${nombre}: no define buildPrompt ni remoteFlow`).toBe(true);
      // Una tarea `light` sin techo de entrada nunca degrada a remoto por tamaño.
      if (t.tier === "light") expect(typeof t.maxLocalChars, `${nombre}: light sin maxLocalChars`).toBe("number");
    }
  });

  it("el router rutea TODA tarea declarada en los tres modos, sin conocerla", () => {
    for (const [nombre, t] of declaradas) {
      for (const mode of ["local", "hybrid", "remote"] as AiMode[]) {
        const { provider, reason } = chooseProvider(t, 10, { mode });
        // En modo local, una tarea heavy/estructurada legítimamente no tiene motor:
        // lo que no se admite es quedarse sin explicación.
        if (provider === null) {
          expect(reason, `${nombre} en modo ${mode}: sin proveedor y sin motivo`).not.toBe("");
          expect(mode === "local" || t.tier === "heavy" || Boolean(t.structured), `${nombre} en modo ${mode}: sin proveedor`).toBe(true);
        } else {
          expect(["local", "remote"]).toContain(provider);
        }
      }
    }
  });

  it("la política se cumple: heavy/structured nunca cae en local en modo híbrido", () => {
    for (const [nombre, t] of declaradas) {
      if (t.tier !== "heavy" && !t.structured) continue;
      const { provider } = chooseProvider(t, 10, { mode: "hybrid" });
      expect(provider, `${nombre}: tarea compleja ruteada a local`).not.toBe("local");
    }
  });

  it("una entrada más grande que el techo de una tarea light sale a la nube", () => {
    const light = declaradas.find(([, t]) => t.tier === "light" && t.maxLocalChars != null);
    expect(light, "no hay ninguna tarea light con techo: la política de tamaño quedó sin cubrir").toBeTruthy();
    const [, t] = light!;
    const { provider } = chooseProvider(t, (t.maxLocalChars ?? 0) + 1, { mode: "hybrid" });
    expect(provider).toBe("remote");
  });
});
