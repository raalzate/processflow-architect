import { parentPort, workerData } from "node:worker_threads";
import type {
  CollaborationCommand,
  CollaborationEvent,
  CollaborationResult,
} from "../../../src/lib/collaboration/types";
import { CollaborationEngine } from "./engine";

export type WorkerRequest =
  | { type: "command"; id: number; command: CollaborationCommand }
  | { type: "presence"; fileId: string; presence: unknown }
  | { type: "close" };

export type WorkerResponse =
  | { type: "event"; event: CollaborationEvent }
  | { type: "result"; id: number; result: CollaborationResult };

const port = parentPort!;
const engine = new CollaborationEngine(workerData.root, event =>
  port.postMessage({ type: "event", event } satisfies WorkerResponse),
);
const ready = engine.start();
void ready.catch(error => console.error("Collaboration initialization:", error));

const commands = new Set<Promise<void>>();
let closing = false;
port.on("message", (request: WorkerRequest) => {
  if (closing) return;
  if (request.type === "presence") {
    engine.presence(request.fileId, request.presence);
  } else if (request.type === "command") {
    const task = ready
      .then(() => engine.command(request.command))
      .catch(error => ({ error: error instanceof Error ? error.message : String(error) }))
      .then(result => port.postMessage({ type: "result", id: request.id, result } satisfies WorkerResponse));
    commands.add(task);
    void task.finally(() => commands.delete(task));
  } else {
    closing = true;
    void (async () => {
      try {
        await ready.catch(() => {});
        await engine.close();
        await Promise.allSettled(commands);
      } finally {
        port.close();
      }
    })().catch(error => console.error("Collaboration shutdown:", error));
  }
});
