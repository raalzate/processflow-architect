import type { GraphData, SavedFile } from "../types";
import type { DesignView } from "../views-types";
import type { ArtifactVersion, ArtifactLineage, Artifact } from "../agent-types";
import type { ReferenceDoc } from "../reference-context";
import type { Presence, PresenceInput } from "./presence";
import type { DiscardedFieldEdit } from "./field-conflicts";
import type { Participant } from "./participants";
import type { PendingConnection } from "./document";
import type { Choices, DiagramHistory, HistoryAction, HistoryActor, MergePreview } from "./history";
import type { LeasePolicy, LeaseStateName } from "./lease";

export interface CollaborationWorkspace {
  pendingConnections?: Record<string, PendingConnection[]>;
  history: DiagramHistory;
  snapshots: Record<string, SharedProject>;
  vectors: Record<string, string>;
  actor: HistoryActor;
  pending: number;
  recoveries: { id: string; branchId?: string; error: string; snapshot?: SharedProject }[];
  discardedEdits?: Record<string, DiscardedFieldEdit[]>;
}

export interface SharedProject {
  name: string;
  content: GraphData;
  customViews: DesignView[];
  references: ReferenceDoc[];
  agent: { versions: ArtifactVersion[]; lineages: ArtifactLineage[]; artifacts: Artifact[] };
  analysis: Pick<SavedFile, "driversResult" | "constraintsResult" | "roadmapResult" | "proposalResult">;
}

export type Role = "editor" | "viewer";
export type PeerRoute = "lan" | "direct" | "relay";
export interface Capacity {
  limit: number;
  directGuestLimit?: number;
  relayGuestLimit?: number;
  projectBytes: number;
  mergeMs: number;
  freeMemoryBytes: number;
  networkMeasured: boolean;
  reason: string;
}
export interface CollaborationStatus {
  participants?: Participant[];
  projectId: string;
  fileId: string;
  owner: boolean;
  role: Role;
  connected: boolean;
  state: "local" | "connecting" | "online" | "offline" | "error";
  route: PeerRoute | "none";
  peers: number;
  routeCounts?: Record<PeerRoute, number>;
  capacity: Capacity;
  pendingEdges: number;
  saved: boolean;
  initialized: boolean;
  lastSynced?: string;
  error?: string;
  members?: { id: string; name?: string; role: Role; connected: boolean; revoked: boolean }[];
  discardedEdits?: DiscardedFieldEdit[];
  /** Préstamo de la copia (#756). El anfitrión lo ve siempre `active` y con su política. */
  lease?: { state: LeaseStateName; remainingMs: number; policy: LeasePolicy };
}
/** Por qué desapareció una copia prestada: lo que el aviso le explica al invitado. */
export type PurgeReason = "left" | "revoked" | "expired";
export interface CollaborationPurge {
  fileId: string;
  reason: PurgeReason;
}
export interface RoomOptions {
  relayUrls?: string[];
  externalAddresses?: string[];
}
export type CollaborationCommand =
  | { type: "repair-connection"; fileId: string; branchId: string; viewId: string; edgeId: string; sourceId?: string; targetId?: string }
  | { type: "open"; fileId: string; initial: SharedProject; name?: string }
  | { type: "create"; fileId: string; initial: SharedProject; options: RoomOptions; name?: string }
  | { type: "join"; fileId: string; invitation: string; name?: string }
  | { type: "patch"; fileId: string; before: SharedProject; after: SharedProject; branchId?: string }
  | {
      type: "resolve-field-conflict";
      fileId: string;
      editId: string;
      keep: "current" | "discarded";
      branchId?: string;
    }
  | { type: "history"; fileId: string; action: HistoryAction; name: string; expectedVector?: string }
  | {
      type: "history-preview";
      fileId: string;
      branchId: string;
      commitId: string;
      scopes: string[];
      choices?: Choices;
    }
  | { type: "invite"; fileId: string; role: Role }
  | { type: "retry"; fileId: string }
  | { type: "refresh-link"; fileId: string; invitation: string }
  | { type: "undo" | "redo" | "recover"; fileId: string }
  | { type: "leave"; fileId: string }
  | { type: "policy"; fileId: string; policy: LeasePolicy }
  | { type: "take-purges"; fileId: string }
  | { type: "borrowed"; fileId: string }
  | { type: "ack-purges"; fileId: string; fileIds: string[] }
  | { type: "revoke"; fileId: string; memberId: string };
export interface CollaborationResult {
  workspace?: CollaborationWorkspace;
  preview?: MergePreview;
  status?: CollaborationStatus;
  snapshot?: SharedProject;
  invitation?: string;
  recovery?: string;
  error?: string;
  /** Copias prestadas que el main ya purgó y el renderer todavía debe quitar del catálogo. */
  purges?: CollaborationPurge[];
  /** Copias prestadas cuyo contenido no puede salir de la app (el anfitrión no permite exportar). */
  sealed?: string[];
}
export interface CollaborationEvent extends CollaborationResult {
  fileId: string;
  presence?: Presence[];
}
export type { PresenceInput };
