import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CollaborationEngine } from "../engine";
import { BranchStore } from "../branches";
import { SharedDocument } from "../../../../src/lib/collaboration/document";
import type { Seats, NetworkLoad } from "../../../../src/lib/collaboration/capacity";
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

describe("admisión automática multirruta y resolución de campos simultáneos", () => {
  it("admite participantes por red local aunque los cupos de relay estén ocupados", async () => {
    const now = 1_800_000_000_000;
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    const root = mkdtempSync(join(tmpdir(), "pf-multiroute-"));
    const host = new CollaborationEngine(join(root, "host"), undefined, { publicNetwork: false });
    const guest = new CollaborationEngine(join(root, "guest"), undefined, { publicNetwork: false });
    try {
      await host.start();
      await guest.start();

      const created = await host.command({
        type: "create",
        fileId: "host-file",
        initial,
        options: {},
        name: "Ana",
      });
      expect(created.error).toBeUndefined();

      // Simulamos 5 participantes ya conectados por relay con un tope de 5 en relay.
      const internalRooms = (
        host as unknown as {
          rooms: Map<string, { seats: Seats; networkLoad: NetworkLoad; clients: Map<string, { remoteId: () => string; paths: () => unknown[] }> }>;
        }
      ).rooms;
      const hostedRoom = internalRooms.get("host-file")!;
      let congestionEvents = 0;
      for (let i = 1; i <= 5; i++) {
        const relayId = `relay-peer-${i}`;
        expect(hostedRoom.seats.enter(relayId, "relay")).toBe(true);
        hostedRoom.clients.set(relayId, {
          remoteId: () => relayId,
          paths: () => [
            {
              isSelected: true,
              id: relayId,
              isRelay: true,
              remoteAddr: "relay://example",
              stats: { cwnd: 16_384, rttMs: 100, udpTxBytes: 256 * 1024, congestionEvents },
            },
          ],
        });
      }
      // El cupo de relay requiere actividad y congestión reciente observadas,
      // no basta una ventana QUIC antigua después de reposo.
      hostedRoom.networkLoad.record(1000, now);
      (host as unknown as { refreshCapacity: (room: unknown) => void }).refreshCapacity(hostedRoom);
      congestionEvents++;

      const invited = await host.command({ type: "invite", fileId: "host-file", role: "editor" });
      expect(invited.error).toBeUndefined();

      // Aunque el relay tenga un presupuesto limitado a 5 personas, el participante local entra sin bloqueo.
      const joined = await guest.command({
        type: "join",
        fileId: "guest-file",
        invitation: invited.invitation!,
        name: "Luis",
      });
      expect(joined.error).toBeUndefined();
      expect(joined.workspace?.snapshots.main.name).toBe("Clínica Local");

      const hostStatus = (await host.command({ type: "open", fileId: "host-file", initial })).status!;
      expect(hostStatus.capacity.relayGuestLimit).toBe(5);
      expect(hostStatus.routeCounts).toEqual({ lan: 1, direct: 0, relay: 5 });
      expect(hostStatus.peers).toBe(7);
      expect(hostedRoom.seats.canEnter("relay-peer-6", "relay")).toBe(false);
      expect(hostedRoom.seats.canEnter("p2p-peer-1", "direct")).toBe(true);
      expect(hostedRoom.seats.canEnter("lan-peer-2", "lan")).toBe(true);

      // Limpiamos los clientes simulados antes de cerrar el motor real.
      for (let i = 1; i <= 5; i++) {
        hostedRoom.clients.delete(`relay-peer-${i}`);
        hostedRoom.seats.leave(`relay-peer-${i}`);
      }
    } finally {
      await guest.close();
      await host.close();
      clock.mockRestore();
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
