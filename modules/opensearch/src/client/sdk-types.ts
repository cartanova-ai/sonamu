import { type API, type Client, type Types } from "@opensearch-project/opensearch";

export type OpenSearchClient = Client;
export type NativeIndexSettings = Types.Indices_Common.IndexSettings;
export type NativeTypeMapping = Types.Common_Mapping.TypeMapping;
export type NativeProperty = Types.Common_Mapping.Property;
export type NativeDynamicMapping = Types.Common_Mapping.DynamicMapping;
export type NativeQuery = Types.Common_QueryDsl.QueryContainer;
export type NativeSort = Types.Common.Sort;
export type NativeSortValues = Types.Common.SortResults;
export type NativeHighlight = Types.Core_Search.Highlight;
export type NativeSourceConfig = Types.Core_Search.SourceConfig;
export type NativeTrackHits = Types.Core_Search.TrackHits;
export type NativeSearchRequestBody = API.Search_RequestBody;
export type NativeBulkResponseItem = Types.Core_Bulk.ResponseItem;
export type NativeErrorCause = Types.Common.ErrorCause;

export type NativeSearchBody = Pick<
  NativeSearchRequestBody,
  "query" | "sort" | "size" | "search_after" | "_source" | "highlight" | "track_total_hits"
>;

export interface SearchDocumentMappings {
  properties: Record<string, NativeProperty>;
  /** Defaults to `"strict"`. */
  dynamic?: NativeDynamicMapping;
}
