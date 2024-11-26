const fs = require("fs/promises");

export const ImportToRequirePlugin = {
  name: "import-to-require",
  setup(build) {
    if (build.initialOptions.define.TSUP_FORMAT === '"cjs"') {
      // 빌드 전에 src/database/db.ts 파일을 읽어서 변환
      build.onLoad({ filter: /database\/db.ts/ }, async (args) => {
        console.debug(`reading ${args.path}`);
        let contents = await fs.readFile(args.path, "utf8");

        // 'await import(' 패턴을 찾아 'require('로 변환
        contents = contents.replace(
          /\bawait import\(([^)]+)\)/g,
          (_, modulePath) => {
            return `require(${modulePath})`;
          }
        );

        return {
          contents,
          loader: "ts", // TypeScript를 지원하도록 'ts' 로더 설정
        };
      });
    }
  },
};
