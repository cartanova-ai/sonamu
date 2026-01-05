import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import Icons from "unplugin-icons/vite";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter(),
    react(),
    tailwindcss(),
    Icons({
      compiler: "jsx",
      jsx: "react",
      autoInstall: true,
    }),
  ],
  base: process.env.NODE_ENV === "production" ? "/sonamu-ui" : "/",
  server: {
    host: "0.0.0.0",
    port: 65000,
    proxy: {
      "/sonamu-ui/api": {
        target: "http://localhost:10280",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "../dist/ui-web", // sonamu/dist/ui-web으로 빌드
  },
  resolve: {
    alias: {
      // React 19 마이그레이션으로 react-dom-patch 불필요
    },
  },
});
