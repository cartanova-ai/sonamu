#!/usr/bin/env node
/**
 * 20MB 초과 mp4 → S3 업로드 + mdx 경로 치환 + 로컬 파일 이동
 * - autoPlay 제거, preload="metadata" 추가 (대용량 영상 최적화)
 * Usage: pnpm upload-videos [--dry-run]
 */

import { readdir, readFile, writeFile, stat, rename, mkdir } from "fs/promises";
import { spawnSync } from "node:child_process";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = join(currentDir, "..");
const IMAGES_DIR = join(DOCS_DIR, "images");
const ARCHIVE_DIR = join(IMAGES_DIR, "at-s3-bucket");
const BUCKET = "sonamu-docs";
const CDN_BASE = "https://cf.cartanova.ai/sonamu-docs";
const SIZE_LIMIT = 20 * 1000 * 1000; // 20MB (10진수)

const isDryRun = process.argv.includes("--dry-run");

async function ensureArchiveDir() {
  try {
    await mkdir(ARCHIVE_DIR, { recursive: true });
  } catch {}
}

async function findMdxFiles(dir) {
  const files = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (
      entry.isDirectory() &&
      !entry.name.startsWith(".") &&
      entry.name !== "node_modules" &&
      entry.name !== "scripts"
    ) {
      files.push(...(await findMdxFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith(".mdx")) {
      files.push(fullPath);
    }
  }
  return files;
}

async function getLargeVideos() {
  const files = await readdir(IMAGES_DIR);
  const largeVideos = [];

  for (const file of files) {
    if (!file.endsWith(".mp4")) continue;

    const filePath = join(IMAGES_DIR, file);
    const stats = await stat(filePath);

    if (stats.size > SIZE_LIMIT) {
      largeVideos.push({
        name: file,
        path: filePath,
        size: stats.size,
        sizeMB: (stats.size / 1000000).toFixed(2),
      });
    }
  }

  return largeVideos;
}

async function uploadToS3(filePath, filename) {
  if (isDryRun) {
    console.log(`  [DRY-RUN] aws s3 cp "${filePath}" "s3://${BUCKET}/sonamu-docs/${filename}"`);
    return true;
  }

  try {
    const result = spawnSync(
      "aws",
      [
        "s3",
        "cp",
        filePath,
        `s3://${BUCKET}/sonamu-docs/${filename}`,
        "--content-type",
        "video/mp4",
      ],
      { stdio: "inherit" },
    );
    if (result.status !== 0) {
      throw new Error(`aws s3 cp exited with status ${result.status ?? "unknown"}`);
    }
    return true;
  } catch (error) {
    console.error(`  ❌ 업로드 실패: ${error.message}`);
    return false;
  }
}

async function moveToArchive(filePath, filename) {
  const archivePath = join(ARCHIVE_DIR, filename);

  if (isDryRun) {
    console.log(`  [DRY-RUN] 이동: ${filename} → at-s3-bucket/`);
    return true;
  }

  try {
    await rename(filePath, archivePath);
    console.log(`  📁 이동: ${filename} → at-s3-bucket/`);
    return true;
  } catch (error) {
    console.error(`  ❌ 이동 실패: ${error.message}`);
    return false;
  }
}

/**
 * 20MB 초과 영상의 video 태그에서 autoPlay 제거 + preload="metadata" 추가
 */
function optimizeVideoTag(content, cdnUrl) {
  // video 태그에서 해당 CDN URL을 src로 가진 것 찾기
  // 멀티라인 video 태그도 처리
  const videoRegex = /<video[\s\S]*?>/g;

  return content.replace(videoRegex, (videoTag) => {
    // 이 video 태그가 해당 CDN URL을 포함하는지 확인
    if (!videoTag.includes(cdnUrl)) {
      return videoTag;
    }

    let updated = videoTag;

    // autoPlay 제거 (대소문자 무관)
    updated = updated.replace(/\s+autoPlay/gi, "");
    updated = updated.replace(/autoPlay\s+/gi, "");
    updated = updated.replace(/autoPlay/gi, "");

    // preload 속성 처리
    if (updated.includes("preload=")) {
      // 기존 preload 값을 metadata로 변경
      updated = updated.replace(/preload="[^"]*"/i, 'preload="metadata"');
    } else {
      // preload 속성이 없으면 추가
      updated = updated.replace(/<video\s+/, '<video\n    preload="metadata"\n    ');
    }

    return updated;
  });
}

async function replaceInMdxFiles(filename) {
  const cdnUrl = `${CDN_BASE}/${filename}`;
  const mdxFiles = await findMdxFiles(DOCS_DIR);
  const localPatterns = [
    `/images/${filename}`,
    `./images/${filename}`,
    `../images/${filename}`,
    `images/${filename}`,
  ];

  let replacedCount = 0;

  for (const mdxPath of mdxFiles) {
    let content = await readFile(mdxPath, "utf-8");
    let modified = false;

    // 경로 치환
    for (const pattern of localPatterns) {
      if (content.includes(pattern)) {
        content = content.split(pattern).join(cdnUrl);
        modified = true;
      }
    }

    // 20MB 초과 영상: autoPlay 제거 + preload="metadata" 추가
    if (modified) {
      content = optimizeVideoTag(content, cdnUrl);
    }

    if (modified) {
      if (isDryRun) {
        console.log(`  [DRY-RUN] 치환: ${mdxPath}`);
      } else {
        await writeFile(mdxPath, content, "utf-8");
        console.log(`  ✏️  치환: ${basename(mdxPath)}`);
      }
      replacedCount++;
    }
  }

  return replacedCount;
}

async function main() {
  console.log(isDryRun ? "🔍 [DRY-RUN] 변경 사항 미리보기\n" : "🚀 업로드 시작\n");

  await ensureArchiveDir();

  const largeVideos = await getLargeVideos();

  if (largeVideos.length === 0) {
    console.log("✅ 20MB 초과 mp4 파일 없음");
    return;
  }

  console.log(`📋 20MB 초과 파일 ${largeVideos.length}개 발견:\n`);

  for (const video of largeVideos) {
    console.log(`📤 ${video.name} (${video.sizeMB}MB)`);

    // S3 업로드
    const uploaded = await uploadToS3(video.path, video.name);
    if (!uploaded) continue;

    // mdx 치환 + video 태그 최적화
    const replacedCount = await replaceInMdxFiles(video.name);
    if (replacedCount === 0) {
      console.log(`  ⚠️  mdx에서 참조 없음`);
    }

    // 로컬 파일 이동
    await moveToArchive(video.path, video.name);

    console.log();
  }

  console.log(isDryRun ? "🔍 [DRY-RUN] 완료 - 실제 변경 없음" : "🎉 완료!");
}

main().catch(console.error);
