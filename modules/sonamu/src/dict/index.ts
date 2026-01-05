/**
 * Sonamu Built-in Dictionary
 *
 * Usage:
 * ```typescript
 * import { sonamuDictKo, sonamuDictEn } from 'sonamu/dict';
 * ```
 */

export { default as sonamuDictEn } from "./en";
export { default as sonamuDictKo } from "./ko";

// 타입 추출용
import type ko from "./ko";
export type SonamuDictionary = typeof ko;
export type SonamuDictKey = keyof SonamuDictionary;
