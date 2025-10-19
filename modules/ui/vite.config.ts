import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 65000,
    proxy: process.env.DEBUG_UI === "true" && {
      "/api": "http://0.0.0.0:60000",
    },
  },
  build: {
    outDir: "build",
  },
});
