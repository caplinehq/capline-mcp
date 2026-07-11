import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node18",
  clean: true,
  // MCP servers run over stdio as an executable.
  banner: { js: "#!/usr/bin/env node" },
});
