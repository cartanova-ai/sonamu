#!/usr/bin/env node
/**
 * Checks that the Korean and English OpenSearch pages match in structure, and that every TypeScript code block is a
 * verbatim run of lines from the example file named by its title (examples/miomock for miomock-walkthrough.mdx).
 * Usage: mise exec -- node modules/opensearch/scripts/check-docs-parity.mjs [--rev=<revision>]; --rev reads examples from git.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const DOCS = join(REPO, "modules", "docs");
const EXAMPLES = join(REPO, "modules", "opensearch", "examples");
const FEATURE = "advanced-features/opensearch";
const LANGUAGES = ["ko", "en"];
const PROVENANCE_LANGUAGES = new Set(["typescript", "ts", "tsx"]);
const PROVENANCE_ROOTS = new Map([["miomock-walkthrough.mdx", join(REPO, "examples", "miomock")]]);
const REVISION = process.argv
  .slice(2)
  .find((argument) => argument.startsWith("--rev="))
  ?.slice("--rev=".length);

function readSource(path) {
  if (REVISION === undefined) return existsSync(path) ? readFileSync(path, "utf8") : undefined;
  try {
    return execFileSync(
      "git",
      ["show", REVISION + ":" + relative(REPO, path).split(sep).join("/")],
      {
        cwd: REPO,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        maxBuffer: 16 * 1024 * 1024,
      },
    );
  } catch {
    return undefined;
  }
}

const problems = [];
const report = (where, message) => problems.push(where + ": " + message);

function parse(text, where) {
  const lines = text.split("\n");
  const page = {
    frontMatter: [],
    headings: [],
    components: [],
    tables: [],
    links: [],
    blocks: [],
  };
  let index = 0;
  if (lines[0] === "---") {
    const end = lines.indexOf("---", 1);
    if (end === -1) {
      report(where, "front matter is not closed");
      return page;
    }
    for (const line of lines.slice(1, end)) {
      const key = /^([A-Za-z0-9_-]+):/.exec(line);
      if (key) page.frontMatter.push(key[1]);
    }
    index = end + 1;
  } else {
    report(where, "front matter is missing");
  }

  let fence = null;
  let table = null;
  for (; index < lines.length; index += 1) {
    const line = lines[index];
    if (fence !== null) {
      const close = /^(\s*)(`{3,}|~{3,})\s*$/.exec(line);
      if (close && close[2][0] === fence.marker[0] && close[2].length >= fence.marker.length) {
        page.blocks.push({ info: fence.info, code: fence.lines.join("\n"), line: fence.line });
        fence = null;
      } else {
        fence.lines.push(line);
      }
      continue;
    }
    const open = /^(\s*)(`{3,}|~{3,})(.*)$/.exec(line);
    if (open) {
      table = null;
      fence = { marker: open[2], info: open[3].trim(), lines: [], line: index + 1 };
      continue;
    }
    const heading = /^(#{1,6})\s/.exec(line);
    if (heading) page.headings.push(heading[1].length);
    for (const match of line.matchAll(/<([A-Z][A-Za-z0-9.]*)/g)) page.components.push(match[1]);
    for (const match of line.matchAll(/(?:href="|\]\()(\/(?:ko|en)\/[^")#\s]*)/g)) {
      page.links.push(match[1].replace(/^\/(ko|en)\//, "/{lang}/"));
    }
    if (/^\s*\|/.test(line)) {
      if (table === null) {
        table = { rows: 0 };
        page.tables.push(table);
      }
      table.rows += 1;
    } else {
      table = null;
    }
  }
  if (fence !== null) report(where, "code block opened at line " + fence.line + " is not closed");
  return page;
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function describe(value) {
  return JSON.stringify(value);
}

function compare(name, ko, en) {
  const where = FEATURE + "/" + name;
  if (!same(ko.frontMatter, en.frontMatter)) {
    report(
      where,
      "front matter keys differ: ko " +
        describe(ko.frontMatter) +
        ", en " +
        describe(en.frontMatter),
    );
  }
  if (!same(ko.headings, en.headings)) {
    report(
      where,
      "heading levels differ: ko " + describe(ko.headings) + ", en " + describe(en.headings),
    );
  }
  if (!same(ko.components, en.components)) {
    report(
      where,
      "MDX component sequence differs: ko " +
        describe(ko.components) +
        ", en " +
        describe(en.components),
    );
  }
  const koRows = ko.tables.map((table) => table.rows);
  const enRows = en.tables.map((table) => table.rows);
  if (!same(koRows, enRows)) {
    report(
      where,
      "table count or rows per table differ: ko " + describe(koRows) + ", en " + describe(enRows),
    );
  }
  if (!same(ko.links, en.links)) {
    report(
      where,
      "internal link targets differ: ko " + describe(ko.links) + ", en " + describe(en.links),
    );
  }
  if (ko.blocks.length !== en.blocks.length) {
    report(
      where,
      "number of code blocks differs: ko " + ko.blocks.length + ", en " + en.blocks.length,
    );
    return;
  }
  ko.blocks.forEach((koBlock, position) => {
    const enBlock = en.blocks[position];
    const label =
      where +
      " code block " +
      (position + 1) +
      " (ko line " +
      koBlock.line +
      ", en line " +
      enBlock.line +
      ")";
    if (koBlock.info !== enBlock.info) {
      report(
        label,
        "info strings differ: ko " + describe(koBlock.info) + ", en " + describe(enBlock.info),
      );
    }
    if (koBlock.code !== enBlock.code) {
      const koLines = koBlock.code.split("\n");
      const enLines = enBlock.code.split("\n");
      const first = koLines.findIndex((line, at) => line !== enLines[at]);
      const at = first === -1 ? Math.min(koLines.length, enLines.length) : first;
      report(
        label,
        "code differs at line " +
          (at + 1) +
          " of the block: ko " +
          describe(koLines[at] ?? "<end>") +
          ", en " +
          describe(enLines[at] ?? "<end>"),
      );
    }
  });
}

function checkProvenance(file, page) {
  const examples = new Map();
  const root = PROVENANCE_ROOTS.get(file.slice(file.lastIndexOf("/") + 1)) ?? EXAMPLES;
  const rootLabel = relative(REPO, root);
  page.blocks.forEach((block, position) => {
    const language = block.info.split(/\s+/)[0] ?? "";
    if (!PROVENANCE_LANGUAGES.has(language)) return;
    const label = file + " code block " + (position + 1) + " (line " + block.line + ")";
    const title = /(?:^|\s)title="([^"]+)"/.exec(block.info);
    if (title === null) {
      report(
        label,
        "has no provenance marker; write ```" +
          language +
          ' title="<path under ' +
          rootLabel +
          '>"',
      );
      return;
    }
    const path = resolve(root, title[1]);
    const source = path.startsWith(root + sep) ? readSource(path) : undefined;
    if (source === undefined) {
      report(
        label,
        "provenance file does not exist under " +
          rootLabel +
          (REVISION === undefined ? "" : " at " + REVISION) +
          ": " +
          title[1],
      );
      return;
    }
    if (!examples.has(path)) examples.set(path, "\n" + source.replace(/\r\n/g, "\n") + "\n");
    if (block.code.trim() === "") {
      report(label, "code block is empty");
      return;
    }
    if (!examples.get(path).includes("\n" + block.code + "\n")) {
      const missing = block.code
        .split("\n")
        .find((line) => !examples.get(path).includes("\n" + line + "\n"));
      report(
        label,
        "code is not a run of consecutive lines of " +
          relative(REPO, path) +
          (missing === undefined
            ? " (line order or lines in between differ)"
            : "; line not in the file: " + describe(missing)),
      );
    }
  });
}

function navigationPages() {
  const serialized = JSON.stringify(JSON.parse(readFileSync(join(DOCS, "docs.json"), "utf8")));
  const pages = Object.fromEntries(LANGUAGES.map((language) => [language, []]));
  const pattern = new RegExp('"(' + LANGUAGES.join("|") + ")/" + FEATURE + '/([^"]+)"', "g");
  for (const match of serialized.matchAll(pattern)) pages[match[1]].push(match[2]);
  return pages;
}

function main() {
  const files = {};
  for (const language of LANGUAGES) {
    const directory = join(DOCS, language, FEATURE);
    files[language] = existsSync(directory)
      ? readdirSync(directory)
          .filter((name) => name.endsWith(".mdx"))
          .toSorted()
      : [];
    if (files[language].length === 0) report(language + "/" + FEATURE, "no pages");
  }
  for (const [language, other] of [
    ["ko", "en"],
    ["en", "ko"],
  ]) {
    for (const name of files[language]) {
      if (!files[other].includes(name))
        report(
          language + "/" + FEATURE + "/" + name,
          "the " + other + " tree has no file with this name",
        );
    }
  }

  const parsed = {};
  for (const language of LANGUAGES) {
    for (const name of files[language]) {
      const file = language + "/" + FEATURE + "/" + name;
      parsed[file] = parse(readFileSync(join(DOCS, file), "utf8"), file);
      checkProvenance(file, parsed[file]);
    }
  }
  for (const name of files.ko.filter((candidate) => files.en.includes(candidate))) {
    compare(name, parsed["ko/" + FEATURE + "/" + name], parsed["en/" + FEATURE + "/" + name]);
  }

  const navigation = navigationPages();
  if (!same(navigation.ko, navigation.en)) {
    report(
      "docs.json",
      "page lists differ between languages: ko " +
        describe(navigation.ko) +
        ", en " +
        describe(navigation.en),
    );
  }
  for (const language of LANGUAGES) {
    const listed = new Set(navigation[language]);
    for (const name of files[language]) {
      if (!listed.has(name.replace(/\.mdx$/, "")))
        report(
          "docs.json",
          language + "/" + FEATURE + "/" + name.replace(/\.mdx$/, "") + " is not in the navigation",
        );
    }
    for (const page of listed) {
      if (!files[language].includes(page + ".mdx"))
        report("docs.json", language + "/" + FEATURE + "/" + page + " is listed but has no file");
    }
  }

  if (problems.length > 0) {
    console.error("OpenSearch docs parity check failed (" + problems.length + " problems):");
    for (const problem of problems) console.error("- " + problem);
    process.exit(1);
  }
  const blockCount = Object.values(parsed).reduce((sum, page) => sum + page.blocks.length, 0);
  console.log(
    "OpenSearch docs parity check passed" +
      (REVISION === undefined ? "" : " (examples at " + REVISION + ")") +
      ": " +
      files.ko.length +
      " page pairs, " +
      blockCount +
      " code blocks, " +
      navigation.ko.length +
      " pages per language in docs.json",
  );
}

main();
