/** Optional always-on host using the same layered service as the desktop app. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CollaborationEngine } from "../main/services/collaboration/engine";
import { parseBoardFile } from "../src/lib/board-file";

async function run() {
  const data = process.argv[2];
  if (!data)
    throw new Error(
      "Uso: npx tsx scripts/collaboration-host.ts <directorio-propio> [tablero.json] [relay-https]",
    );
  const engine = new CollaborationEngine(resolve(data));
  await engine.start();
  if (process.argv[3]) {
    const board = parseBoardFile(readFileSync(resolve(process.argv[3]), "utf8"));
    const result = await engine.command({
      type: "create",
      fileId: "headless",
      options: { relayUrls: process.argv[4] ? [process.argv[4]] : [] },
      initial: {
        name: board.name,
        content: board.content,
        customViews: board.vistas.customViews,
        references: board.compartido?.references ?? [],
        agent: board.compartido?.agent ?? { versions: [], lineages: [], artifacts: [] },
        analysis: board.compartido?.analysis ?? {},
      },
    });
    if (result.error) throw new Error(result.error);
    const invite = await engine.command({ type: "invite", fileId: "headless", role: "editor" });
    if (invite.error) throw new Error(invite.error);
    console.log("Invitación privada para un equipo (no publiques este registro):");
    console.log(invite.invitation);
  }
  console.log("Anfitrión listo. Conserva este directorio para mantener identidad, vínculos y cambios.");
  const keepAlive = setInterval(() => {}, 60_000);
  const close = async () => {
    clearInterval(keepAlive);
    await engine.close();
    process.exit(0);
  };
  process.on("SIGINT", () => {
    void close();
  });
  process.on("SIGTERM", () => {
    void close();
  });
}
run().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
