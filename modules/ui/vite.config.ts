import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 65000,
    proxy:
      process.env.DEBUG_UI === "true"
        ? {
            "/api": "http://0.0.0.0:60000",
          }
        : undefined,
  },
  build: {
    outDir: "build",
  },
});
