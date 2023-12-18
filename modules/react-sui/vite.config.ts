import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import dts from "vite-plugin-dts";
import tsConfigPaths from "vite-tsconfig-paths";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    dts({
      insertTypesEntry: true,
    }),
    tsConfigPaths(),
  ],
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/index.tsx"),
      name: "@sonamu-kit/react-sui",
      formats: ["es"],
      fileName: (format) => `react-sui.${format}.js`,
    },
    rollupOptions: {
      external: [
        "react",
        "react-dom",
        "react-router-dom",
        "react-semantic-ui-datepickers",
        "zod",
      ],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          "react-router-dom": "ReactRouterDOM",
        },
      },
    },
  },
});
