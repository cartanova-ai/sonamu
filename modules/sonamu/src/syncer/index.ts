export * from "./syncer";

/**
 * 이 시스템에 등장하는 경로들:
 * - 절대 경로: 호스트의 root에서부터 시작하는 경로. 예시: "/Users/potados/Projects/sonamu/modules/sonamu/src/syncer/syncer.ts"
 * - 상대 경로: 현재 파일의 위치에서부터 시작하는 경로. 예시: "src/syncer/syncer.ts"
 * 
 * 그리고
 * - URL: "file" 스킴을 사용하는 fully resolved 경로. 예시: "file:///Users/potados/Projects/sonamu/modules/sonamu/src/syncer/syncer.ts"
 */