import fs from "fs";
import path from "path";

import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import Icons from "unplugin-icons/vite";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

function isExternalModule(id: string) {
  // 라이브러리 배포물에는 bare import만 남겨 소비자 번들러가 의존성을 올바르게 처리하게 합니다.
  return (
    !id.startsWith(".") &&
    !path.isAbsolute(id) &&
    !id.startsWith("\0") &&
    !id.startsWith("@/") &&
    !id.startsWith("~icons/")
  );
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tanstackRouter({
      routesDirectory: "./demo/routes",
      generatedRouteTree: "./demo/routeTree.gen.ts",
    }),
    dts({
      insertTypesEntry: true,
      entryRoot: "src",
      exclude: ["**/*.stories.tsx", "**/*.stories.ts"],
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
    alias: { "@": path.resolve(__dirname, "./src") },
    dedupe: ["react", "react-dom", "@tanstack/react-router"],
  },
  server: {
    port: 10290,
  },
  build: {
    sourcemap: true,
    lib: {
      entry: {
        index: path.resolve(__dirname, "src/index.tsx"),
        "components/index": path.resolve(__dirname, "src/components/index.ts"),
        "contexts/index": path.resolve(__dirname, "src/contexts/index.ts"),
        "hooks/index": path.resolve(__dirname, "src/hooks/index.ts"),
        "lib/index": path.resolve(__dirname, "src/lib/index.ts"),
        "router/index": path.resolve(__dirname, "src/router/index.ts"),
      },
      formats: ["es"],
    },
    rolldownOptions: {
      external: isExternalModule,
      output: {
        entryFileNames: "[name].js",
        preserveModules: true,
        preserveModulesRoot: "src",
      },
    },
  },
});
