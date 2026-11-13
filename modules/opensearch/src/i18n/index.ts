import { z } from "zod";

import { SearchConfigurationError } from "../errors";
import { searchMessagesEn } from "./en";
import { searchMessagesKo } from "./ko";

export type SearchMessageParamValue = string | number | boolean | null;

type EnglishCatalog = typeof searchMessagesEn;
export type SearchMessageKey = keyof EnglishCatalog;
export type SearchMessageParams<K extends SearchMessageKey> = EnglishCatalog[K] extends (
  params: infer Params,
) => string
  ? Params
  : undefined;

export type SearchMessageCatalog = {
  readonly [K in SearchMessageKey]: SearchMessageParams<K> extends undefined
    ? string
    : (params: SearchMessageParams<K>) => string;
};
export type PartialSearchMessageCatalog = Partial<SearchMessageCatalog>;

export type SearchMessage = {
  [K in SearchMessageKey]: SearchMessageParams<K> extends undefined
    ? { key: K; params?: undefined }
    : { key: K; params: SearchMessageParams<K> };
}[SearchMessageKey];

export const DEFAULT_SEARCH_LOCALE = "en";

type RenderParams = Readonly<Record<string, SearchMessageParamValue>>;
type RenderableEntry = string | ((params: RenderParams) => string);
type RenderableCatalog = Partial<Record<SearchMessageKey, RenderableEntry>>;

function renderable(catalog: PartialSearchMessageCatalog): RenderableCatalog {
  // SAFETY: an entry function is only called with the parameters of a SearchMessage with the same key.
  return catalog as RenderableCatalog;
}

const builtInCatalogs: ReadonlyMap<string, RenderableCatalog> = new Map([
  ["en", renderable(searchMessagesEn)],
  ["ko", renderable(searchMessagesKo)],
]);
const registeredCatalogs = new Map<string, RenderableCatalog>();
let currentLocale: string = DEFAULT_SEARCH_LOCALE;
// Set by setSearchLocale; the Sonamu default locale never overrides it.
let localeSetExplicitly = false;

const localeSchema = z.string().regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{1,8})*$/);
const MAX_ECHOED_LOCALE_LENGTH = 35;
const messageFunctionSchema = z.instanceof(Function);
const messageEntrySchema = z.union([z.string(), messageFunctionSchema]);
const partialCatalogSchema = z.record(
  z.string().refine((key) => Object.hasOwn(searchMessagesEn, key), {
    params: { reason: "unknown_message_key" },
  }),
  messageEntrySchema,
);
const renderedSchema = z.string();

function parseLocale(locale: string): string {
  const parsed = localeSchema.safeParse(locale);
  if (!parsed.success) {
    throw new SearchConfigurationError({
      key: "i18n.invalidLocale",
      params: { locale: String(locale).slice(0, MAX_ECHOED_LOCALE_LENGTH) },
    });
  }
  return parsed.data;
}

function candidateLocales(locale: string): string[] {
  const normalized = locale.toLowerCase();
  const language = normalized.split("-")[0] ?? normalized;
  const candidates = language === normalized ? [normalized] : [normalized, language];
  return candidates.includes(DEFAULT_SEARCH_LOCALE)
    ? candidates
    : [...candidates, DEFAULT_SEARCH_LOCALE];
}

function isRenderFunction(entry: RenderableEntry): entry is Exclude<RenderableEntry, string> {
  return messageFunctionSchema.safeParse(entry).success;
}

function renderEntry(entry: RenderableEntry, params: RenderParams | undefined): string | undefined {
  if (!isRenderFunction(entry)) return entry;
  // A registered function that throws or returns a non-string falls through, so building an error never fails.
  try {
    const rendered = renderedSchema.safeParse(entry(params ?? {}));
    return rendered.success ? rendered.data : undefined;
  } catch {
    return undefined;
  }
}

/** Sets the process-wide message locale; use SearchError.localize(locale) for a per-request language. */
export function setSearchLocale(locale: string): void {
  currentLocale = parseLocale(locale);
  localeSetExplicitly = true;
}

export function getSearchLocale(): string {
  return currentLocale;
}

export function isSearchLocaleExplicit(): boolean {
  return localeSetExplicitly;
}

export function adoptDefaultSearchLocale(locale: string): boolean {
  if (!localeSchema.safeParse(locale).success) return false;
  const resolvable = candidateLocales(locale)
    .filter(
      (candidate) =>
        candidate !== DEFAULT_SEARCH_LOCALE ||
        locale.toLowerCase().split("-")[0] === DEFAULT_SEARCH_LOCALE,
    )
    .some((candidate) => registeredCatalogs.has(candidate) || builtInCatalogs.has(candidate));
  if (!resolvable) return false;
  currentLocale = locale;
  return true;
}

/** Registers messages for a locale; missing keys fall back to the language's built-in catalogue, then English. */
export function registerSearchMessages(
  locale: string,
  messages: PartialSearchMessageCatalog,
): void {
  const normalized = parseLocale(locale).toLowerCase();
  const parsed = partialCatalogSchema.safeParse(messages);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const key = String(issue?.path[0] ?? "").slice(0, MAX_ECHOED_LOCALE_LENGTH * 2);
    throw new SearchConfigurationError(
      issue === undefined || issue.path.length === 0
        ? { key: "error.configuration" }
        : issue.code === "invalid_key"
          ? { key: "i18n.unknownMessageKey", params: { key } }
          : { key: "i18n.invalidMessage", params: { key } },
    );
  }
  // SAFETY: keys are validated against en.ts and values as strings or functions.
  const catalog = parsed.data as RenderableCatalog;
  registeredCatalogs.set(normalized, { ...registeredCatalogs.get(normalized), ...catalog });
}

/** Renders a message; a malformed locale renders English instead of throwing, since errors are built with this. */
export function formatSearchMessage(
  message: SearchMessage,
  locale: string = currentLocale,
): string {
  const candidates = localeSchema.safeParse(locale).success
    ? candidateLocales(locale)
    : [DEFAULT_SEARCH_LOCALE];
  for (const candidate of candidates) {
    for (const catalog of [registeredCatalogs.get(candidate), builtInCatalogs.get(candidate)]) {
      const entry = catalog?.[message.key];
      if (entry === undefined) continue;
      const rendered = renderEntry(entry, message.params);
      if (rendered !== undefined) return rendered;
    }
  }
  return message.key;
}
