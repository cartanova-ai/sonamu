import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react-swc";
import dotenv from "dotenv";
import path from "path";
import Icons from "unplugin-icons/vite";
import { defineConfig } from "vite";

dotenv.config({ path: ".sonamu.env" });

// https://vitejs.dev/config/
export default defineConfig(({ command, isSsrBuild }) => ({
  clearScreen: false,
  plugins: [
    react(),
    Icons({
      compiler: "jsx",
      jsx: "react",
      autoInstall: true,
    }),
    tailwindcss(),
    tanstackRouter({
      autoCodeSplitting: true,
      generatedRouteTree: "./src/routeTree.gen.ts",
      routeFileIgnorePattern: ".*(generated|test|spec).*",
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    proxy: {
      "/api": `http://${process.env.API_HOST}:${process.env.API_PORT}`,
    },
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    rollupOptions: {
      output: isSsrBuild
        ? {}
        : {
            manualChunks: {
              "vendor-react": ["react", "react-dom"],
              "vendor-tanstack": ["@tanstack/react-query", "@tanstack/react-router"],
            },
          },
    },
  },
  ssr: {
    noExternal: command === "build" ? true : undefined, // Production build includes all dependencies in bundle
  },
}));
