import path from "path";

import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react-swc";
import Icons from "unplugin-icons/vite";
import { defineConfig } from "vite";

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
    tanstackRouter(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rolldownOptions: {
      output: isSsrBuild
        ? {}
        : {
            manualChunks: (id) => {
              if (id.includes("react-dom") || id.includes("react/")) return "vendor-react";
              if (id.includes("@tanstack/react-query") || id.includes("@tanstack/react-router"))
                return "vendor-tanstack";
            },
          },
    },
  },
  ssr: {
    noExternal: command === "build" ? true : undefined, // Production 빌드시에만 모든 의존성 번들에 포함
  },
}));
