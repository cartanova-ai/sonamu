import {
  type ApiError,
  type ApiResponse,
  type Client,
  Transport,
} from "@opensearch-project/opensearch";
import {
  type TransportRequestCallback,
  type TransportRequestOptions,
  type TransportRequestParams,
  type TransportRequestPromise,
} from "@opensearch-project/opensearch/lib/Transport.js";

export interface RecordedRequest {
  readonly method: string;
  readonly path: string;
  readonly body?: TransportRequestParams["body"];
  readonly querystring?: TransportRequestParams["querystring"];
}

export interface RequestHooks {
  before?: (request: RecordedRequest) => Promise<void>;
  after?: (request: RecordedRequest) => Promise<Error | undefined>;
}

// before delays the request until it resolves. after runs once the engine has applied the request; returning an Error
// throws it instead of the response, simulating a lost response.
export function requestRecorder(base: Client, hooks: RequestHooks = {}) {
  const requests: RecordedRequest[] = [];
  class RecordingTransport extends Transport {
    request(
      params: TransportRequestParams,
      options?: TransportRequestOptions,
    ): TransportRequestPromise<ApiResponse>;
    request(
      params: TransportRequestParams,
      options?: TransportRequestOptions,
      callback?: (err: ApiError, result: ApiResponse) => void,
    ): TransportRequestCallback;
    request(
      params: TransportRequestParams,
      options?: TransportRequestOptions,
      callback?: (err: ApiError, result: ApiResponse) => void,
    ): TransportRequestPromise<ApiResponse> | TransportRequestCallback {
      if (callback !== undefined) return super.request(params, options, callback);
      const record: RecordedRequest = {
        method: params.method,
        path: params.path,
        body: params.body,
        querystring: params.querystring,
      };
      requests.push(record);
      let inner: TransportRequestPromise<ApiResponse> | undefined;
      let aborted = false;
      const send = (): TransportRequestPromise<ApiResponse> => super.request(params, options);
      const pending = (async () => {
        await hooks.before?.(record);
        if (aborted) throw new Error("요청이 보내기 전에 중단됐습니다.");
        inner = send();
        const response = await inner;
        const replaced = await hooks.after?.(record);
        if (replaced !== undefined) throw replaced;
        return response;
      })();
      return Object.assign(pending, {
        abort: () => {
          aborted = true;
          inner?.abort();
        },
      });
    }
  }
  return { client: base.child({ Transport: RecordingTransport }), requests };
}

export interface Gate {
  readonly reached: Promise<void>;
  wait(): Promise<void>;
  open(): void;
}

export function gate(): Gate {
  let arrive!: () => void;
  let release!: () => void;
  const reached = new Promise<void>((resolve) => {
    arrive = resolve;
  });
  const opened = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    reached,
    async wait() {
      arrive();
      await opened;
    },
    open: release,
  };
}
