import type { GraphData, SavedFile } from "../types";
import type { DesignView } from "../views-types";
import type { ArtifactVersion, ArtifactLineage, Artifact } from "../agent-types";
import type { ReferenceDoc } from "../reference-context";
import type { Presence, PresenceInput } from "./presence";
import type { Choices, DiagramHistory, HistoryAction, HistoryActor, MergePreview } from "./history";

export interface CollaborationWorkspace {
  history: DiagramHistory;
  snapshots: Record<string, SharedProject>;
  vectors: Record<string, string>;
  actor: HistoryActor;
  pending: number;
  recoveries: { id: string; branchId?: string; error: string; snapshot?: SharedProject }[];
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
  members?: { id: string; name?: string; role: Role; connected: boolean; revoked: boolean }[];
}
export interface RoomOptions {
  relayUrls?: string[];
  externalAddresses?: string[];
}
export type CollaborationCommand =
  | { type: "open"; fileId: string; initial: SharedProject; name?: string }
  | { type: "create"; fileId: string; initial: SharedProject; options: RoomOptions; name?: string }
  | { type: "join"; fileId: string; invitation: string; name?: string }
  | { type: "patch"; fileId: string; before: SharedProject; after: SharedProject; branchId?: string }
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
  | { type: "revoke"; fileId: string; memberId: string };
export interface CollaborationResult {
  workspace?: CollaborationWorkspace;
  preview?: MergePreview;
  status?: CollaborationStatus;
  snapshot?: SharedProject;
  invitation?: string;
  recovery?: string;
  error?: string;
}
export interface CollaborationEvent extends CollaborationResult {
  fileId: string;
  presence?: Presence[];
}
export type { PresenceInput };
