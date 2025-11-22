import react from "@vitejs/plugin-react-swc";
import dotenv from "dotenv";
import path from "path";
import { defineConfig } from "vite";

dotenv.config({ path: ".sonamu.env" });

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      src: path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 10281,
    proxy: {
      "/api": `http://${process.env.API_HOST}:${process.env.API_PORT}`,
    },
  },
});
