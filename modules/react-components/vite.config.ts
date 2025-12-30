import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
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
    {
      name: "copy-styles",
      closeBundle() {
        // dist/styles 디렉토리 생성 및 globals.css 복사
        const srcPath = path.resolve(__dirname, "src/styles/globals.css");
        const destDir = path.resolve(__dirname, "dist/styles");
        const destPath = path.resolve(destDir, "globals.css");

        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }
        fs.copyFileSync(srcPath, destPath);
      },
    },
  ],
  resolve: {
    dedupe: ["react", "react-dom", "@tanstack/react-router"],
  },
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
