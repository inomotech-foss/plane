import path from "node:path";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths({ projects: [path.resolve(__dirname, "tsconfig.json")] })],
  resolve: {
    alias: {
      // Next.js compatibility shims used within web (mirrors vite.config.ts)
      "next/link": path.resolve(__dirname, "app/compat/next/link.tsx"),
      "next/navigation": path.resolve(__dirname, "app/compat/next/navigation.ts"),
      "next/script": path.resolve(__dirname, "app/compat/next/script.tsx"),
    },
    dedupe: ["react", "react-dom"],
  },
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["core/**/*.test.ts", "core/**/*.test.tsx"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
