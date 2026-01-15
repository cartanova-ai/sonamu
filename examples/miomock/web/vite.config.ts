import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
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
    noExternal: command === "build" ? true : undefined, // Production 빌드시에만 모든 의존성 번들에 포함
  },
}));
