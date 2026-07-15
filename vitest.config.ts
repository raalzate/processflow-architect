import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "build", "dist", "out", ".next"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "ai/context-budget.ts"],
    },
  },
});
