import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import Icons from "unplugin-icons/vite";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    dts({
      insertTypesEntry: true,
    }),
    Icons({
      compiler: "jsx",
      jsx: "react",
      autoInstall: true,
    }),
    tailwindcss(),
  ],
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/index.tsx"),
      name: "@sonamu-kit/react-components",
      formats: ["es"],
      fileName: (format) => `react-components.${format}.js`,
    },
    rollupOptions: {
      external: ["react", "react-dom", "@tanstack/react-router"],
    },
  },
});
