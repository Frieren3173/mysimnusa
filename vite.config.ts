import path from "node:path";
import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";

const prismaWasmEntry = path.resolve(process.cwd(), "node_modules", "@prisma", "client", "wasm.js");

export default defineConfig({
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
  resolve: {
    alias: [
      { find: /^@prisma\/client$/, replacement: prismaWasmEntry },
      {
        find: /^#real\/app-router-entry$/,
        replacement: path.resolve(process.cwd(), "node_modules", "vinext", "dist", "server", "app-router-entry.js"),
      },
      {
        find: /^vinext\/server\/app-router-entry$/,
        replacement: path.resolve(process.cwd(), "src", "lib", "prisma-scope-entry.ts"),
      },
    ],
  },
});
