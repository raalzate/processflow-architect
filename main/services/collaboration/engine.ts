import {
  Endpoint,
  EndpointAddr,
  EndpointTicket,
  RelayMode,
  type Connection,
  type WatchHandle,
  type PathSnapshot,
} from "@number0/iroh";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomBytes, randomUUID, createHash, timingSafeEqual } from "node:crypto";
import { freemem, networkInterfaces } from "node:os";
import { performance } from "node:perf_hooks";
import { SharedDocument } from "../../../src/lib/collaboration/document";
import { estimateCapacity, Seats, NetworkLoad, MIN_ROOM_CAPACITY } from "../../../src/lib/collaboration/capacity";
import { withStableGraphIds } from "../../../src/lib/collaboration/identity";
import type {
  Capacity,
  CollaborationCommand,
  CollaborationEvent,
  CollaborationResult,
  CollaborationStatus,
  PeerRoute,
  Role,
  RoomOptions,
  SharedProject,
} from "../../../src/lib/collaboration/types";
import { Journal, writePrivateJson } from "./journal";
import { deadline, readFrame, sendFrame } from "./wire";
import { sanitizePresence, livePresence, presenceIsActivity, type Presence } from "../../../src/lib/collaboration/presence";
import { packBoard } from "../../../src/lib/board-file";
import { LanDiscovery } from "./discovery";
import { isLanPath } from "../../../src/lib/collaboration/network";
import { encodeProject } from "../../../src/lib/collaboration/graph-codec";
import { assertEncodedProject, assertJson } from "../../../src/lib/collaboration/validation";
import { BranchStore, type BranchRequest, type BranchResponse } from "./branches";
import { canEditBranch, type HistoryActor } from "../../../src/lib/collaboration/history";
import { RecurringServiceCost, RecentCongestion } from "../../../src/lib/collaboration/session-stability";
import { participantsForRoom, type Participant } from "../../../src/lib/collaboration/participants";
import { PresenceChannel } from "./presence-channel";

const ALPN = [...Buffer.from("processflow/collaboration/1")];
const encode = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const decode = (text: string) => new Uint8Array(Buffer.from(text, "base64"));
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const validId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9-]{36}$/.test(value);
interface Invitation {
  format: "pf-room/1";
  projectId: string;
  host: string;
  token: string;
  role: Role;
  relays: string[];
}
interface InviteGrant {
  hash: string;
  role: Role;
  member?: string;
  name?: string;
  revoked?: boolean;
}
interface StoredRoom {
  projectId: string;
  fileId: string;
  owner: boolean;
  role: Role;
  options: RoomOptions;
  invitation?: Invitation;
  grants: Record<string, InviteGrant>;
}
interface Config {
  key: number[];
  port?: number;
  rooms: StoredRoom[];
}
interface Request {
  presenceMode?: "stream-v1";
  version: 1;
  stage: "hello" | "sync";
  projectId: string;
  token: string;
  vector: string;
  update?: string;
  branches?: BranchRequest;
  name?: string;
}
interface Response {
  presenceMode?: "stream-v1";
  participants?: Participant[];
  ok: boolean;
  error?: string;
  vector?: string;
  update?: string;
  capacity?: Capacity;
  peers?: number;
  branches?: BranchResponse;
}
interface Room {
  stored: StoredRoom;
  document: SharedDocument;
  journal: Journal;
  status: CollaborationStatus;
  seats: Seats;
  clients: Map<string, Connection>;
  connection?: Connection;
  timer?: ReturnType<typeof setTimeout>;
  syncing?: boolean;
  failures: number;
  remoteVector?: Uint8Array;
  revision: number;
  disposed?: boolean;
  syncTask?: Promise<void>;
  needsSync?: boolean;
  pathWatch?: WatchHandle;
  presence: Map<string, Presence>;
  networkLoad: NetworkLoad;
  serviceCost: RecurringServiceCost;
  baseMergeMs?: number;
  locations: Map<string, Presence>;
  quarantined?: boolean;
  branches?: BranchStore;
  name?: string;
}

/** Native transport/persistence service. Existing contexts remain the UI's API. */
export class CollaborationEngine {
  private config: Config;
  private rooms = new Map<string, Room>();
  private failedRooms = new Map<string, { stored: StoredRoom; status: CollaborationStatus }>();
  private endpoint?: Endpoint;
  private starting?: Promise<Endpoint>;
  private closed = false;
  private incoming = new Set<Connection>();
  private handshakes = 0;
  private presenceMonitor?: ReturnType<typeof setInterval>;
  private discovery?: LanDiscovery;
  private monitor?: ReturnType<typeof setInterval>;
  private presenceChannels = new Map<Connection, PresenceChannel>();
  private congestion = new RecentCongestion();
  constructor(
    private root: string,
    private event: (event: CollaborationEvent) => void = () => {},
    private dependencies: { journal?: (file: string) => Journal; publicNetwork?: boolean } = {},
  ) {
    mkdirSync(root, { recursive: true });
    const configFile = join(root, "device.json");
    this.config = existsSync(configFile)
      ? (JSON.parse(readFileSync(configFile, "utf8")) as Config)
      : { key: [...randomBytes(32)], rooms: [] };
    this.saveConfig();
  }
  private saveConfig() {
    writePrivateJson(join(this.root, "device.json"), this.config);
  }
  async start(): Promise<void> {
    for (const stored of this.config.rooms) {
      try {
        this.load(stored);
      } catch (error) {
        const partial = this.rooms.get(stored.fileId);
        if (partial) { partial.quarantined = true; partial.status.saved = false; }
        const status: CollaborationStatus = {
          projectId: stored.projectId,
          fileId: stored.fileId,
          owner: stored.owner,
          role: stored.role,
          connected: false,
          state: "error",
          route: "none",
          peers: 1,
          pendingEdges: 0,
          saved: false,
          initialized: false,
          capacity: estimateCapacity({ freeMemoryBytes: freemem(), projectBytes: 0, mergeMs: 1 }),
          error: `Historial en cuarentena: ${error instanceof Error ? error.message : String(error)}`,
        };
        this.failedRooms.set(stored.fileId, { stored, status });
      }
    }
    if (this.rooms.size) await this.endpointReady();
    for (const room of this.rooms.values()) if (room.stored.owner && room.status.saved && room.branches && !room.branches.enabled) room.branches.activate(this.actor(room));
    for (const room of this.rooms.values())
      if (!room.stored.owner && room.status.saved) this.schedule(room, 0);
    this.monitor = setInterval(() => {
      for (const room of this.rooms.values())
        if (room.stored.owner && room.status.saved) {
          this.refreshCapacity(room);
          this.emit(room);
        }
    }, 5_000);
    this.monitor.unref();
    this.presenceMonitor = setInterval(() => {
      for (const room of this.rooms.values()) {
        const peers = livePresence([...room.presence.values()], Date.now());
        if (peers.length !== room.presence.size) {
          room.presence = new Map(peers.map(p => [p.id, p]));
          this.emitPresence(room);
        }
        let locationsChanged = false;
        for (const [id, location] of room.locations) if (Date.now() - location.seenAt > 30_000) { room.locations.delete(id); locationsChanged = true; }
        if (locationsChanged) this.emit(room);
      }
    }, 1_000);
    this.presenceMonitor.unref();
  }
  private async endpointReady(): Promise<Endpoint> {
    if (this.endpoint) return this.endpoint;
    if (this.starting) return this.starting;
    this.starting = (async () => {
      const makeBuilder = (port: number) => {
      const builder = Endpoint.builder();
      if (this.dependencies.publicNetwork === false) builder.applyMinimal();
      else builder.applyN0();
      builder.secretKey(this.config.key);
      builder.alpns([ALPN]);
      const relays = [...new Set(this.config.rooms.flatMap(r => r.options.relayUrls ?? []))];
      const urls = [
        ...new Set([
          ...(this.dependencies.publicNetwork === false ? [] : RelayMode.defaultMode().relayMap().urls()),
          ...relays,
        ]),
      ];
      builder.relayMode(urls.length ? RelayMode.customFromUrls(urls) : RelayMode.disabled());
      builder.bindAddr(`0.0.0.0:${port}`);
      return builder;
      };
      let endpoint: Endpoint;
      try { endpoint = await makeBuilder(this.config.port ?? 0).bind(); }
      catch (error) {
        if (!this.config.port || !/10048|EADDRINUSE|address already in use|bind sockets/i.test(String(error))) throw error;
        endpoint = await makeBuilder(0).bind();
      }
      this.endpoint = endpoint;
      this.discovery = new LanDiscovery(endpoint);
      this.config.port = Number(
        endpoint
          .boundSockets()
          .find(a => a.startsWith("0.0.0.0:"))
          ?.split(":")
          .pop(),
      );
      this.saveConfig();
      for (const addr of this.config.rooms.flatMap(r => r.options.externalAddresses ?? []))
        await endpoint.addExternalAddr(addr);
      void this.accept(endpoint);
      return endpoint;
    })();
    try {
      return await this.starting;
    } finally {
      this.starting = undefined;
    }
  }
  private classifyPaths(paths: PathSnapshot[]): PeerRoute {
    const selected = paths.find(path => path.isSelected) ?? paths[0];
    if (!selected || selected.isRelay) return "relay";
    const interfaces = Object.values(networkInterfaces()).flatMap(list => list ?? []);
    return isLanPath(selected.remoteAddr, interfaces) ? "lan" : "direct";
  }
  private measure(
    document: SharedDocument,
    load?: NetworkLoad,
    connections: Connection[] = [],
    serviceMs = 0,
    baseMergeMs?: number,
  ): Capacity {
    const projectBytes = Buffer.byteLength(JSON.stringify(document.snapshot()));
    let mergeMs = baseMergeMs;
    if (mergeMs === undefined) {
    const probe = new SharedDocument();
    // La carga inicial y la preparación de la réplica candidata ocurren una sola vez, no en cada sincronización.
    probe.receive(document.update());
    probe.snapshot();
    const vector = probe.vector();
    probe.receiveRemote(document.update(vector));
    try {
      const samples: number[] = [];
      for (let i = 0; i < 5; i++) { const begin = performance.now(); probe.receiveRemote(document.update(vector)); probe.vector(); samples.push(performance.now() - begin); }
      samples.sort((a,b) => a-b); mergeMs = samples[2];
    } finally {
      probe.destroy();
    }
    }
    const routePaths = connections.flatMap(connection => {
      const allPaths = connection.paths();
      const selected = allPaths.find(path => path.isSelected);
      if (!selected) return [];
      const route = this.classifyPaths(allPaths);
      return [
        {
          route,
          cwnd: selected.stats.cwnd,
          rttMs: selected.stats.rttMs,
          // La ventana inicial de QUIC y su RTT frío no miden la capacidad de subida;
          // solo limitar cada ruta (P2P o relay) tras observar tráfico real.
          calibrated: selected.stats.udpTxBytes >= 128 * 1024 && this.congestion.observe(`${connection.remoteId()}:${selected.id}`, selected.stats.congestionEvents, Date.now()),
        },
      ];
    });
    const resources = { freeMemoryBytes: freemem(), projectBytes, mergeMs: Math.max(mergeMs, serviceMs) };
    return estimateCapacity({
      ...resources,
      routeAware: true,
      ...(load?.hasRecentActivity(Date.now()) ? load.routeBudgets(routePaths, Date.now()) : {}),
    });
  }
  private refreshConnectionRoutes(room: Room) {
    for (const [id, client] of room.clients) {
      room.seats.updateRoute(id, this.classifyPaths(client.paths()));
    }
    if (room.stored.owner) room.status.routeCounts = room.seats.countsByRoute();
  }
  private refreshCapacity(room: Room) {
    this.refreshConnectionRoutes(room);
    room.status.capacity = this.measure(
      room.document,
      room.networkLoad,
      [...room.clients.values()],
      room.serviceCost.value(Date.now()) ?? 0,
      room.baseMergeMs,
    );
    room.baseMergeMs ??= room.status.capacity.mergeMs;
    // El historial ya reside una vez en el anfitrión; no se replica entero en memoria por invitado.
    const extraBytes = room.branches?.liveBytes() ?? 0;
    if (extraBytes) {
      room.status.capacity.projectBytes += extraBytes;
      room.status.capacity.limit = Math.max(
        MIN_ROOM_CAPACITY,
        Math.min(room.status.capacity.limit, Math.floor((freemem() * 0.2) / Math.max(1, extraBytes * 6))),
      );
    }
    room.seats.resize(room.status.capacity.limit, {
      directGuestLimit: room.status.capacity.directGuestLimit,
      relayGuestLimit: room.status.capacity.relayGuestLimit,
    });
  }
  private load(stored: StoredRoom, initial?: SharedProject): Room {
    const found = this.rooms.get(stored.fileId);
    if (found) return found;
    if (!validId(stored.projectId)) throw new Error("Identidad de proyecto inválida.");
    const document = new SharedDocument(),
      journalFile = join(this.root, stored.projectId, "updates.bin");
    const journal = this.dependencies.journal?.(journalFile) ?? new Journal(journalFile);
    try {
      for (const update of journal.updates) document.receive(update);
    } catch (error) {
      journal.close();
      document.destroy();
      throw error;
    }
    const room: Room = {
      stored,
      document,
      journal,
      clients: new Map(),
      failures: 0,
      seats: new Seats(1),
      revision: 0,
      presence: new Map(),
      networkLoad: new NetworkLoad(),
      serviceCost: new RecurringServiceCost(),
      locations: new Map(),
      status: {
        projectId: stored.projectId,
        fileId: stored.fileId,
        owner: stored.owner,
        role: stored.role,
        connected: stored.owner,
        state: stored.owner ? "local" : "offline",
        route: "none",
        peers: 1,
        pendingEdges: 0,
        saved: true,
        initialized: false,
        capacity: estimateCapacity({ freeMemoryBytes: freemem(), projectBytes: 0, mergeMs: 1 }),
      },
    };
    // El archivo de ramas ya es duradero. Restaurarlo no debe reescribirlo como una edición del diario.
    this.rooms.set(stored.fileId, room);
    room.branches = new BranchStore(join(this.root, stored.projectId, "branches.json"), document, () => {
      room.revision++;
      if (room.stored.owner) {
        document.receiveRemote(room.branches!.defaultUpdate(document.vector()));
        this.notifyClients(room);
      }
    });
    document.doc.on("update", (update: Uint8Array) => {
      if (room.status.initialized) room.networkLoad.record(update.byteLength * 1.4, Date.now());
      room.status.saved = false;
      try {
        journal.append(update);
        room.status.saved = true;
        room.revision++;
        if (room.stored.owner) this.notifyClients(room);
      } catch (error) {
        room.status.error = `No se pudo guardar: ${String(error)}`;
        room.status.state = "error";
        this.emit(room);
        throw error;
      }
    });
    if (!journal.updates.length && initial) document.patch({}, initial);
    document.clearUndo();
    room.status.initialized = document.isInitialized();
    if (room.status.initialized || journal.updates.length || initial) {
      try {
        document.assertValid();
        this.refreshCapacity(room);
      } catch (error) {
        room.quarantined = true;
        room.status.saved = false;
        room.status.initialized = false;
        room.status.state = "error";
        room.status.error = `Documento en cuarentena: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
    return room;
  }
  private emit(room: Room, includeSnapshot = false) {
    if (room.disposed) return;
    room.status.initialized =
      !room.quarantined && (!!room.branches?.enabled || room.document.isInitialized());
    room.status.peers = room.stored.owner ? room.seats.count : room.status.peers;
    this.refreshMembers(room);
    this.refreshStatusDetails(room);
    try {
      room.status.pendingEdges = room.document.pendingEdges();
    } catch {
      /* Joining has not received its first state. */
    }
    this.event({
      fileId: room.stored.fileId,
      status: { ...room.status },
      ...(includeSnapshot && !room.quarantined
        ? {
            snapshot: room.branches?.enabled ? room.branches.defaultSnapshot() : room.document.snapshot(),
            workspace: room.quarantined ? undefined : room.branches?.view(this.actor(room)),
          }
        : {}),
    });
  }
  private emitPresence(room: Room) {
    if (room.disposed) return;
    this.event({
      fileId: room.stored.fileId,
      presence: livePresence([...room.presence.values()], Date.now()),
    });
  }
  private sendPresence(connection: Connection, presence: Presence) {
    const channel = this.presenceChannels.get(connection);
    if (channel) { channel.send(presence.id, presence); return; }
    const bytes = Buffer.from(JSON.stringify(presence));
    if (bytes.length <= 1100 && (connection.maxDatagramSize() ?? 0) >= bytes.length) {
      try {
        connection.sendDatagram([...bytes]);
      } catch {
        /* Latest presence replaces a dropped datagram. */
      }
    }
  }
  private notifyClients(room: Room) {
    const bytes = [...Buffer.from(JSON.stringify({ kind: "processflow-changed/1" }))];
    for (const connection of room.clients.values()) {
      const channel = this.presenceChannels.get(connection);
      if (channel) { channel.send("changed", { kind: "processflow-changed/1" }); continue; }
      try {
        connection.sendDatagram(bytes);
      } catch {
        /* La consulta periódica recupera un aviso perdido. */
      }
    }
  }
  presence(fileId: string, raw: unknown) {
    const room = this.rooms.get(fileId),
      ownId = this.endpoint?.id().toString();
    if (!room || room.disposed || !ownId) return;
    const presence = sanitizePresence(raw, ownId, Date.now());
    if (!presence) return;
    room.name = presence.name;
    if (presence.sessionId) presence.id = `${ownId}:${presence.sessionId}`;
    if (!room.locations.has(presence.id) && [...room.locations.keys()].filter(id => id === ownId || id.startsWith(`${ownId}:`)).length >= 64) return;
    // Keep datagrams small even with a large selection or multibyte names.
    presence.selectedIds = presence.selectedIds.slice(0, 5);
    presence.moving = presence.moving?.slice(0, 2);
    if (presenceIsActivity(room.locations.get(presence.id), presence)) room.networkLoad.record(Buffer.byteLength(JSON.stringify(presence)), Date.now());
    if (presence.leaving) { room.presence.delete(presence.id); room.locations.delete(presence.id); }
    else { room.presence.set(presence.id, presence); room.locations.set(presence.id, presence); }
    this.emitPresence(room);
    if (room.stored.owner)
      for (const connection of room.clients.values()) this.sendPresence(connection, presence);
    else if (room.connection) this.sendPresence(room.connection, presence);
  }
  private async receivePresence(connection: Connection, room: Room, member: string, serving: boolean) {
    try {
      while (!room.disposed && !this.closed) {
        const bytes = await connection.readDatagram();
        if (bytes.length > 1100) continue;
        if (serving && room.clients.get(member) !== connection) break;
        let raw: unknown; try { raw = JSON.parse(Buffer.from(bytes).toString("utf8")); } catch { continue; }
        this.acceptPresence(connection, room, member, serving, raw);
      }
    } catch { /* El stream fiable permanece activo si fallan los datagramas. */ }
  }
  private acceptPresence(connection: Connection, room: Room, member: string, serving: boolean, value: unknown) {
        if (!value || typeof value !== "object" || room.disposed || (serving && room.clients.get(member) !== connection)) return;
        const raw = value as Presence & { kind?: string };
        // Sólo el anfitrión ya autenticado puede avisar de un estado persistido.
        if (!serving && raw.kind === "processflow-changed/1") {
          room.needsSync = true;
          this.schedule(room, 40);
          return;
        }
        const presence = sanitizePresence(raw, serving ? member : raw.id, Date.now());
        if (!presence || typeof presence.id !== "string" || presence.id.length > 140) return;
        if (serving && presence.sessionId) presence.id = `${member}:${presence.sessionId}`;
        if (
          !room.locations.has(presence.id) &&
          [...room.locations.keys()].filter(id => id === member || id.startsWith(`${member}:`)).length >= 64
        )
          return;
        if (serving && presenceIsActivity(room.locations.get(presence.id), presence)) room.networkLoad.record(Buffer.byteLength(JSON.stringify(presence)), Date.now());
        if (presence.leaving) { room.presence.delete(presence.id); room.locations.delete(presence.id); }
        else { room.presence.set(presence.id, presence); room.locations.set(presence.id, presence); }
        this.emitPresence(room);
        if (serving)
          for (const [id, client] of room.clients) if (id !== member) this.sendPresence(client, presence);
  }
  private enablePresenceStream(connection: Connection, room: Room, member: string, serving: boolean) {
    if (!this.presenceChannels.has(connection)) this.presenceChannels.set(connection, new PresenceChannel(connection, value => this.acceptPresence(connection, room, member, serving, value)));
  }
  private closePresenceStream(connection?: Connection) { if (connection) { this.presenceChannels.get(connection)?.close(); this.presenceChannels.delete(connection); } }
  async command(command: CollaborationCommand): Promise<CollaborationResult> {
    try {
      if (!command || typeof command.fileId !== "string" || command.fileId.length > 200)
        throw new Error("Proyecto inválido.");
      const failed = this.failedRooms.get(command.fileId);
      if (failed) {
        if (command.type === "recover")
          return {
            status: failed.status,
            recovery: JSON.stringify({
              format: "processflow-raw-recovery/v1",
              error: failed.status.error,
              projectId: failed.stored.projectId,
              journal: readFileSync(join(this.root, failed.stored.projectId, "updates.bin")).toString(
                "base64",
              ),
            }),
          };
        if (command.type === "leave") {
          this.failedRooms.delete(command.fileId);
          this.config.rooms = this.config.rooms.filter(r => r.fileId !== command.fileId);
          this.saveConfig();
          return {};
        }
        if (command.type === "open") return { status: failed.status };
        throw new Error(failed.status.error);
      }
      let room = this.rooms.get(command.fileId);
      if (command.type === "open") {
        if (room && command.name) room.name = command.name.slice(0, 40);
        return room ? this.result(room) : {};
      }
      if (command.type === "create") {
        if (room) return this.result(room);
        const options = this.validateOptions(command.options);
        const initial = this.migrate(command.initial);
        const stored: StoredRoom = {
          fileId: command.fileId,
          projectId: randomUUID(),
          owner: true,
          role: "editor",
          options,
          grants: {},
        };
        this.config.rooms.push(stored);
        this.saveConfig();
        room = this.load(stored, initial);
        room.name = command.name?.slice(0, 40);
        const endpoint = await this.endpointReady();
        room.branches!.activate(this.actor(room));
        for (const url of options.relayUrls ?? []) await endpoint.insertRelay({ url });
        for (const addr of options.externalAddresses ?? []) await endpoint.addExternalAddr(addr);
        // La falta de Internet no debe impedir crear/usar una sala por LAN.
        if (this.dependencies.publicNetwork !== false || options.relayUrls?.length)
          await deadline(endpoint.online(), 8000).catch(() => {});
        room.status.state = "online";
        this.emit(room, true);
        return this.result(room);
      }
      if (command.type === "join") {
        if (room) throw new Error("Este proyecto ya está vinculado a una sala.");
        const invitation = this.parseInvitation(command.invitation);
        if (this.config.rooms.some(r => r.projectId === invitation.projectId))
          throw new Error("Este proyecto compartido ya existe en este dispositivo.");
        const stored: StoredRoom = {
          projectId: invitation.projectId,
          fileId: command.fileId,
          owner: false,
          role: invitation.role,
          invitation,
          options: { relayUrls: invitation.relays },
          grants: {},
        };
        this.config.rooms.push(stored);
        this.saveConfig();
        room = this.load(stored);
        room.name = command.name?.slice(0, 40);
        const endpoint = await this.endpointReady();
        for (const url of invitation.relays) await endpoint.insertRelay({ url });
        await this.sync(room);
        this.schedule(room);
        return this.result(room);
      }
      if (!room) throw new Error("El proyecto todavía no está vinculado.");
      if (command.type === "repair-connection") {
        if (!room.status.saved || !room.branches?.enabled) throw new Error("Espera a que se recupere el historial antes de reparar.");
        room.branches.repairConnection(command.branchId, command.viewId, command.edgeId, this.actor(room), command.sourceId, command.targetId);
        this.emit(room, true);
        if (!room.stored.owner) { room.needsSync = true; this.schedule(room, 0); }
        return this.result(room);
      }
      if (command.type === "history-preview")
        return {
          ...this.result(room),
          preview: room.branches!.preview(
            command.branchId,
            command.commitId,
            command.scopes,
            command.choices,
          ),
        };
      if (command.type === "history") {
        room.name = command.name.slice(0, 40);
        if (
          !room.stored.owner &&
          ["merge", "reject", "permission", "editors"].includes(command.action.type) &&
          !room.status.connected
        )
          throw new Error("Conecta con el anfitrión para confirmar esta acción.");
        room.branches!.action(command.action, this.actor(room), command.expectedVector);
        if (!room.stored.owner) {
          room.needsSync = true;
          await this.sync(room);
          this.schedule(room);
        }
        const rejected = room
          .branches!.view(this.actor(room))
          ?.recoveries.find(r => r.id === command.action.id);
        this.emit(room, true);
        if (rejected) throw new Error(rejected.error);
        return this.result(room);
      }
      if (command.type === "patch") {
        if (!room.document.isInitialized() && !room.branches?.enabled)
          throw new Error("Espera la primera sincronización antes de editar esta copia.");
        if (room.stored.role !== "editor")
          throw new Error("Este vínculo permite lectura. Crea una copia para editar.");
        if (!room.status.saved)
          throw new Error("El guardado está detenido. Exporta la recuperación antes de continuar.");
        if (room.branches?.enabled)
          room.branches.patch(
            command.branchId ?? "shared",
            command.before,
            this.migrate(command.after),
            this.actor(room),
          );
        else room.document.patch(command.before, this.migrate(command.after));
        this.emit(room, true);
        if (!room.stored.owner) {
          room.needsSync = true;
          this.schedule(room, 0);
        }
      } else if (command.type === "resolve-field-conflict") {
        if (
          typeof command.editId !== "string" ||
          !command.editId ||
          (command.keep !== "current" && command.keep !== "discarded")
        )
          throw new Error("Resolución de campo inválida.");
        if (!room.document.isInitialized() && !room.branches?.enabled)
          throw new Error("Espera la primera sincronización antes de editar esta copia.");
        if (room.stored.role !== "editor")
          throw new Error("Este vínculo permite lectura. Crea una copia para editar.");
        if (!room.status.saved)
          throw new Error("El guardado está detenido. Exporta la recuperación antes de continuar.");
        if (room.branches?.enabled)
          room.branches.resolveFieldConflict(
            command.branchId ?? "shared",
            command.editId,
            command.keep,
            this.actor(room),
          );
        else room.document.resolveFieldConflict(command.editId, command.keep);
        this.emit(room, true);
        if (!room.stored.owner) {
          room.needsSync = true;
          this.schedule(room, 0);
        }
      } else if (command.type === "invite") {
        if (!room.stored.owner) throw new Error("Solo el anfitrión puede crear invitaciones.");
        if (command.role !== "editor" && command.role !== "viewer") throw new Error("Rol inválido.");
        const endpoint = await this.endpointReady();
        if (this.dependencies.publicNetwork !== false || room.stored.options.relayUrls?.length)
          await deadline(endpoint.online(), 8000).catch(() => {});
        const token = randomBytes(32).toString("base64url");
        room.stored.grants[hash(token)] = { hash: hash(token), role: command.role };
        this.saveConfig();
        const invitation: Invitation = {
          format: "pf-room/1",
          projectId: room.stored.projectId,
          token,
          role: command.role,
          host: EndpointTicket.fromAddr(endpoint.addr()).toString(),
          relays: room.stored.options.relayUrls ?? [],
        };
        return {
          ...this.result(room),
          invitation: `processflow://${Buffer.from(JSON.stringify(invitation)).toString("base64url")}`,
        };
      } else if (command.type === "retry") {
        if (!room.stored.owner) {
          await this.sync(room);
          this.schedule(room);
        }
      } else if (command.type === "refresh-link") {
        if (room.stored.owner) throw new Error("El anfitrión ya anuncia su dirección actual.");
        const refreshed = this.parseInvitation(command.invitation),
          previous = room.stored.invitation!;
        if (
          refreshed.projectId !== room.stored.projectId ||
          !EndpointTicket.fromString(refreshed.host)
            .endpointAddr()
            .id()
            .equals(EndpointTicket.fromString(previous.host).endpointAddr().id())
        )
          throw new Error("La nueva dirección no pertenece al mismo proyecto y anfitrión.");
        room.stored.invitation = { ...refreshed, token: previous.token, role: previous.role };
        room.stored.options.relayUrls = refreshed.relays;
        this.saveConfig();
        const endpoint = await this.endpointReady();
        for (const url of refreshed.relays) await endpoint.insertRelay({ url });
        this.closePresenceStream(room.connection); room.connection?.close(BigInt(0), []);
        await room.syncTask;
        room.connection = undefined;
        await this.sync(room);
        this.schedule(room);
      } else if (command.type === "undo" || command.type === "redo") {
        if (room.stored.role !== "editor") throw new Error("El vínculo es de lectura.");
        if (room.branches?.enabled)
          throw new Error("Utiliza Deshacer o Rehacer en el lienzo de la rama actual.");
        if (command.type === "undo") room.document.undo();
        else room.document.redo();
        this.emit(room, true);
      } else if (command.type === "recover") {
        const raw = {
          format: "processflow-raw-recovery/v1",
          projectId: room.stored.projectId,
          crdt: encode(room.document.update()),
        };
        if (room.quarantined) return { status: { ...room.status }, recovery: JSON.stringify(raw) };
        try {
          const shared = room.branches?.enabled ? room.branches.defaultSnapshot() : room.document.snapshot();
          return {
            ...this.result(room),
            recovery: JSON.stringify(
              {
                ...packBoard(
                  shared.content,
                  { customViews: shared.customViews, activeViewId: "design", injectedViewIds: [] },
                  shared,
                ),
                recuperacion: JSON.parse(room.document.recoveryJson()),
                crdt: raw.crdt,
                ramas: room.branches?.recovery(),
              },
              null,
              2,
            ),
          };
        } catch {
          return { status: { ...room.status }, recovery: JSON.stringify(raw) };
        }
      } else if (command.type === "revoke") {
        if (!room.stored.owner) throw new Error("Solo el anfitrión administra los accesos.");
        for (const grant of Object.values(room.stored.grants))
          if (grant.member === command.memberId) grant.revoked = true;
        this.saveConfig();
        room.clients.get(command.memberId)?.close(BigInt(1), [...Buffer.from("Invitación revocada.")]);
        room.seats.leave(command.memberId);
      } else if (command.type === "leave") {
        room.disposed = true;
        await room.pathWatch?.stop();
        room.pathWatch = undefined;
        if (room.timer) clearTimeout(room.timer);
        this.closePresenceStream(room.connection); room.connection?.close(BigInt(0), []);
        for (const connection of room.clients.values()) connection.close(BigInt(0), []);
        await room.syncTask;
        room.branches?.close();
        room.journal.close();
        room.document.destroy();
        this.rooms.delete(command.fileId);
        this.config.rooms = this.config.rooms.filter(r => r.fileId !== command.fileId);
        this.saveConfig();
        return {};
      }
      return this.result(room);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }
  private migrate(project: SharedProject): SharedProject {
    if (!project || !project.content || !Array.isArray(project.customViews))
      throw new Error("Contenido compartido inválido.");
    const safe: SharedProject = {
      name: project.name,
      content: withStableGraphIds(project.content),
      customViews: project.customViews.map(v => ({
        ...v,
        ...(v.graph ? { graph: withStableGraphIds(v.graph) } : {}),
      })),
      references: project.references,
      agent: {
        versions: project.agent.versions,
        lineages: project.agent.lineages,
        artifacts: project.agent.artifacts,
      },
      analysis: {
        driversResult: project.analysis.driversResult,
        constraintsResult: project.analysis.constraintsResult,
        roadmapResult: project.analysis.roadmapResult,
        proposalResult: project.analysis.proposalResult,
      },
    };
    assertJson(safe);
    assertEncodedProject(encodeProject(safe));
    return safe;
  }
  private result(room: Room): CollaborationResult {
    this.refreshMembers(room);
    this.refreshStatusDetails(room);
    if (room.stored.owner) room.status.peers = room.seats.count;
    let snapshot: SharedProject | undefined;
    try {
      if (!room.quarantined)
        snapshot = room.branches?.enabled ? room.branches.defaultSnapshot() : room.document.snapshot();
    } catch {
      /* first connection pending */
    }
    return { status: { ...room.status }, snapshot, workspace: room.quarantined ? undefined : room.branches?.view(this.actor(room)) };
  }
  private refreshStatusDetails(room: Room) {
    if (room.stored.owner) room.status.routeCounts = room.seats.countsByRoute();
    if (room.stored.owner) room.status.participants = participantsForRoom({ ownId: this.endpoint?.id().toString() ?? "host", ownName: room.name ?? "Anfitrión", owner: true, connected: true, members: room.status.members ?? [], locations: [...room.locations.values()] });
    room.status.discardedEdits =
      !room.quarantined && !room.branches?.enabled && room.document.isInitialized()
        ? room.document.discardedEdits()
        : [];
  }
  private actor(room: Room): HistoryActor {
    return {
      id: this.endpoint?.id().toString() ?? "host",
      name: room.name ?? "Participante",
      owner: room.stored.owner,
      role: room.stored.role,
    };
  }
  private refreshMembers(room: Room) {
    if (room.stored.owner)
      room.status.members = [
        ...new Map(
          Object.values(room.stored.grants)
            .filter(grant => grant.member)
            .map(grant => [
              grant.member!,
              {
                id: grant.member!,
                name: grant.name,
                role: grant.role,
                connected: room.clients.has(grant.member!),
                revoked: !!grant.revoked,
              },
            ]),
        ).values(),
      ];
  }
  private validateOptions(options: RoomOptions): RoomOptions {
    const relayUrls = (options.relayUrls ?? []).map(v => v.trim()).filter(Boolean),
      externalAddresses = (options.externalAddresses ?? []).map(v => v.trim()).filter(Boolean);
    if (relayUrls.length > 4 || externalAddresses.length > 8)
      throw new Error("Demasiadas direcciones de red.");
    for (const value of relayUrls) {
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        throw new Error("URL de intermediario inválida.");
      }
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password)
        throw new Error("URL de intermediario inválida.");
    }
    for (const value of externalAddresses)
      if (!/^[\w.:[\]-]+:\d{1,5}$/.test(value)) throw new Error("Dirección pública inválida; usa IP:puerto.");
    return { relayUrls, externalAddresses };
  }
  private parseInvitation(text: string): Invitation {
    if (typeof text !== "string" || text.length > 16_384 || !text.startsWith("processflow://"))
      throw new Error("Invitación inválida.");
    const invitation = JSON.parse(Buffer.from(text.slice(14), "base64url").toString("utf8")) as Invitation;
    if (
      invitation.format !== "pf-room/1" ||
      !validId(invitation.projectId) ||
      !/^[\w-]{43}$/.test(invitation.token) ||
      !["editor", "viewer"].includes(invitation.role)
    )
      throw new Error("Invitación inválida o incompatible.");
    EndpointTicket.fromString(invitation.host);
    this.validateOptions({ relayUrls: invitation.relays });
    return invitation;
  }
  private async accept(endpoint: Endpoint) {
    while (!this.closed) {
      try {
        const incoming = await endpoint.acceptNext();
        if (!incoming) break;
        if (this.handshakes >= 128) {
          await incoming.refuse();
          continue;
        }
        this.handshakes++;
        void (async () => {
          let connection: Connection | undefined,
            pending = true;
          const authenticated = () => {
            if (pending) {
              pending = false;
              this.handshakes--;
            }
          };
          try {
            connection = await deadline((await incoming.accept()).connect());
            this.incoming.add(connection);
            await this.serve(connection, authenticated);
          } finally {
            authenticated();
            if (connection) {
              this.incoming.delete(connection);
              connection.close(BigInt(0), []);
            }
          }
        })().catch(() => {});
      } catch {
        if (this.closed) break;
      }
    }
  }
  private async serve(connection: Connection, authenticated: () => void) {
    const member = connection.remoteId().toString();
    let active: Room | undefined;
    let clientPathWatch: WatchHandle | undefined;
    try {
      while (!this.closed) {
        const stream = await deadline(connection.acceptBi(), active ? 60_000 : 10_000);
        const request = await deadline(readFrame<Request>(stream, active ? undefined : 4096));
        const room = [...this.rooms.values()].find(
          r => !r.disposed && r.stored.owner && r.stored.projectId === request.projectId,
        );
        try {
          if (
            request.version !== 1 ||
            !room ||
            typeof request.token !== "string" ||
            request.token.length > 100
          )
            throw new Error("Acceso no autorizado.");
          if ((!active && (request.stage !== "hello" || request.update)) || (active && active !== room))
            throw new Error("Negociación de sala inválida.");
          const tokenHash = hash(request.token),
            grant = room.stored.grants[tokenHash];
          if (
            !grant ||
            grant.revoked ||
            !timingSafeEqual(Buffer.from(grant.hash), Buffer.from(tokenHash)) ||
            (grant.member && grant.member !== member)
          )
            throw new Error("Invitación inválida, revocada o ya utilizada.");
          if (!active) this.refreshCapacity(room);
          let route = this.classifyPaths(connection.paths());
          // En Iroh el primer paquete suele llegar por relay mientras perfora NAT (P2P).
          // Si solo el cupo de relay está lleno pero hay cupo por P2P o LAN, damos margen
          // a que complete la ruta directa antes de rechazar.
          if (
            !active &&
            !room.seats.canEnter(member, route) &&
            route === "relay" &&
            (room.seats.canEnter(member, "direct") || room.seats.canEnter(member, "lan"))
          ) {
            for (let attempt = 0; attempt < 25 && !this.closed && !room.disposed; attempt++) {
              await new Promise(resolve => setTimeout(resolve, 100));
              this.refreshConnectionRoutes(room);
              route = this.classifyPaths(connection.paths());
              if (room.seats.canEnter(member, route)) break;
            }
          }
          if (!room.seats.enter(member, route)) {
            if (
              route === "relay" &&
              (room.seats.canEnter(member, "direct") || room.seats.canEnter(member, "lan"))
            )
              throw new Error(
                "Cupo por intermediario (relay) lleno; las conexiones por red local (LAN) o P2P directo siguen disponibles. Tu copia local se conserva y reintentará automáticamente.",
              );
            throw new Error(
              "Sala llena según la capacidad del anfitrión y la conexión. Tu copia local se conserva; se reintentará automáticamente.",
            );
          }
          if (!grant.member) {
            grant.member = member;
            this.saveConfig();
          }
          if (
            typeof request.name === "string" &&
            request.name.trim() &&
            grant.name !== request.name.slice(0, 40)
          ) {
            grant.name = request.name.slice(0, 40);
            this.saveConfig();
          }
          const oldConnection = room.clients.get(member);
          if (oldConnection && oldConnection !== connection) oldConnection.close(BigInt(0), []);
          room.clients.set(member, connection);
          authenticated();
          if (request.presenceMode === "stream-v1") this.enablePresenceStream(connection, room, member, true);
          if (!active) {
            clientPathWatch = connection.watchPaths((...args: unknown[]) => {
              const paths = args.find(Array.isArray) as PathSnapshot[] | undefined;
              if (paths && !room.disposed && room.clients.get(member) === connection) {
                room.seats.updateRoute(member, this.classifyPaths(paths));
                room.status.routeCounts = room.seats.countsByRoute();
                this.emit(room);
              }
            });
            void this.receivePresence(connection, room, member, true);
            for (const presence of room.presence.values()) this.sendPresence(connection, presence);
          }
          active = room;
          const before = room.revision;
          const actor: HistoryActor = {
            id: member,
            name: typeof request.name === "string" ? request.name.slice(0, 40) : "Participante",
            owner: false,
            role: grant.role,
          };
          if (request.branches && !room.branches?.enabled) room.branches!.activate(this.actor(room));
          if (request.update && grant.role !== "editor") throw new Error("El vínculo permite solo lectura.");
          if (
            request.update &&
            room.branches?.enabled &&
            !canEditBranch(room.branches.view(actor)!.history, "shared", actor, new Date().toISOString())
          )
            throw new Error("No tienes permiso para editar esta rama.");
          const serviceStart = performance.now();
          if (!room.status.saved)
            throw new Error(
              "El guardado está detenido; exporta la recuperación y reinicia después de corregir el disco.",
            );
          if (request.update && room.branches?.enabled)
            throw new Error("Actualiza la aplicación para editar esta sala con ramas protegidas.");
          if (request.update) room.document.receiveRemote(decode(request.update));
          if (!room.status.saved) throw new Error("El anfitrión no pudo guardar; vuelve a intentar después.");
          room.status.lastSynced = new Date().toISOString();
          room.status.state = "online";
          const branches = request.branches ? room.branches!.exchange(request.branches, actor) : undefined;
          this.refreshMembers(room); this.refreshStatusDetails(room);
          const response = {
            ok: true,
            update: request.branches ? encode(Uint8Array.of(0, 0)) : encode(room.document.update(decode(request.vector))),
            vector: encode(room.document.vector()),
            capacity: room.status.capacity,
            peers: room.seats.count,
            participants: room.status.participants,
            presenceMode: request.presenceMode === "stream-v1" ? "stream-v1" : undefined,
            branches,
          } satisfies Response;
          const serviceMs = performance.now() - serviceStart;
          if (request.stage === "sync") room.serviceCost.record(serviceMs, Date.now());
          await sendFrame(stream, response);
          this.emit(room, before !== room.revision);
        } catch (error) {
          await sendFrame(stream, {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          } satisfies Response);
          await deadline(stream.send.stopped(), 2000).catch(() => {});
          break;
        }
      }
    } finally {
      this.closePresenceStream(connection);
      await clientPathWatch?.stop().catch(() => {});
      if (active && active.clients.get(member) === connection) {
        active.clients.delete(member);
        active.seats.leave(member);
        active.status.routeCounts = active.seats.countsByRoute();
        for (const id of active.presence.keys())
          if (id === member || id.startsWith(`${member}:`)) active.presence.delete(id);
        for (const id of active.locations.keys()) if (id === member || id.startsWith(`${member}:`)) active.locations.delete(id);
        this.emitPresence(active);
        this.emit(active);
      }
    }
  }
  private schedule(room: Room, delay?: number) {
    if (this.closed || room.disposed || room.stored.owner) return;
    if (room.timer) clearTimeout(room.timer);
    room.timer = setTimeout(
      () => {
        room.timer = undefined;
        void this.sync(room).finally(() => this.schedule(room));
      },
      delay ??
        (room.failures
          ? 5_000
          : room.needsSync
            ? 40
            : 700),
    );
    room.timer.unref();
  }
  private async connect(room: Room): Promise<Connection> {
    const endpoint = await this.endpointReady(),
      storedAddr = EndpointTicket.fromString(room.stored.invitation!.host).endpointAddr();
    const discovered = await this.discovery?.find(storedAddr.id().toString());
    const addr = discovered
      ? new EndpointAddr(storedAddr.id(), discovered.relayUrl() ?? storedAddr.relayUrl(), [
          ...new Set([...discovered.directAddresses(), ...storedAddr.directAddresses()]),
        ])
      : storedAddr;
    // Try local routes first. Internet/relay attempts follow automatically.
    const interfaces = Object.values(networkInterfaces()).flatMap(list => list ?? []);
    const lan = addr.directAddresses().filter(a => isLanPath(a, interfaces));
    if (lan.length) {
      try {
        return await deadline(endpoint.connect(new EndpointAddr(addr.id(), null, lan), ALPN), 1200);
      } catch {
        /* Continue through NAT traversal/relay. */
      }
    }
    return deadline(endpoint.connect(addr, ALPN));
  }
  private sync(room: Room): Promise<void> {
    if (room.disposed || this.closed) return Promise.resolve();
    if (room.syncTask) return room.syncTask;
    room.needsSync = false;
    room.syncTask = this.performSync(room).finally(() => {
      room.syncTask = undefined;
      if (room.needsSync) this.schedule(room, 40);
    });
    return room.syncTask;
  }
  private updateRoute(room: Room, paths: PathSnapshot[]) {
    const selected = paths.find(path => path.isSelected);
    if (!selected) return;
    const route = selected.isRelay
      ? "relay"
      : isLanPath(
            selected.remoteAddr,
            Object.values(networkInterfaces()).flatMap(l => l ?? []),
          )
        ? "lan"
        : "direct";
    if (room.status.route !== route) {
      room.status.route = route;
      this.emit(room);
    }
  }
  private async performSync(room: Room) {
    room.syncing = true;
    try {
      if (!room.status.saved)
        throw new Error("El guardado está detenido. Exporta la recuperación antes de reconectar.");
      if (!room.connection || room.connection.closeReason() !== null) {
        this.closePresenceStream(room.connection);
        room.status.state = "connecting";
        this.emit(room);
        await room.pathWatch?.stop();
        room.pathWatch = undefined;
        room.connection = await this.connect(room);
        room.remoteVector = undefined;
        const connection = room.connection;
        // Iroh comprueba rutas dentro de la misma conexión QUIC. Observar sus
        // cambios no abre conexiones paralelas ni interrumpe el canal que funciona.
        room.pathWatch = connection.watchPaths((...args: unknown[]) => {
          // N-API entrega (error, valor); admitir también la firma de un valor
          // declarada por el binding evita depender de esa discrepancia de tipos.
          const paths = args.find(Array.isArray) as PathSnapshot[] | undefined;
          if (paths && !room.disposed && room.connection === connection) this.updateRoute(room, paths);
        });
        void this.receivePresence(room.connection, room, room.connection.remoteId().toString(), false);
      }
      if (room.disposed || this.closed) {
        room.connection.close(BigInt(0), []);
        return;
      }
      const stream = await deadline(room.connection.openBi());
      const authenticated = room.remoteVector !== undefined;
      const request: Request = {
        presenceMode: "stream-v1",
        version: 1,
        stage: authenticated ? "sync" : "hello",
        projectId: room.stored.projectId,
        token: room.stored.invitation!.token,
        vector: encode(authenticated ? room.document.vector() : Uint8Array.of(0)),
        name: room.name,
        ...(authenticated
          ? { branches: room.branches!.request() }
          : { branches: { revision: 0, vectors: {}, updates: {}, operations: [] } }),
        ...(authenticated && room.stored.role === "editor" && !room.branches?.enabled
          ? { update: encode(room.document.update(room.remoteVector)) }
          : {}),
      };
      await deadline(sendFrame(stream, request));
      const response = await deadline(readFrame<Response>(stream), authenticated ? 20_000 : 180_000);
      if (room.disposed || this.closed) return;
      if (!response.ok) throw new Error(response.error ?? "No se pudo sincronizar.");
      if (response.presenceMode === "stream-v1") this.enablePresenceStream(room.connection, room, room.connection.remoteId().toString(), false);
      const before = room.revision;
      if (!response.branches) room.document.receiveRemote(decode(response.update!));
      if (response.branches) room.branches!.receive(response.branches);
      room.remoteVector = decode(response.vector!);
      room.failures = 0;
      room.status.connected = true;
      room.status.state = "online";
      room.status.error = undefined;
      room.status.lastSynced = new Date().toISOString();
      room.status.capacity = response.capacity!;
      room.status.peers = response.peers!;
      room.status.participants = response.participants;
      this.updateRoute(room, room.connection.paths());
      this.emit(room, before !== room.revision);
    } catch (error) {
      await room.pathWatch?.stop();
      room.pathWatch = undefined;
      room.failures++;
      this.closePresenceStream(room.connection); room.connection?.close(BigInt(1), []);
      room.connection = undefined;
      room.status.connected = false;
      room.status.participants = undefined;
      room.status.peers = 1;
      room.presence.clear();
      room.locations.clear();
      room.status.state = "offline";
      room.status.route = "none";
      room.status.error = error instanceof Error ? error.message : String(error);
      this.emit(room);
    } finally {
      room.syncing = false;
    }
  }
  async close() {
    this.closed = true;
    if (this.monitor) clearInterval(this.monitor);
    if (this.presenceMonitor) clearInterval(this.presenceMonitor);
    this.discovery?.close();
    for (const channel of this.presenceChannels.values()) channel.close(); this.presenceChannels.clear();
    for (const room of this.rooms.values()) {
      room.disposed = true;
      if (room.timer) clearTimeout(room.timer);
      await room.pathWatch?.stop();
      room.connection?.close(BigInt(0), []);
    }
    for (const connection of this.incoming) connection.close(BigInt(0), []);
    if (this.endpoint) await this.endpoint.close();
    await Promise.allSettled([...this.rooms.values()].map(room => room.syncTask));
    for (const room of this.rooms.values()) {
      room.branches?.close();
      room.journal.close();
      room.document.destroy();
    }
    this.rooms.clear();
  }
}
