import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EndpointTicket } from "@number0/iroh";
import { CollaborationEngine } from "../engine";
import { BranchStore } from "../branches";
import { SharedDocument } from "../../../../src/lib/collaboration/document";
import type { SharedProject } from "../../../../src/lib/collaboration/types";

const initial: SharedProject = {
  name: "Clínica Local",
  content: {
    nombre_proyecto: "Clínica Local",
    version: "1",
    fecha_analisis: "",
    responsables: [],
    notas: "",
    transcript: "",
    read_models: [],
    agregados: [],
    big_picture: {
      descripcion: "",
      hotspots: [],
      nodos: [
        { id: "n1", nombre: "Admisión", tipo_elemento: "Comando", estado_comparativo: "nuevo", x: 50, y: 80 },
      ],
      aristas: [],
    },
    politicas_inter_agregados: [],
  },
  customViews: [],
  references: [],
  agent: { versions: [], lineages: [], artifacts: [] },
  analysis: {},
};

describe("modo de infraestructura propia y resolución de campos simultáneos", () => {
  it("opera en modo selfHostedOnly sin servidores públicos y propaga la marca privada en la invitación", async () => {
    const root = mkdtempSync(join(tmpdir(), "pf-selfhosted-"));
    const host = new CollaborationEngine(join(root, "host"));
    const guest = new CollaborationEngine(join(root, "guest"));
    try {
      await host.start();
      await guest.start();

      const created = await host.command({
        type: "create",
        fileId: "host-file",
        initial,
        options: { selfHostedOnly: true },
        name: "Ana",
      });
      expect(created.error).toBeUndefined();
      expect(created.status?.selfHostedOnly).toBe(true);

      const invited = await host.command({ type: "invite", fileId: "host-file", role: "editor" });
      expect(invited.error).toBeUndefined();
      expect(invited.invitation).toMatch(/^processflow:\/\//);

      const decoded = JSON.parse(
        Buffer.from(invited.invitation!.slice("processflow://".length), "base64url").toString("utf8"),
      ) as { host: string; privateOnly?: boolean; relays: string[] };
      expect(decoded.privateOnly).toBe(true);
      expect(decoded.relays).toEqual([]);
      expect(EndpointTicket.fromString(decoded.host).endpointAddr().relayUrl()).toBeNull();

      const joined = await guest.command({
        type: "join",
        fileId: "guest-file",
        invitation: invited.invitation!,
        name: "Luis",
      });
      expect(joined.error).toBeUndefined();
      expect(joined.status?.selfHostedOnly).toBe(true);
      expect(joined.workspace?.snapshots.main.name).toBe("Clínica Local");

      const reconfigured = await host.command({
        type: "configure-network",
        fileId: "host-file",
        options: { selfHostedOnly: true, externalAddresses: ["127.0.0.1:44321"] },
      });
      expect(reconfigured.error).toBeUndefined();
      expect(reconfigured.status?.externalAddresses).toEqual(["127.0.0.1:44321"]);
    } finally {
      await guest.close();
      await host.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("resuelve ediciones simultáneas sobre el mismo campo dentro de una rama", () => {
    const root = mkdtempSync(join(tmpdir(), "pf-branch-field-"));
    const docA = new SharedDocument();
    const docB = new SharedDocument();
    docA.patch({}, initial);
    docB.receive(docA.update());

    const ownerActor = { id: "host", name: "Ana", owner: true, role: "editor" as const };
    const guestActor = { id: "guest", name: "Luis", owner: false, role: "editor" as const };
    const storeA = new BranchStore(join(root, "host-branches.json"), docA);
    const storeB = new BranchStore(join(root, "guest-branches.json"), docB);

    try {
      storeA.activate(ownerActor);
      storeB.receive(storeA.exchange(storeB.request(), guestActor));

      const beforeA = storeA.view(ownerActor)!.snapshots.shared;
      const afterA = structuredClone(beforeA);
      afterA.content.big_picture.nodos![0].nombre = "Admisión Urgencias";
      storeA.patch("shared", beforeA, afterA, ownerActor);

      const beforeB = storeB.view(guestActor)!.snapshots.shared;
      const afterB = structuredClone(beforeB);
      afterB.content.big_picture.nodos![0].nombre = "Admisión Consulta";
      storeB.patch("shared", beforeB, afterB, guestActor);

      storeB.receive(storeA.exchange(storeB.request(), guestActor));

      const edits = storeA.view(ownerActor)!.discardedEdits.shared;
      expect(edits).toHaveLength(1);
      const discardedName = edits[0].discardedValue;

      storeA.resolveFieldConflict("shared", edits[0].id, "discarded", ownerActor);
      storeB.receive(storeA.exchange(storeB.request(), guestActor));

      expect(storeA.view(ownerActor)!.snapshots.shared.content.big_picture.nodos![0].nombre).toBe(
        discardedName,
      );
      expect(storeB.view(guestActor)!.snapshots.shared.content.big_picture.nodos![0].nombre).toBe(
        discardedName,
      );
      expect(storeA.view(ownerActor)!.discardedEdits.shared).toEqual([]);
      expect(storeB.view(guestActor)!.discardedEdits.shared).toEqual([]);
    } finally {
      storeA.close();
      storeB.close();
      docA.destroy();
      docB.destroy();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
