import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import Icons from "unplugin-icons/vite";
import { defineConfig, type Plugin } from "vite";

const SONAMU_DEV_SERVER = "http://localhost:10280";

/**
 * ui-web 개발 서버(Vite)에서도 Sonamu UI API를 부를 수 있도록,
 * 실행 중인 Sonamu 개발 서버가 index.html에 넣어 주는 접근 토큰을 가져와 같은 자리에 넣습니다.
 */
function sonamuUITokenFromDevServer(): Plugin {
  return {
    name: "sonamu-ui-token-from-dev-server",
    apply: "serve",
    async transformIndexHtml(html) {
      try {
        const served = await (await fetch(`${SONAMU_DEV_SERVER}/sonamu-ui/`)).text();
        const token = /<meta name="sonamu-ui-token" content="([^"]*)"/.exec(served)?.[1];
        return token === undefined ? html : html.replace("{{sonamuUIToken}}", token);
      } catch {
        // Sonamu 개발 서버가 꺼져 있으면 토큰 없이 띄우고, API 요청은 401로 실패합니다.
        return html;
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    sonamuUITokenFromDevServer(),
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
        target: SONAMU_DEV_SERVER,
        changeOrigin: true,
      },
      "/__test__": {
        target: SONAMU_DEV_SERVER,
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
