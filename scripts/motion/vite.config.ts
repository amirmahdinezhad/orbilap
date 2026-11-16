import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { fixtureAliases } from "./aliases.ts";

// Separate production frontend: never included in the normal app build.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react(), tailwindcss()],
  resolve: { alias: fixtureAliases },
  build: { outDir: "/tmp/orbilap-motion/dist", emptyOutDir: true },
});
