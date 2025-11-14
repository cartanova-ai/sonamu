import type { LoaderFileSystem } from "./utility/scope.js";
import * as fs from "node:fs/promises";
import { defaultAsyncFileSystem } from "@loaderkit/resolve/fs";
import { makeResolveAndLoad } from "./esm.js";

const fileSystem: LoaderFileSystem = {
	...defaultAsyncFileSystem,
	readFileString: async path => fs.readFile(path, "utf8"),
};

/** @internal */
export const { load, resolve } = makeResolveAndLoad(fileSystem);
