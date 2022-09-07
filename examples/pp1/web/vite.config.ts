import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 16001,
    proxy: {
      "/api": "http://0.0.0.0:16000",
    },
  },
});
