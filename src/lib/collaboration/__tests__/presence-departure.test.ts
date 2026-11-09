import { expect, it } from "vitest";
import { sanitizePresence } from "../presence";
it("el cierre de una ventana retira solo su sesión autenticada", () => {
  const presence = sanitizePresence({ name: "Ana", sessionId: "window", viewId: "design", branchId: "shared", selectedIds: [], pointer: null, leaving: true, id: "someone-else" }, "authenticated", 1);
  expect(presence?.leaving).toBe(true);
  expect(presence?.id).toBe("authenticated");
});
