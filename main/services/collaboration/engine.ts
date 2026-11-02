import { Endpoint, EndpointAddr, EndpointTicket, RelayMode, type Connection } from "@number0/iroh";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomBytes, randomUUID, createHash, timingSafeEqual } from "node:crypto";
import { freemem, networkInterfaces } from "node:os";
import { performance } from "node:perf_hooks";
import { SharedDocument } from "../../../src/lib/collaboration/document";
import { estimateCapacity, Seats } from "../../../src/lib/collaboration/capacity";
import { withStableGraphIds } from "../../../src/lib/collaboration/identity";
import type { Capacity, CollaborationCommand, CollaborationEvent, CollaborationResult, CollaborationStatus, Role, RoomOptions, SharedProject } from "../../../src/lib/collaboration/types";
import { Journal, writePrivateJson } from "./journal";
import { deadline, readFrame, sendFrame } from "./wire";
import { sanitizePresence, livePresence, type Presence } from "../../../src/lib/collaboration/presence";
import { packBoard } from "../../../src/lib/board-file";
import { LanDiscovery } from "./discovery";
import { isLanPath } from "../../../src/lib/collaboration/network";

const ALPN = [...Buffer.from("processflow/collaboration/1")];
const encode = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const decode = (text: string) => new Uint8Array(Buffer.from(text, "base64"));
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const validId = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9-]{36}$/.test(value);
interface Invitation { format: "pf-room/1"; projectId: string; host: string; token: string; role: Role; relays: string[] }
interface InviteGrant { hash: string; role: Role; member?: string; revoked?: boolean }
interface StoredRoom {
  projectId: string; fileId: string; owner: boolean; role: Role; options: RoomOptions;
  invitation?: Invitation; grants: Record<string, InviteGrant>;
}
interface Config { key: number[]; port?: number; rooms: StoredRoom[] }
interface Request { version: 1; stage: "hello" | "sync"; projectId: string; token: string; vector: string; update?: string }
interface Response { ok: boolean; error?: string; vector?: string; update?: string; capacity?: Capacity; peers?: number }
interface Room {
  stored: StoredRoom; document: SharedDocument; journal: Journal; status: CollaborationStatus;
  seats: Seats; clients: Map<string, Connection>; connection?: Connection;
  timer?: ReturnType<typeof setTimeout>; syncing?: boolean; failures: number; remoteVector?: Uint8Array;
  revision: number;
  disposed?: boolean;
  syncTask?: Promise<void>;
  presence: Map<string, Presence>;
}

/** Native transport/persistence service. Existing contexts remain the UI's API. */
export class CollaborationEngine {
  private config: Config;
  private rooms = new Map<string, Room>();
  private endpoint?: Endpoint;
  private starting?: Promise<Endpoint>;
  private closed = false;
  private incoming = new Set<Connection>();
  private handshakes = 0;
  private presenceMonitor?: ReturnType<typeof setInterval>;
  private discovery?: LanDiscovery;
  private monitor?: ReturnType<typeof setInterval>;
  constructor(private root: string, private event: (event: CollaborationEvent) => void = () => {}, private dependencies: { journal?: (file: string) => Journal } = {}) {
    mkdirSync(root, { recursive: true });
    const configFile = join(root, "device.json");
    this.config = existsSync(configFile) ? JSON.parse(readFileSync(configFile, "utf8")) as Config : { key: [...randomBytes(32)], rooms: [] };
    this.saveConfig();
  }
  private saveConfig() { writePrivateJson(join(this.root, "device.json"), this.config); }
  async start(): Promise<void> {
    for (const stored of this.config.rooms) this.load(stored);
    if (this.rooms.size) await this.endpointReady();
    for (const room of this.rooms.values()) if (!room.stored.owner) this.schedule(room, 0);
    this.monitor = setInterval(() => {
      for (const room of this.rooms.values()) if (room.stored.owner) {
        room.status.capacity = this.measure(room.document); room.seats.resize(room.status.capacity.limit); this.emit(room);
      }
    }, 30_000); this.monitor.unref();
    this.presenceMonitor = setInterval(() => {
      for (const room of this.rooms.values()) {
        const peers = livePresence([...room.presence.values()], Date.now());
        if (peers.length !== room.presence.size) { room.presence = new Map(peers.map(p => [p.id, p])); this.emitPresence(room); }
      }
    }, 1_000); this.presenceMonitor.unref();
  }
  private async endpointReady(): Promise<Endpoint> {
    if (this.endpoint) return this.endpoint;
    if (this.starting) return this.starting;
    this.starting = (async () => {
      const builder = Endpoint.builder(); builder.applyMinimal(); builder.secretKey(this.config.key); builder.alpns([ALPN]);
      const relays = [...new Set(this.config.rooms.flatMap(r => r.options.relayUrls ?? []))];
      builder.relayMode(relays.length ? RelayMode.customFromUrls(relays) : RelayMode.disabled());
      builder.bindAddr(`0.0.0.0:${this.config.port ?? 0}`);
      const endpoint = await builder.bind();
      this.endpoint = endpoint;
      this.discovery = new LanDiscovery(endpoint);
      this.config.port = Number(endpoint.boundSockets().find(a => a.startsWith("0.0.0.0:"))?.split(":").pop()); this.saveConfig();
      for (const addr of this.config.rooms.flatMap(r => r.options.externalAddresses ?? [])) await endpoint.addExternalAddr(addr);
      void this.accept(endpoint);
      return endpoint;
    })();
    try { return await this.starting; } finally { this.starting = undefined; }
  }
  private measure(document: SharedDocument): Capacity {
    const projectBytes = document.update().byteLength;
    const probe = new SharedDocument(); const begin = performance.now();
    try { probe.receive(document.update()); probe.snapshot(); }
    finally { probe.destroy(); }
    return estimateCapacity({ freeMemoryBytes: freemem(), projectBytes, mergeMs: performance.now() - begin });
  }
  private load(stored: StoredRoom, initial?: SharedProject): Room {
    const found = this.rooms.get(stored.fileId); if (found) return found;
    if (!validId(stored.projectId)) throw new Error("Identidad de proyecto inválida.");
    const document = new SharedDocument(), journalFile = join(this.root, stored.projectId, "updates.bin");
    const journal = this.dependencies.journal?.(journalFile) ?? new Journal(journalFile);
    for (const update of journal.updates) document.receive(update);
    const room: Room = {
      stored, document, journal, clients: new Map(), failures: 0, seats: new Seats(1), revision: 0, presence: new Map(),
      status: { projectId: stored.projectId, fileId: stored.fileId, owner: stored.owner, role: stored.role, connected: stored.owner, state: stored.owner ? "local" : "offline", route: "none", peers: 1, pendingEdges: 0, saved: true, initialized: false,
        capacity: estimateCapacity({ freeMemoryBytes: freemem(), projectBytes: 0, mergeMs: 1 }) },
    };
    document.doc.on("update", (update: Uint8Array) => {
      room.status.saved = false;
      try { journal.append(update); room.status.saved = true; room.revision++; }
      catch (error) { room.status.error = `No se pudo guardar: ${String(error)}`; room.status.state = "error"; this.emit(room); throw error; }
    });
    // Register before seeding so a failed first fsync still has a recoverable
    // in-memory document and a journal that close() can release.
    this.rooms.set(stored.fileId, room);
    if (!journal.updates.length && initial) document.patch({}, initial);
    document.clearUndo();
    room.status.initialized = document.isInitialized();
    if (journal.updates.length || initial) { room.status.capacity = this.measure(document); room.seats.resize(room.status.capacity.limit); }
    return room;
  }
  private emit(room: Room, includeSnapshot = false) {
    if (room.disposed) return;
    room.status.initialized = room.document.isInitialized();
    room.status.peers = room.stored.owner ? room.seats.count : room.status.peers;
    try { room.status.pendingEdges = room.document.pendingEdges(); } catch { /* Joining has not received its first state. */ }
    this.event({ fileId: room.stored.fileId, status: { ...room.status }, ...(includeSnapshot ? { snapshot: room.document.snapshot() } : {}) });
  }
  private emitPresence(room: Room) {
    if (room.disposed) return;
    const ownId = this.endpoint?.id().toString();
    this.event({ fileId: room.stored.fileId, presence: livePresence([...room.presence.values()], Date.now()).filter(p => p.id !== ownId) });
  }
  private sendPresence(connection: Connection, presence: Presence) {
    const bytes = Buffer.from(JSON.stringify(presence));
    if (bytes.length <= 1100 && (connection.maxDatagramSize() ?? 0) >= bytes.length) {
      try { connection.sendDatagram([...bytes]); } catch { /* Latest presence replaces a dropped datagram. */ }
    }
  }
  presence(fileId: string, raw: unknown) {
    const room = this.rooms.get(fileId), ownId = this.endpoint?.id().toString();
    if (!room || room.disposed || !ownId) return;
    const presence = sanitizePresence(raw, ownId, Date.now()); if (!presence) return;
    // Keep datagrams small even with a large selection or multibyte names.
    presence.selectedIds = presence.selectedIds.slice(0, 5); presence.moving = presence.moving?.slice(0, 2);
    room.presence.set(ownId, presence);
    if (room.stored.owner) for (const connection of room.clients.values()) this.sendPresence(connection, presence);
    else if (room.connection) this.sendPresence(room.connection, presence);
  }
  private async receivePresence(connection: Connection, room: Room, member: string, serving: boolean) {
    try {
      while (!room.disposed && !this.closed) {
        const bytes = await connection.readDatagram(); if (bytes.length > 1100) continue;
        if (serving && room.clients.get(member) !== connection) break;
        const raw = JSON.parse(Buffer.from(bytes).toString("utf8")) as Presence;
        const presence = sanitizePresence(raw, serving ? member : raw.id, Date.now());
        if (!presence || typeof presence.id !== "string" || presence.id.length > 100) continue;
        room.presence.set(presence.id, presence); this.emitPresence(room);
        if (serving) for (const [id, client] of room.clients) if (id !== member) this.sendPresence(client, presence);
      }
    } catch { /* Connection close clears presence through its lease/expiry. */ }
  }
  async command(command: CollaborationCommand): Promise<CollaborationResult> {
    try {
      if (!command || typeof command.fileId !== "string" || command.fileId.length > 200) throw new Error("Proyecto inválido.");
      let room = this.rooms.get(command.fileId);
      if (command.type === "open") return room ? this.result(room) : {};
      if (command.type === "create") {
        if (room) return this.result(room);
        const options = this.validateOptions(command.options);
        const initial = this.migrate(command.initial);
        const stored: StoredRoom = { fileId: command.fileId, projectId: randomUUID(), owner: true, role: "editor", options, grants: {} };
        this.config.rooms.push(stored); this.saveConfig(); room = this.load(stored, initial);
        const endpoint = await this.endpointReady();
        for (const url of options.relayUrls ?? []) await endpoint.insertRelay({ url });
        for (const addr of options.externalAddresses ?? []) await endpoint.addExternalAddr(addr);
        if (options.relayUrls?.length) await deadline(endpoint.online());
        room.status.state = "online"; this.emit(room, true); return this.result(room);
      }
      if (command.type === "join") {
        if (room) throw new Error("Este proyecto ya está vinculado a una sala.");
        const invitation = this.parseInvitation(command.invitation);
        if (this.config.rooms.some(r => r.projectId === invitation.projectId)) throw new Error("Este proyecto compartido ya existe en este dispositivo.");
        const stored: StoredRoom = { projectId: invitation.projectId, fileId: command.fileId, owner: false, role: invitation.role, invitation, options: { relayUrls: invitation.relays }, grants: {} };
        this.config.rooms.push(stored); this.saveConfig(); room = this.load(stored);
        const endpoint = await this.endpointReady(); for (const url of invitation.relays) await endpoint.insertRelay({ url });
        await this.sync(room); this.schedule(room); return this.result(room);
      }
      if (!room) throw new Error("El proyecto todavía no está vinculado.");
      if (command.type === "patch") {
        if (!room.document.isInitialized()) throw new Error("Espera la primera sincronización antes de editar esta copia.");
        if (room.stored.role !== "editor") throw new Error("Este vínculo permite lectura. Crea una copia para editar.");
        if (!room.status.saved) throw new Error("El guardado está detenido. Exporta la recuperación antes de continuar.");
        room.document.patch(command.before, this.migrate(command.after));
        this.emit(room); if (!room.stored.owner) this.schedule(room, 0);
      } else if (command.type === "invite") {
        if (!room.stored.owner) throw new Error("Solo el anfitrión puede crear invitaciones.");
        if (command.role !== "editor" && command.role !== "viewer") throw new Error("Rol inválido.");
        const endpoint = await this.endpointReady();
        if (room.stored.options.relayUrls?.length) await deadline(endpoint.online());
        const token = randomBytes(32).toString("base64url");
        room.stored.grants[hash(token)] = { hash: hash(token), role: command.role }; this.saveConfig();
        const invitation: Invitation = { format: "pf-room/1", projectId: room.stored.projectId, token, role: command.role, host: EndpointTicket.fromAddr(endpoint.addr()).toString(), relays: room.stored.options.relayUrls ?? [] };
        return { ...this.result(room), invitation: `processflow://${Buffer.from(JSON.stringify(invitation)).toString("base64url")}` };
      } else if (command.type === "retry") {
        if (!room.stored.owner) { await this.sync(room); this.schedule(room); }
      } else if (command.type === "refresh-link") {
        if (room.stored.owner) throw new Error("El anfitrión ya anuncia su dirección actual.");
        const refreshed = this.parseInvitation(command.invitation), previous = room.stored.invitation!;
        if (refreshed.projectId !== room.stored.projectId || !EndpointTicket.fromString(refreshed.host).endpointAddr().id().equals(EndpointTicket.fromString(previous.host).endpointAddr().id())) throw new Error("La nueva dirección no pertenece al mismo proyecto y anfitrión.");
        room.stored.invitation = { ...refreshed, token: previous.token, role: previous.role };
        room.stored.options.relayUrls = refreshed.relays; this.saveConfig();
        const endpoint = await this.endpointReady(); for (const url of refreshed.relays) await endpoint.insertRelay({ url });
        room.connection?.close(BigInt(0), []); await room.syncTask; room.connection = undefined;
        await this.sync(room); this.schedule(room);
      } else if (command.type === "undo" || command.type === "redo") {
        if (room.stored.role !== "editor") throw new Error("El vínculo es de lectura.");
        if (command.type === "undo") room.document.undo(); else room.document.redo(); this.emit(room, true);
      } else if (command.type === "recover") {
        const shared = room.document.snapshot();
        return { ...this.result(room), recovery: JSON.stringify({ ...packBoard(shared.content, { customViews: shared.customViews, activeViewId: "design", injectedViewIds: [] }, shared),
          recuperacion: JSON.parse(room.document.recoveryJson()), crdt: encode(room.document.update()) }, null, 2) };
      }
      else if (command.type === "revoke") {
        if (!room.stored.owner) throw new Error("Solo el anfitrión administra los accesos.");
        for (const grant of Object.values(room.stored.grants)) if (grant.member === command.memberId) grant.revoked = true;
        this.saveConfig(); room.clients.get(command.memberId)?.close(BigInt(1), []); room.seats.leave(command.memberId);
      } else if (command.type === "leave") {
        room.disposed = true;
        if (room.timer) clearTimeout(room.timer); room.connection?.close(BigInt(0), []);
        for (const connection of room.clients.values()) connection.close(BigInt(0), []);
        await room.syncTask;
        room.journal.close(); room.document.destroy(); this.rooms.delete(command.fileId);
        this.config.rooms = this.config.rooms.filter(r => r.fileId !== command.fileId); this.saveConfig();
        return {};
      }
      return this.result(room);
    } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
  }
  private migrate(project: SharedProject): SharedProject {
    if (!project || !project.content || !Array.isArray(project.customViews)) throw new Error("Contenido compartido inválido.");
    return { ...project, content: withStableGraphIds(project.content), customViews: project.customViews.map(v => ({ ...v, ...(v.graph ? { graph: withStableGraphIds(v.graph) } : {}) })) };
  }
  private result(room: Room): CollaborationResult {
    if (room.stored.owner) room.status.members = [...new Map(Object.values(room.stored.grants).filter(grant => grant.member).map(grant => [grant.member!, { id: grant.member!, role: grant.role, connected: room.clients.has(grant.member!), revoked: !!grant.revoked }])).values()];
    let snapshot: SharedProject | undefined; try { snapshot = room.document.snapshot(); } catch { /* first connection pending */ }
    return { status: { ...room.status }, snapshot };
  }
  private validateOptions(options: RoomOptions): RoomOptions {
    const relayUrls = options.relayUrls ?? [], externalAddresses = options.externalAddresses ?? [];
    if (relayUrls.length > 4 || externalAddresses.length > 8) throw new Error("Demasiadas direcciones de red.");
    for (const value of relayUrls) {
      const url = new URL(value); if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error("URL de intermediario inválida.");
    }
    for (const value of externalAddresses) if (!/^[\w.:[\]-]+:\d{1,5}$/.test(value)) throw new Error("Dirección pública inválida; usa IP:puerto.");
    return { relayUrls, externalAddresses };
  }
  private parseInvitation(text: string): Invitation {
    if (typeof text !== "string" || text.length > 16_384 || !text.startsWith("processflow://")) throw new Error("Invitación inválida.");
    const invitation = JSON.parse(Buffer.from(text.slice(14), "base64url").toString("utf8")) as Invitation;
    if (invitation.format !== "pf-room/1" || !validId(invitation.projectId) || !/^[\w-]{43}$/.test(invitation.token) || !["editor", "viewer"].includes(invitation.role)) throw new Error("Invitación inválida o incompatible.");
    EndpointTicket.fromString(invitation.host); this.validateOptions({ relayUrls: invitation.relays });
    return invitation;
  }
  private async accept(endpoint: Endpoint) {
    while (!this.closed) {
      try {
        const incoming = await endpoint.acceptNext(); if (!incoming) break;
        if (this.handshakes >= 128) { await incoming.refuse(); continue; }
        this.handshakes++;
        void (async () => {
          let connection: Connection | undefined, pending = true;
          const authenticated = () => { if (pending) { pending = false; this.handshakes--; } };
          try {
            connection = await deadline((await incoming.accept()).connect()); this.incoming.add(connection);
            await this.serve(connection, authenticated);
          } finally { authenticated(); if (connection) { this.incoming.delete(connection); connection.close(BigInt(0), []); } }
        })().catch(() => {});
      } catch { if (this.closed) break; }
    }
  }
  private async serve(connection: Connection, authenticated: () => void) {
    const member = connection.remoteId().toString(); let active: Room | undefined;
    try {
      while (!this.closed) {
        const stream = await deadline(connection.acceptBi(), active ? 60_000 : 10_000);
        const request = await deadline(readFrame<Request>(stream, active ? undefined : 4096));
        const room = [...this.rooms.values()].find(r => !r.disposed && r.stored.owner && r.stored.projectId === request.projectId);
        try {
          if (request.version !== 1 || !room || typeof request.token !== "string" || request.token.length > 100) throw new Error("Acceso no autorizado.");
          if ((!active && (request.stage !== "hello" || request.update)) || (active && active !== room)) throw new Error("Negociación de sala inválida.");
          const tokenHash = hash(request.token), grant = room.stored.grants[tokenHash];
          if (!grant || grant.revoked || !timingSafeEqual(Buffer.from(grant.hash), Buffer.from(tokenHash)) || (grant.member && grant.member !== member)) throw new Error("Invitación inválida, revocada o ya utilizada.");
          if (!room.seats.enter(member)) throw new Error("Sala llena según la capacidad del anfitrión. Tu copia local se conserva.");
          if (!grant.member) { grant.member = member; this.saveConfig(); }
          const oldConnection = room.clients.get(member); if (oldConnection && oldConnection !== connection) oldConnection.close(BigInt(0), []);
          room.clients.set(member, connection);
          authenticated();
          if (!active) {
            void this.receivePresence(connection, room, member, true);
            for (const presence of room.presence.values()) this.sendPresence(connection, presence);
          }
          active = room;
          if (request.update && grant.role !== "editor") throw new Error("El vínculo permite solo lectura.");
          const before = room.revision;
          if (!room.status.saved) throw new Error("El guardado está detenido; exporta la recuperación y reinicia después de corregir el disco.");
          if (request.update) room.document.receive(decode(request.update));
          if (!room.status.saved) throw new Error("El anfitrión no pudo guardar; vuelve a intentar después.");
          room.status.lastSynced = new Date().toISOString(); room.status.state = "online";
          await sendFrame(stream, { ok: true, update: encode(room.document.update(decode(request.vector))), vector: encode(room.document.vector()), capacity: room.status.capacity, peers: room.seats.count } satisfies Response);
          this.emit(room, before !== room.revision);
        } catch (error) {
          await sendFrame(stream, { ok: false, error: error instanceof Error ? error.message : String(error) } satisfies Response); break;
        }
      }
    } finally {
      if (active && active.clients.get(member) === connection) { active.clients.delete(member); active.seats.leave(member); active.presence.delete(member); this.emitPresence(active); this.emit(active); }
    }
  }
  private schedule(room: Room, delay?: number) {
    if (this.closed || room.disposed || room.stored.owner) return;
    if (room.timer) clearTimeout(room.timer);
    room.timer = setTimeout(() => { room.timer = undefined; void this.sync(room).finally(() => this.schedule(room)); }, delay ?? (room.failures ? Math.min(30_000, 1000 * 2 ** Math.min(room.failures, 5)) : 700));
    room.timer.unref();
  }
  private async connect(room: Room): Promise<Connection> {
    const endpoint = await this.endpointReady(), storedAddr = EndpointTicket.fromString(room.stored.invitation!.host).endpointAddr();
    const discovered = await this.discovery?.find(storedAddr.id().toString());
    const addr = discovered ? new EndpointAddr(storedAddr.id(), discovered.relayUrl() ?? storedAddr.relayUrl(), [...new Set([...discovered.directAddresses(), ...storedAddr.directAddresses()])]) : storedAddr;
    // Try local routes first. Internet/relay attempts follow automatically.
    const own = Object.values(networkInterfaces()).flatMap(list => list ?? []).filter(a => a.family === "IPv4").map(a => a.address.split('.').slice(0, 3).join('.'));
    const lan = addr.directAddresses().filter(a => a.startsWith('127.') || own.some(prefix => a.startsWith(`${prefix}.`)));
    if (lan.length) {
      try { return await deadline(endpoint.connect(new EndpointAddr(addr.id(), null, lan), ALPN), 1200); } catch { /* Continue through NAT traversal/relay. */ }
    }
    return deadline(endpoint.connect(addr, ALPN));
  }
  private sync(room: Room): Promise<void> {
    if (room.disposed || this.closed) return Promise.resolve();
    if (room.syncTask) return room.syncTask;
    room.syncTask = this.performSync(room).finally(() => { room.syncTask = undefined; });
    return room.syncTask;
  }
  private async performSync(room: Room) {
    room.syncing = true;
    try {
      if (!room.status.saved) throw new Error("El guardado está detenido. Exporta la recuperación antes de reconectar.");
      if (!room.connection || room.connection.closeReason() !== null) {
        room.status.state = "connecting"; this.emit(room);
        room.connection = await this.connect(room); room.remoteVector = undefined;
        void this.receivePresence(room.connection, room, room.connection.remoteId().toString(), false);
      }
      if (room.disposed || this.closed) { room.connection.close(BigInt(0), []); return; }
      const stream = await deadline(room.connection.openBi());
      const authenticated = room.remoteVector !== undefined;
      const request: Request = { version: 1, stage: authenticated ? "sync" : "hello", projectId: room.stored.projectId, token: room.stored.invitation!.token, vector: encode(authenticated ? room.document.vector() : Uint8Array.of(0)),
        ...(authenticated && room.stored.role === "editor" ? { update: encode(room.document.update(room.remoteVector)) } : {}) };
      await deadline(sendFrame(stream, request)); const response = await deadline(readFrame<Response>(stream));
      if (room.disposed || this.closed) return;
      if (!response.ok) throw new Error(response.error ?? "No se pudo sincronizar.");
      const before = room.revision; room.document.receive(decode(response.update!)); room.remoteVector = decode(response.vector!);
      room.failures = 0; room.status.connected = true; room.status.state = "online"; room.status.error = undefined;
      room.status.lastSynced = new Date().toISOString(); room.status.capacity = response.capacity!; room.status.peers = response.peers!;
      const paths = room.connection.paths();
      room.status.route = paths.some(p => p.isSelected && p.isRelay) ? "relay" : "direct";
      const selected = paths.find(p => p.isSelected && p.isIp)?.remoteAddr ?? "";
      if (room.status.route === "direct" && isLanPath(selected, Object.values(networkInterfaces()).flatMap(l => l ?? []))) room.status.route = "lan";
      this.emit(room, before !== room.revision);
    } catch (error) {
      room.failures++; room.connection?.close(BigInt(1), []); room.connection = undefined;
      room.status.connected = false; room.status.state = "offline"; room.status.route = "none";
      room.status.error = error instanceof Error ? error.message : String(error); this.emit(room);
    } finally { room.syncing = false; }
  }
  async close() {
    this.closed = true; if (this.monitor) clearInterval(this.monitor);
    if (this.presenceMonitor) clearInterval(this.presenceMonitor);
    this.discovery?.close();
    for (const room of this.rooms.values()) { room.disposed = true; if (room.timer) clearTimeout(room.timer); room.connection?.close(BigInt(0), []); }
    for (const connection of this.incoming) connection.close(BigInt(0), []);
    if (this.endpoint) await this.endpoint.close();
    await Promise.allSettled([...this.rooms.values()].map(room => room.syncTask));
    for (const room of this.rooms.values()) { room.journal.close(); room.document.destroy(); }
    this.rooms.clear();
  }
}
