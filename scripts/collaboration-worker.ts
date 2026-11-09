import { CollaborationEngine } from "../main/services/collaboration/engine";
import type { CollaborationCommand } from "../src/lib/collaboration/types";
import type { PresenceInput } from "../src/lib/collaboration/presence";
import { Journal } from "../main/services/collaboration/journal";

let failWrites = false;
const engine = new CollaborationEngine(process.argv[2], event => process.send?.({ event }), {
  publicNetwork: false,
  journal: file => {
    const journal = new Journal(file),
      append = journal.append.bind(journal);
    journal.append = update => {
      if (failWrites) throw new Error("Fallo de disco simulado");
      append(update);
    };
    return journal;
  },
});
process.on(
  "message",
  async (message: {
    id: number;
    command:
      | CollaborationCommand
      | { type: "shutdown" }
      | { type: "disk-fault"; enabled: boolean }
      | { type: "publish-presence"; fileId: string; presence: PresenceInput };
  }) => {
    if (message.command.type === "shutdown") {
      await engine.close();
      process.exit(0);
    }
    if (message.command.type === "disk-fault") {
      failWrites = message.command.enabled;
      process.send?.({ id: message.id, result: {} });
      return;
    }
    if (message.command.type === "publish-presence") {
      engine.presence(message.command.fileId, message.command.presence);
      process.send?.({ id: message.id, result: {} });
      return;
    }
    const result = await engine.command(message.command);
    process.send?.({ id: message.id, result });
  },
);
engine
  .start()
  .then(() => process.send?.({ ready: true }))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
