import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { makeTestLoader } from "./__fixtures__/loader.js";

await describe("outDir", async () => {
	await test("same level", async () => {
		const { evaluate } = makeTestLoader({
			"package.json": JSON.stringify({ type: "module" }),
			"tsconfig.json": JSON.stringify({
				compilerOptions: {
					outDir: "dist",
					rootDir: "src",
				},
			}),
			"src/main.ts": "globalThis.url = import.meta.url;",
		});
		const result = await evaluate("src/main.ts");
		assert.strictEqual(result.url, "file:///dist/main.js");
	});

	await test("root dist", async () => {
		const { evaluate } = makeTestLoader({
			"package.json": JSON.stringify({ type: "module" }),
			"tsconfig.json": JSON.stringify({
				compilerOptions: {
					outDir: "dist",
					rootDir: ".",
				},
			}),
			"main.ts": "globalThis.url = import.meta.url;",
		});
		const result = await evaluate("main.ts");
		assert.strictEqual(result.url, "file:///dist/main.js");
	});

	await test("no outDir", async () => {
		const { evaluate } = makeTestLoader({
			"package.json": JSON.stringify({ type: "module" }),
			"tsconfig.json": JSON.stringify({
				compilerOptions: {
					rootDir: ".",
				},
			}),
			"main.ts": "globalThis.url = import.meta.url;",
		});
		const result = await evaluate("main.ts");
		assert.strictEqual(result.url, "file:///main.js");
	});

	await test("config dir", async () => {
		const { evaluate } = makeTestLoader({
			"tsconfig.json": JSON.stringify({
				compilerOptions: {
					// eslint-disable-next-line no-template-curly-in-string
					outDir: "${configDir}/dist",
					// eslint-disable-next-line no-template-curly-in-string
					rootDir: "${configDir}",
				},
			}),
			"project/package.json": '{ "type": "module" }',
			"project/tsconfig.json": JSON.stringify({
				extends: "../tsconfig.json",
			}),
			"project/main.ts": "globalThis.url = import.meta.url;",
		});
		const result = await evaluate("project/main.ts");
		assert.strictEqual(result.url, "file:///project/dist/main.js");
	});
});

await describe("transpilation options", async () => {
	await test("verbatimModuleSyntax", async () => {
		const { evaluate } = makeTestLoader({
			"package.json": JSON.stringify({ type: "module" }),
			"tsconfig.json": JSON.stringify({
				compilerOptions: {
					verbatimModuleSyntax: true,
				},
			}),
			"main.ts": 'import {} from "./side-effects.js";',
			"side-effects.ts": "globalThis.ran = true;",
		});
		const result = await evaluate("main.ts");
		assert.ok(result.ran);
	});

	await test("no verbatimModuleSyntax", async () => {
		const { evaluate } = makeTestLoader({
			"package.json": JSON.stringify({ type: "module" }),
			"tsconfig.json": JSON.stringify({}),
			"main.ts": 'import {} from "./side-effects.js";',
			"side-effects.ts": "globalThis.ran = true;",
		});
		const result = await evaluate("main.ts");
		assert.ok(!result.ran);
	});
});

await test("allowJs enabled", async () => {
	const { evaluate } = makeTestLoader({
		"package.json": JSON.stringify({ type: "module" }),
		"tsconfig.json": JSON.stringify({
			compilerOptions: {
				allowJs: true,
				outDir: "dist",
				rootDir: "src",
			},
		}),
		"src/main.ts": 'import "./plain.js"; import "./typed.js";',
		"src/plain.js": "globalThis.plain = import.meta.url;",
		"src/typed.ts": "globalThis.typed = import.meta.url;",
	});
	const result = await evaluate("src/main.ts");
	assert.strictEqual(result.plain, "file:///dist/plain.js");
	assert.strictEqual(result.typed, "file:///dist/typed.js");
	// await assert.rejects(() => resolve("./typed.ts", "file:///dist/main.js"));
});

await test("commonjs", async () => {
	const { evaluate } = makeTestLoader({
		"package.json": JSON.stringify({ type: "module" }),
		"tsconfig.json": JSON.stringify({
			compilerOptions: {
				outDir: "dist",
				rootDir: ".",
			},
		}),
		"main.ts": 'import "mod";',
		"node_modules/mod/main.js": "globalThis.url = import.meta.url;",
		"node_modules/mod/package.json": JSON.stringify({ type: "module", exports: "./main.js" }),
	});
	// Not implemented in tests
	const result = await evaluate("main.ts");
	assert.strictEqual(result.url, "file:///node_modules/mod/main.js");
});

await test("boundaries", async () => {
	const { evaluate } = makeTestLoader({
		"package.json": JSON.stringify({ type: "module" }),
		"tsconfig.json": JSON.stringify({
			compilerOptions: {
				// Must be true, otherwise the test will pass even without the extra package.json
				allowJs: true,
				outDir: "dist",
				rootDir: "src",
			},
		}),
		"src/main.ts": "import '../module/test.js';",
		"module/package.json": '{ "type": "module" }',
		// The point here is that `module/package.json` prevents finding the root `tsconfig.json`.
		// Therefore this is a configuration-free .ts file.
		"module/test.ts": "globalThis.url = import.meta.url;",
	});
	const result = await evaluate("src/main.ts");
	assert.strictEqual(result.url, "file:///module/test.js");
});

await test("directory import", async () => {
	const { evaluate } = makeTestLoader({
		"package.json": JSON.stringify({ type: "module" }),
		"tsconfig.json": JSON.stringify({
			compilerOptions: {
				rootDir: ".",
			},
		}),
		"dir/index.ts": "globalThis.url = import.meta.url",
		"main.ts": "import './dir';",
	});
	const result = await evaluate("main.ts");
	assert.strictEqual(result.url, "file:///dir/index.js");
});

await test("do not resolve .ts file with outDir set", async () => {
	const { evaluate } = makeTestLoader({
		"package.json": JSON.stringify({ type: "module" }),
		"tsconfig.json": JSON.stringify({
			compilerOptions: {
				rootDir: ".",
				outDir: ".",
			},
		}),
		"dep.ts": "export {};",
		"main.ts": "import './dep.ts';",
	});
	await assert.rejects(() => evaluate("main.ts"));
});

await test("fully resolved typescript specifier", async () => {
	const { evaluate } = makeTestLoader({
		"package.json": JSON.stringify({ type: "module" }),
		"tsconfig.json": JSON.stringify({
			compilerOptions: {
				rootDir: ".",
				outDir: "dist",
			},
		}),
		"dep.ts": "let foo: string; globalThis.url = import.meta.url",
		"main.ts": "import 'file:///dist/dep.js';",
	});
	const result = await evaluate("main.ts");
	assert.strictEqual(result.url, "file:///dist/dep.js");
});

await test(".tsx directory import", async () => {
	const { evaluate } = makeTestLoader({
		"package.json": JSON.stringify({ type: "module" }),
		"tsconfig.json": JSON.stringify({
			compilerOptions: {
				rootDir: ".",
			},
		}),
		"component/index.tsx": "import '.'; globalThis.url = import.meta.url;",
		"main.ts": "import './component';",
	});
	const result = await evaluate("main.ts");
	assert.strictEqual(result.url, "file:///component/index.jsx");
});

await test("dual package release from cjs vs mjs", async () => {
	const { resolve } = makeTestLoader({
		"node_modules/mod/package.json": JSON.stringify({
			name: "mod",
			exports: {
				".": {
					import: "./dist/main.mjs",
					require: "./dist/main.js",
				},
			},
		}),
		"node_modules/mod/dist/main.mjs": "",
		"node_modules/mod/dist/main.js": "",
	});
	const result1 = await resolve("mod", "file:///main.js");
	assert.strictEqual(result1.url, "file:///node_modules/mod/dist/main.js");
	assert.strictEqual(result1.format, "commonjs");

	const result2 = await resolve("mod", "file:///main.mjs");
	assert.strictEqual(result2.url, "file:///node_modules/mod/dist/main.mjs");
	assert.strictEqual(result2.format, "module");
});

await test("type-only imports w/ rootDirs", async () => {
	const { evaluate } = makeTestLoader({
		"package.json": JSON.stringify({ type: "module" }),
		"tsconfig.json": JSON.stringify({
			compilerOptions: {
				rootDirs: [
					"src",
					"types",
				],
			},
		}),
		"src/main.ts":
			`import type { Type } from './types.ts';
			const value: Type = "hello world";
			globalThis.value = value;`,
		"types/types.ts": "export type Type = unknown;",
	});
	const result = await evaluate("src/main.ts");
	assert.strictEqual(result.value, "hello world");
});
