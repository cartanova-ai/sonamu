import path from "node:path";
import { fileURLToPath } from "node:url";

import { type StorybookConfig } from "@storybook/react-vite";

const dirname = path.dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-a11y", "@storybook/addon-docs"],
  framework: "@storybook/react-vite",
  async viteFinal(viteConfig) {
    const { mergeConfig } = await import("vite");
    const { default: tailwindcss } = await import("@tailwindcss/vite");
    const Icons = (await import("unplugin-icons/vite")).default;

    return mergeConfig(viteConfig, {
      plugins: [tailwindcss(), Icons({ compiler: "jsx", jsx: "react", autoInstall: false })],
      resolve: {
        alias: {
          "@": path.resolve(dirname, "../src"),
        },
      },
    });
  },
};

export default config;
