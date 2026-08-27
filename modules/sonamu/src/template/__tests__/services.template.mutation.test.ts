import { beforeEach, describe, expect, it } from "vitest";

import { Sonamu } from "../../api";
import { type SonamuConfig } from "../../api/config";
import { type ExtendedApi } from "../../api/decorators";
import { Syncer } from "../../syncer/syncer";
import { Template__services } from "../implementations/services.template";

const testConfig = {
  api: { dir: ".", route: { prefix: "/api" } },
  i18n: { defaultLocale: "ko", supportedLocales: ["ko"] },
  sync: { targets: [] },
  database: {},
  server: {
    apiConfig: {
      contextProvider: (defaultContext) => defaultContext,
      guardHandler: () => undefined,
    },
  },
} satisfies SonamuConfig;

function renderServices(apis: ExtendedApi[]) {
  const syncer = new Syncer();
  syncer.apis = apis;
  Sonamu.syncer = syncer;
  return new Template__services().render({}).body;
}

describe("Template__services mutation hooks", () => {
  beforeEach(() => {
    Sonamu.config = testConfig;
  });

  it("파라미터가 있는 일반 mutation에서 namespace와 인자 순서를 유지한다", () => {
    const body = renderServices([
      {
        modelName: "CaseModel",
        methodName: "leave",
        path: "/case/leave",
        options: {
          httpMethod: "POST",
          clients: ["tanstack-mutation"],
        },
        typeParameters: [],
        parameters: [
          { name: "caseId", type: "number", optional: false },
          { name: "notify", type: "boolean", optional: false },
        ],
        returnType: {
          t: "ref",
          id: "Promise",
          args: ["boolean"],
        },
      },
    ]);

    expect(body).toContain(`export const useLeaveMutation = () => useMutation({
  mutationFn: (params: { caseId: number, notify: boolean }) => CaseService.leave(params.caseId, params.notify)
});`);
    expect(body).not.toContain(
      "mutationFn: (params: { caseId: number, notify: boolean }) => leave(params.caseId, params.notify)",
    );
  });

  it("파라미터가 없는 일반 mutation에서 params: void 타입을 유지한다", () => {
    const body = renderServices([
      {
        modelName: "CaseModel",
        methodName: "refresh",
        path: "/case/refresh",
        options: {
          httpMethod: "POST",
          clients: ["tanstack-mutation"],
        },
        typeParameters: [],
        parameters: [],
        returnType: {
          t: "ref",
          id: "Promise",
          args: ["void"],
        },
      },
    ]);

    expect(body).toContain(`export const useRefreshMutation = () => useMutation({
  mutationFn: (params: void) => CaseService.refresh()
});`);
    expect(body).not.toContain("mutationFn: (params: void) => refresh()");
  });

  it("파일만 받는 multipart mutation에서 namespace와 mutation 옵션을 유지한다", () => {
    const body = renderServices([
      {
        modelName: "VoiceFrame",
        methodName: "uploadRecording",
        path: "/voice/uploadRecording",
        options: {
          httpMethod: "POST",
          clients: ["axios-multipart", "tanstack-mutation-multipart"],
        },
        typeParameters: [],
        parameters: [],
        returnType: {
          t: "ref",
          id: "Promise",
          args: ["string"],
        },
      },
    ]);

    expect(body).toContain(`export const useUploadRecordingMutation = (
  options?: UseMutationOptions<string, Error, { files: File[] }> & {
    onUploadProgress?: (e: AxiosProgressEvent) => void;
  }
) => useMutation({
  mutationFn: (params: { files: File[] }) => VoiceService.uploadRecording(params.files),
  retry: false,
  ...options,
});`);
    expect(body).not.toContain(
      "mutationFn: (params: { files: File[] }) => uploadRecording(params.files)",
    );
  });

  it("API 파라미터와 파일을 받는 multipart mutation에서 namespace와 인자 순서를 유지한다", () => {
    const body = renderServices([
      {
        modelName: "VoiceFrame",
        methodName: "transcript",
        path: "/voice/transcript",
        options: {
          httpMethod: "POST",
          clients: ["axios-multipart", "tanstack-mutation-multipart"],
        },
        typeParameters: [],
        parameters: [
          {
            name: "params",
            type: {
              t: "object",
              props: [
                { name: "language", type: "string", optional: false },
                { name: "speakerCount", type: "number", optional: false },
              ],
            },
            optional: false,
          },
        ],
        returnType: {
          t: "ref",
          id: "Promise",
          args: ["number"],
        },
      },
    ]);

    expect(body).toContain(`export const useTranscriptMutation = (
  options?: UseMutationOptions<number, Error, { params: { language: string, speakerCount: number }, files: File[] }> & {
    onUploadProgress?: (e: AxiosProgressEvent) => void;
  }
) => useMutation({
  mutationFn: (params: { params: { language: string, speakerCount: number }, files: File[] }) => VoiceService.transcript(params.params, params.files),
  retry: false,
  ...options,
});`);
    expect(body).not.toContain(
      "mutationFn: (params: { params: { language: string, speakerCount: number }, files: File[] }) => transcript(params.params, params.files)",
    );
  });
});
