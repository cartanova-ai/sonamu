import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// https://astro.build/config
export default defineConfig({
  integrations: [
    starlight({
      title: "Sonamu",
      social: {
        github: "https://github.com/ping-alive/sonamu",
      },
      sidebar: [
        {
          label: "Introduction",
          items: [
            // Each item here is one entry in the navigation menu.
            { label: "소개", link: "/intro" },
            { label: "들어가기 전에", link: "/intro/dependency" },
          ],
        },
        {
          label: "Tutorial",
          items: [
            { label: "시작하기", link: "/tutorial" },
            { label: "엔티티 및 마이그레이션 관리", link: "/tutorial/entity" },
            { label: "스캐폴딩", link: "/tutorial/scaffolding" },
            { label: "API 등록", link: "/tutorial/api" },
            { label: "관계 설정", link: "/tutorial/relation" },
            { label: "프론트엔드", link: "/tutorial/front-end" },
          ],
        },
        {
          label: "Guide",
          items: [
            { label: "인증 및 인가", link: "/guide/auth" },
            { label: "데이터베이스 설정", link: "/guide/db" },
            { label: "엔티티", link: "/guide/entity" },
            { label: "UpsertBuilder", link: "/guide/upsert-builder" },
            { label: "서브셋", link: "/guide/subset" },
            { label: "테스트", link: "/guide/test" },
            { label: "타입스크립트 설정", link: "/guide/tsconfig" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "파일 동기화 작업", link: "/reference/file-sync" },
            { label: "엔티티", link: "/reference/entity" },
            { label: "마이그레이션", link: "/reference/migration" },
            { label: "API 데코레이터", link: "/reference/api-decorator" },
            { label: "스캐폴딩", link: "/reference/scaffolding" },
            { label: "모델", link: "/reference/model" },
            { label: "Fixture", link: "/reference/fixture" },
            { label: "CLI", link: "/reference/cli" },
            { label: "@sonamu-kit", link: "/reference/sonamu-kit" },
            { label: "Error", link: "/reference/error" },
          ],
        },
      ],
      customCss: ["./src/styles/global.css"],
    }),
  ],
});
