import type { GraphData, SavedFile } from "../types";
import type { DesignView } from "../views-types";
import type { ArtifactVersion, ArtifactLineage, Artifact } from "../agent-types";
import type { ReferenceDoc } from "../reference-context";
import type { Presence, PresenceInput } from "./presence";

export interface SharedProject {
  name: string;
  content: GraphData;
  customViews: DesignView[];
  references: ReferenceDoc[];
  agent: { versions: ArtifactVersion[]; lineages: ArtifactLineage[]; artifacts: Artifact[] };
  analysis: Pick<SavedFile, "driversResult" | "constraintsResult" | "roadmapResult" | "proposalResult">;
}

export type Role = "editor" | "viewer";
export interface Capacity {
  limit: number;
  projectBytes: number;
  mergeMs: number;
  freeMemoryBytes: number;
  networkMeasured: boolean;
  reason: string;
}
export interface CollaborationStatus {
  projectId: string;
  fileId: string;
  owner: boolean;
  role: Role;
  connected: boolean;
  state: "local" | "connecting" | "online" | "offline" | "error";
  route: "lan" | "direct" | "relay" | "none";
  peers: number;
  capacity: Capacity;
  pendingEdges: number;
  saved: boolean;
  initialized: boolean;
  lastSynced?: string;
  error?: string;
  members?: { id: string; role: Role; connected: boolean; revoked: boolean }[];
}
export interface RoomOptions { relayUrls?: string[]; externalAddresses?: string[] }
export type CollaborationCommand =
  | { type: "open"; fileId: string; initial: SharedProject }
  | { type: "create"; fileId: string; initial: SharedProject; options: RoomOptions }
  | { type: "join"; fileId: string; invitation: string }
  | { type: "patch"; fileId: string; before: SharedProject; after: SharedProject }
  | { type: "invite"; fileId: string; role: Role }
  | { type: "retry"; fileId: string }
  | { type: "refresh-link"; fileId: string; invitation: string }
  | { type: "undo" | "redo" | "recover"; fileId: string }
  | { type: "leave"; fileId: string }
  | { type: "revoke"; fileId: string; memberId: string };
export interface CollaborationResult {
  status?: CollaborationStatus;
  snapshot?: SharedProject;
  invitation?: string;
  recovery?: string;
  error?: string;
}
export interface CollaborationEvent extends CollaborationResult { fileId: string; presence?: Presence[] }
export type { PresenceInput };
