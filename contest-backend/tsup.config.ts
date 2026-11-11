import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["cjs"],
  outExtension: () => ({ js: ".cjs" }),
  platform: "node",
  target: "node22",
  outDir: "dist",
  splitting: false,
  sourcemap: false,
  clean: true,
  dts: false,
  shims: true,
  // Bundle workspace and npm dependencies so production can start this file
  // without a separate contest-backend node_modules install.
  noExternal: [/.*/],
});
