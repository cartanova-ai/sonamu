import { type API, type Client, type Types } from "opensearch-sdk-floor";
import { expectTypeOf, test } from "vitest";

import {
  type NativeDynamicMapping,
  type NativeIndexSettings,
  type NativeProperty,
  type NativeQuery,
  type NativeSearchBody,
  type NativeSortValues,
  type NativeTypeMapping,
  type SearchDocumentMappings,
} from "../../src";
import { type composeIndexMappings, type sonamuMetaMapping } from "../../src/definition/envelope";

// Checks against the supported SDK floor (opensearch-sdk-floor = @opensearch-project/opensearch@3.9.0).
// The aliases of src/client/sdk-types.ts are redeclared against the floor, so a path missing there fails to compile.

type FloorOpenSearchClient = Client;
type FloorIndexSettings = Types.Indices_Common.IndexSettings;
type FloorTypeMapping = Types.Common_Mapping.TypeMapping;
type FloorProperty = Types.Common_Mapping.Property;
type FloorDynamicMapping = Types.Common_Mapping.DynamicMapping;
type FloorQuery = Types.Common_QueryDsl.QueryContainer;
type FloorSort = Types.Common.Sort;
type FloorSortValues = Types.Common.SortResults;
type FloorHighlight = Types.Core_Search.Highlight;
type FloorSourceConfig = Types.Core_Search.SourceConfig;
type FloorTrackHits = Types.Core_Search.TrackHits;
type FloorSearchRequestBody = API.Search_RequestBody;
type FloorBulkResponseItem = Types.Core_Bulk.ResponseItem;
type FloorErrorCause = Types.Common.ErrorCause;

type SearchBodyKeys =
  | "query"
  | "sort"
  | "size"
  | "search_after"
  | "_source"
  | "highlight"
  | "track_total_hits";
type FloorSearchBody = Pick<FloorSearchRequestBody, SearchBodyKeys>;
interface FloorSearchDocumentMappings {
  properties: Record<string, FloorProperty>;
  dynamic?: FloorDynamicMapping;
}

test("하한 SDK에 별칭이 가리키는 타입이 모두 있다", () => {
  expectTypeOf<FloorOpenSearchClient>().not.toBeNever();
  expectTypeOf<FloorIndexSettings>().not.toBeNever();
  expectTypeOf<FloorQuery>().not.toBeNever();
  expectTypeOf<FloorSort>().not.toBeNever();
  expectTypeOf<FloorHighlight>().not.toBeNever();
  expectTypeOf<FloorSourceConfig>().not.toBeNever();
  expectTypeOf<FloorTrackHits>().not.toBeNever();
  expectTypeOf<FloorBulkResponseItem>().not.toBeNever();
  expectTypeOf<FloorErrorCause>().not.toBeNever();
  expectTypeOf<FloorSortValues>().toExtend<readonly unknown[]>();
});

test("패키지가 만든 본문과 매핑을 하한 SDK가 받는다", () => {
  expectTypeOf<NativeSearchBody>().toExtend<FloorSearchRequestBody>();
  expectTypeOf<NativeTypeMapping>().toExtend<FloorTypeMapping>();
  expectTypeOf<ReturnType<typeof composeIndexMappings>>().toExtend<FloorTypeMapping>();
  expectTypeOf<ReturnType<typeof sonamuMetaMapping>>().toExtend<FloorProperty>();
  expectTypeOf<NativeIndexSettings>().toExtend<FloorIndexSettings>();
  expectTypeOf<NativeSortValues>().toExtend<FloorSortValues>();
});

test("하한 타입으로 쓴 소비자 입력을 패키지 별칭이 받는다", () => {
  expectTypeOf<FloorIndexSettings>().toExtend<NativeIndexSettings>();
  expectTypeOf<FloorSearchDocumentMappings>().toExtend<SearchDocumentMappings>();
  expectTypeOf<FloorSearchBody>().toExtend<NativeSearchBody>();
  expectTypeOf<FloorQuery>().toExtend<NativeQuery>();
  expectTypeOf<FloorProperty>().toExtend<NativeProperty>();
  expectTypeOf<FloorDynamicMapping>().toExtend<NativeDynamicMapping>();
});

test("하한에서도 패키지가 기대는 SDK 사실이 성립한다", () => {
  expectTypeOf<Types.Common.VersionNumber>().toEqualTypeOf<number>();
  expectTypeOf<NonNullable<API.Bulk_Request["require_alias"]>>().toEqualTypeOf<boolean>();
  expectTypeOf<string>().toExtend<
    NonNullable<Parameters<Client["transport"]["request"]>[0]["bulkBody"]>
  >();
  expectTypeOf<ReturnType<Client["close"]>>().toEqualTypeOf<Promise<void>>();
});
