import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Use the shared package's TypeScript SOURCE directly. Vite compiles it as
      // ESM (the browser can't run the CommonJS build in packages/shared/dist),
      // and edits to shared are picked up instantly with no rebuild.
      "@auth/shared": fileURLToPath(new URL("../shared/src/index.ts", import.meta.url)),
    },
  },
  server: { port: 5173 },
});
