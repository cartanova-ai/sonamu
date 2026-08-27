import { APICallError } from "@ai-sdk/provider";
import { type FetchFunction } from "@ai-sdk/provider-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RtzrClientError } from "../error";
import { RtzrTranscriptionModel } from "../model";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type MockResponse = {
  body: JsonValue;
  status?: number;
};

const audio = new Uint8Array([1, 2, 3]);

function jsonResponse({ body, status = 200 }: MockResponse): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function createFetchMock(responses: MockResponse[]): FetchFunction {
  return async () => {
    const response = responses.shift();
    if (response === undefined) {
      throw new Error("Unexpected RTZR request");
    }

    return jsonResponse(response);
  };
}

function createModel(fetchMock: FetchFunction) {
  return new RtzrTranscriptionModel("sommers", {
    _internal: {
      currentDate: () => new Date("2026-06-17T00:00:00.000Z"),
    },
    provider: "rtzr.transcription",
    auth: {
      clientId: "client-id",
      clientSecret: "client-secret",
    },
    url: ({ path }) => `https://rtzr.test/v1${path}`,
    headers: () => ({
      "x-test": "1",
    }),
    fetch: fetchMock,
  });
}

describe("RtzrTranscriptionModel", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns completed transcription text, segments, and language", async () => {
    vi.useFakeTimers();
    const model = createModel(
      createFetchMock([
        {
          body: {
            access_token: "token",
            expire_at: 1_797_000_000,
          },
        },
        {
          body: {
            id: "transcribe-1",
          },
        },
        {
          body: {
            id: "transcribe-1",
            status: "completed",
            results: {
              utterances: [
                {
                  start_at: 1000,
                  duration: 2500,
                  msg: "hello",
                  spk: 0,
                  lang: "en",
                },
                {
                  start_at: 3500,
                  duration: 1200,
                  msg: "world",
                  spk: 0,
                  lang: "en",
                },
              ],
            },
          },
        },
      ]),
    );

    const resultPromise = model.doGenerate({
      audio,
      mediaType: "audio/wav",
      headers: {},
    });
    await vi.advanceTimersByTimeAsync(5000);
    const result = await resultPromise;

    expect(result.text).toBe("hello\nworld");
    expect(result.language).toBe("en");
    expect(result.segments).toEqual([
      {
        text: "hello",
        startSecond: 1,
        endSecond: 3,
      },
      {
        text: "world",
        startSecond: 3,
        endSecond: 4,
      },
    ]);
  });

  it("throws a detailed RTZR error when polling returns failed", async () => {
    vi.useFakeTimers();
    const model = createModel(
      createFetchMock([
        {
          body: {
            access_token: "token",
            expire_at: 1_797_000_000,
          },
        },
        {
          body: {
            id: "transcribe-2",
          },
        },
        {
          body: {
            id: "transcribe-2",
            status: "failed",
            error: {
              code: "E500",
              message: "internal server error",
            },
          },
        },
      ]),
    );

    const resultPromise = model.doGenerate({
      audio,
      mediaType: "audio/wav",
      headers: {},
    });
    const errorPromise = resultPromise.catch((cause: unknown) => cause);
    await vi.advanceTimersByTimeAsync(5000);
    const error = await errorPromise;

    expect(error).toBeInstanceOf(RtzrClientError);
    expect(error).toMatchObject({
      message: expect.stringContaining("RTZR transcription failed for id transcribe-2"),
    });
    expect(error).toMatchObject({
      message: expect.stringContaining("code E500"),
    });
    expect(error).toMatchObject({
      message: expect.stringContaining("internal server error"),
    });
  });

  it("converts flat RTZR HTTP errors to useful API messages", async () => {
    const model = createModel(
      createFetchMock([
        {
          body: {
            access_token: "token",
            expire_at: 1_797_000_000,
          },
        },
        {
          status: 400,
          body: {
            code: "H0001",
            msg: "unexpected end of JSON input",
          },
        },
      ]),
    );

    await expect(
      model.doGenerate({
        audio,
        mediaType: "audio/wav",
        headers: {},
      }),
    ).rejects.toMatchObject({
      name: "AI_APICallError",
      message: expect.stringContaining("HTTP 400: code H0001: unexpected end of JSON input"),
    });
  });

  it("includes auth response details without secrets", async () => {
    const model = createModel(
      createFetchMock([
        {
          status: 401,
          body: {
            code: "H401",
            msg: "invalid client credentials",
          },
        },
      ]),
    );

    const resultPromise = model.doGenerate({
      audio,
      mediaType: "audio/wav",
      headers: {},
    });
    const error = await resultPromise.catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(RtzrClientError);
    expect(error).toMatchObject({
      message: expect.stringContaining(
        "Failed to authorize RTZR: HTTP 401: code H401: invalid client credentials",
      ),
    });
    expect(error).toMatchObject({
      message: expect.not.stringContaining("client-secret"),
    });
  });

  it("includes auth schema details for invalid auth payloads", async () => {
    const model = createModel(
      createFetchMock([
        {
          body: {
            token: "wrong-field",
          },
        },
      ]),
    );

    await expect(
      model.doGenerate({
        audio,
        mediaType: "audio/wav",
        headers: {},
      }),
    ).rejects.toThrow("Invalid RTZR auth response");
  });

  it("keeps RTZR HTTP errors as API call errors", async () => {
    const model = createModel(
      createFetchMock([
        {
          body: {
            access_token: "token",
            expire_at: 1_797_000_000,
          },
        },
        {
          status: 404,
          body: {
            code: "H0004",
            msg: "not found",
          },
        },
      ]),
    );

    await expect(
      model.doGenerate({
        audio,
        mediaType: "audio/wav",
        headers: {},
      }),
    ).rejects.toThrow(APICallError);
  });
});
