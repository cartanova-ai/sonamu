import path from "path";
import fs from "fs";
import { AbsolutePath } from "./path-utils";

export async function findAppRootPath(): Promise<AbsolutePath> {
  const apiRootPath = findApiRootPath();
  return apiRootPath
    .split(path.sep)
    .slice(0, -1)
    .join(path.sep) as AbsolutePath;
}

export function findApiRootPath(): AbsolutePath {
  // NOTE: for support npm / yarn workspaces
  const workspacePath = process.env["INIT_CWD"];
  if (workspacePath && workspacePath.length !== 0) {
    return workspacePath as AbsolutePath;
  }

  const basePath = import.meta.filename;
  let dir = path.dirname(basePath);
  if (dir.includes("/.yarn/")) {
    dir = dir.split("/.yarn/")[0];
  }
  do {
    if (fs.existsSync(path.join(dir, "/package.json"))) {
      return dir.split(path.sep).join(path.sep) as AbsolutePath;
    }
    dir = dir.split(path.sep).slice(0, -1).join(path.sep);
  } while (dir.split(path.sep).length > 1);
  throw new Error("Cannot find AppRoot using Sonamu -2");
}

export function nonNullable<T>(value: T): value is NonNullable<T> {
  return value !== null && value !== undefined;
}

export function exhaustive(_param: never) {
  throw new Error(`exhaustive`);
}

export function formatInTimeZone(
  date: Date,
  timezone: string,
  format: string
): string {
  // 간단한 타임존 오프셋 반영 및 포매팅 (date-fns 미사용)
  const targetDate = new Date(date); // 입력값 그대로 UTC Date로 간주

  // 타임존 파싱: 예시("Asia/Seoul")는 지원X, 오프셋("+09:00" 등)만 지원
  // timezone이 "+09:00" 같은 형태를 기대 (유닉스 TZ는 지원하지 않음)
  let offsetMinutes = 0;
  const offsetMatch = /^([+-])(\d{2}):(\d{2})$/.exec(timezone);
  if (offsetMatch) {
    const [, sign, h, m] = offsetMatch;
    offsetMinutes = parseInt(h, 10) * 60 + parseInt(m, 10);
    if (sign === "-") offsetMinutes = -offsetMinutes;
  }
  // 오프셋 적용
  const localDate = new Date(targetDate.getTime() + offsetMinutes * 60000);

  // format 기본값: "yyyy-MM-dd'T'HH:mm:ssXXX" (ISO8601 + 타임존)
  // 간단 구현 (년-월-일T시:분:초+오프셋)
  function pad(n: number, l = 2) {
    return n.toString().padStart(l, "0");
  }
  const year = localDate.getFullYear();
  const month = pad(localDate.getMonth() + 1);
  const day = pad(localDate.getDate());
  const hour = pad(localDate.getHours());
  const minute = pad(localDate.getMinutes());
  const second = pad(localDate.getSeconds());

  // XXX 포매터 지원. 실제 포맷문자 처리는 심플하게 일부만
  let formatted = format
    .replace(/yyyy/g, year.toString())
    .replace(/MM/g, month)
    .replace(/dd/g, day)
    .replace(/HH/g, hour)
    .replace(/mm/g, minute)
    .replace(/ss/g, second);

  // XXX: "+09:00" 등 오프셋 대체
  formatted = formatted.replace(/XXX/g, timezone);

  return formatted;
}
