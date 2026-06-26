import { resolve } from "node:path";
import { defineConfig } from "vite";

const root = __dirname;

export default defineConfig({
  root,
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    manifest: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        stage: resolve(root, "client/app/entries/stage.ts"),
        controller: resolve(root, "client/app/entries/controller.ts"),
        tools: resolve(root, "client/app/entries/tools.tsx"),
        flowTool: resolve(root, "client/app/entries/flow-tool.tsx"),
        layoutTool: resolve(root, "client/app/entries/layout-tool.tsx"),
        artTool: resolve(root, "client/app/entries/art-tool.tsx"),
        constantsTool: resolve(root, "client/app/entries/constants-tool.tsx"),
        hostAudioTool: resolve(root, "client/app/entries/host-audio-tool.tsx")
      }
    }
  }
});
