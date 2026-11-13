import { Badge, Button, Card, CardContent, Input } from "@sonamu-kit/react-components/components";
import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { z } from "zod";
import SearchIcon from "~icons/mdi/magnify";

import { authClient } from "@/contexts/sonamu-provider";
import { SD } from "@/i18n/sd.generated";
import {
  PROJECT_SEARCH_HIGHLIGHT_END,
  PROJECT_SEARCH_HIGHLIGHT_START,
  type ProjectIndexedSearchHit,
  type ProjectIndexedSearchParams,
} from "@/services/project/project.types";
import { ProjectService } from "@/services/services.generated";
import { ProjectStatusLabel } from "@/services/sonamu.generated";
import { isSonamuError } from "@/services/sonamu.shared";

// The generated client keeps only the status and message, so failures branch on SEARCH_HTTP_STATUS (api/src/search/errors.ts).

const PAGE_SIZE = 10;

export const Route = createFileRoute("/admin/projects/search")({
  validateSearch: z.object({ q: z.string().optional() }),
  head: () => ({ meta: [{ title: SD("projectSearch.title") }] }),
  component: ProjectSearch,
});

type FailureKind =
  | "signInRequired"
  | "invalidQuery"
  | "notReady"
  | "cursorExpired"
  | "disabled"
  | "unavailable"
  | "unexpected";

type Failure = { kind: FailureKind; detail: string | null };

/** Keep in sync with SEARCH_HTTP_STATUS in api/src/search/errors.ts. */
function failureKindOf(status: number): FailureKind {
  switch (status) {
    case 400:
      return "invalidQuery";
    case 401:
      return "signInRequired";
    case 409:
      return "notReady";
    case 410:
      return "cursorExpired";
    case 501:
      return "disabled";
    case 503:
      return "unavailable";
    default:
      return "unexpected";
  }
}

/** Shows the server message only for 409 and 503, where it is a localized sentence for people. */
function describeFailure(error: Error): Failure {
  if (!isSonamuError(error)) {
    return { kind: "unexpected", detail: null };
  }
  const kind = failureKindOf(error.code);
  return { kind, detail: kind === "notReady" || kind === "unavailable" ? error.message : null };
}

const FIRST_PAGE: string | null = null;

/** Renders text nodes only: highlight fragments are not HTML-escaped. */
function Highlighted({ fragment }: { fragment: string }) {
  const [head, ...rest] = fragment.split(PROJECT_SEARCH_HIGHLIGHT_START);
  return (
    <>
      {head}
      {rest.map((part, index) => {
        const [marked, tail] = part.split(PROJECT_SEARCH_HIGHLIGHT_END);
        return (
          <span key={index}>
            <mark className="bg-yellow-200 rounded-sm px-0.5">{marked}</mark>
            {tail}
          </span>
        );
      })}
    </>
  );
}

function SearchHit({ hit }: { hit: ProjectIndexedSearchHit }) {
  const name = hit.highlights.name[0];
  return (
    <li className="py-3 border-b border-gray-100 last:border-b-0" data-testid="project-search-hit">
      <div className="flex items-center gap-2">
        <Link
          to="/admin/projects/$projectId"
          params={{ projectId: hit.id }}
          className="text-primary hover:underline font-medium"
        >
          {name === undefined ? hit.name : <Highlighted fragment={name} />}
        </Link>
        <Badge variant="secondary">{ProjectStatusLabel[hit.status]}</Badge>
        <span className="text-xs text-muted-foreground">#{hit.id}</span>
      </div>
      {hit.highlights.description.length > 0 ? (
        <p className="mt-1 text-sm text-gray-600">
          {hit.highlights.description.map((fragment, index) => (
            <span key={index}>
              {index > 0 && " … "}
              <Highlighted fragment={fragment} />
            </span>
          ))}
        </p>
      ) : (
        hit.description && (
          <p className="mt-1 text-sm text-gray-600 line-clamp-2">{hit.description}</p>
        )
      )}
    </li>
  );
}

function StatePanel({
  message,
  detail,
  action,
  testId,
}: {
  message: string;
  detail?: string | null;
  action?: { label: string; onClick: () => void };
  testId: string;
}) {
  return (
    <div className="py-10 text-center space-y-2" role="status" data-testid={testId}>
      <p className="text-sm text-gray-700">{message}</p>
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      {action && (
        <Button variant="outline" size="sm" onClick={action.onClick}>
          <span className="text-xs">{action.label}</span>
        </Button>
      )}
    </div>
  );
}

function ProjectSearch() {
  const navigate = useNavigate({ from: Route.fullPath });
  const { q = "" } = Route.useSearch();
  const query = q.trim();
  const session = authClient.useSession();
  const signedIn = Boolean(session.data?.user);
  const [draft, setDraft] = useState(q);
  // Bumped to restart a search from the first page (after an expired cursor, or the same query again).
  const [run, setRun] = useState(0);

  const search = useInfiniteQuery({
    queryKey: ["Project", "searchIndexed", "pages", query, run],
    queryFn: ({ pageParam }) => {
      const params: ProjectIndexedSearchParams = { q: query, size: PAGE_SIZE };
      if (pageParam !== null) {
        params.cursor = pageParam;
      }
      return ProjectService.searchIndexed(params);
    },
    initialPageParam: FIRST_PAGE,
    getNextPageParam: (last) => last.nextCursor,
    enabled: signedIn && query !== "",
    // The user chooses between retry and a new search.
    retry: false,
  });

  const restart = () => setRun((value) => value + 1);
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const next = draft.trim();
    if (next === query) {
      restart();
    }
    void navigate({ search: { q: next === "" ? undefined : next } });
  };

  const hits = search.data?.pages.flatMap((page) => page.rows) ?? [];
  const failure = search.error ? describeFailure(search.error) : null;

  const failurePanel = (kind: FailureKind, detail: string | null) => {
    switch (kind) {
      case "signInRequired":
        return (
          <StatePanel
            testId="project-search-sign-in"
            message={SD("projectSearch.signInRequired")}
            action={{
              label: SD("common.login"),
              onClick: () => void navigate({ to: "/admin/login" }),
            }}
          />
        );
      case "cursorExpired":
        return (
          <StatePanel
            testId="project-search-cursor-expired"
            message={SD("projectSearch.cursorExpired")}
            action={{ label: SD("projectSearch.restart"), onClick: restart }}
          />
        );
      case "unavailable":
        return (
          <StatePanel
            testId="project-search-unavailable"
            message={SD("projectSearch.unavailable")}
            detail={detail}
            action={{ label: SD("projectSearch.retry"), onClick: () => void search.refetch() }}
          />
        );
      case "notReady":
        return (
          <StatePanel
            testId="project-search-not-ready"
            message={SD("projectSearch.notReady")}
            detail={detail}
          />
        );
      case "disabled":
        return (
          <StatePanel testId="project-search-disabled" message={SD("projectSearch.disabled")} />
        );
      case "invalidQuery":
        return (
          <StatePanel testId="project-search-invalid" message={SD("projectSearch.invalidQuery")} />
        );
      case "unexpected":
        return (
          <StatePanel
            testId="project-search-error"
            message={SD("projectSearch.unexpected")}
            action={{ label: SD("projectSearch.retry"), onClick: restart }}
          />
        );
    }
  };

  const renderBody = () => {
    if (session.isPending) {
      return <StatePanel testId="project-search-loading" message={SD("projectSearch.loading")} />;
    }
    if (!signedIn) {
      return failurePanel("signInRequired", null);
    }
    if (query === "") {
      return (
        <StatePanel testId="project-search-empty-query" message={SD("projectSearch.emptyQuery")} />
      );
    }
    if (search.isPending) {
      return <StatePanel testId="project-search-loading" message={SD("projectSearch.loading")} />;
    }
    if (failure && hits.length === 0 && !search.isFetchNextPageError) {
      return failurePanel(failure.kind, failure.detail);
    }
    if (hits.length === 0) {
      return (
        <StatePanel
          testId="project-search-no-results"
          message={SD("projectSearch.noResults")(query)}
        />
      );
    }
    return (
      <>
        <ul data-testid="project-search-results">
          {hits.map((hit) => (
            <SearchHit key={hit.id} hit={hit} />
          ))}
        </ul>
        {/* A next-page failure shows below the results received so far. */}
        {failure && search.isFetchNextPageError && failurePanel(failure.kind, failure.detail)}
        {search.hasNextPage && !search.isFetchNextPageError && (
          <div className="pt-4 text-center">
            <Button
              variant="outline"
              size="sm"
              disabled={search.isFetchingNextPage}
              onClick={() => void search.fetchNextPage()}
              data-testid="project-search-load-more"
            >
              <span className="text-xs">
                {search.isFetchingNextPage
                  ? SD("projectSearch.loading")
                  : SD("projectSearch.loadMore")}
              </span>
            </Button>
          </div>
        )}
      </>
    );
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-[1200px] mx-auto p-8 space-y-6">
        <div className="flex items-center gap-2">
          <SearchIcon className="h-5 w-5" />
          <span className="text-lg font-semibold h-5">{SD("projectSearch.title")}</span>
          <Link to="/admin/projects" className="ml-auto text-xs text-primary hover:underline">
            {SD("common.backToList")}
          </Link>
        </div>

        <Card className="shadow-sm border-border/40 overflow-hidden">
          <form onSubmit={handleSubmit} className="bg-gray-100 px-6 py-4 flex items-center gap-3">
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={SD("projectSearch.placeholder")}
              className="h-8 max-w-md text-xs bg-white border-gray-300"
              aria-label={SD("projectSearch.placeholder")}
              maxLength={200}
              name="q"
            />
            <Button type="submit" className="h-8 px-4" icon={<SearchIcon />}>
              <span className="text-xs">{SD("common.search")}</span>
            </Button>
            <span className="text-xs text-muted-foreground">{SD("projectSearch.visibility")}</span>
          </form>
          <CardContent className="px-6 pb-6 pt-2 bg-white">{renderBody()}</CardContent>
        </Card>
      </div>
    </div>
  );
}
