import { Button, Card, CardContent, CardHeader } from "@sonamu-kit/react-components/components";
import axios, { isAxiosError } from "axios";
import { useEffect, useRef, useState } from "react";
import TrashIcon from "~icons/lucide/trash-2";

type ApiLog = {
  id: string;
  method: string;
  url: string;
  requestHeaders?: string;
  requestBody?: string;
  requestQuery?: string;
  responseStatus?: number;
  responseHeaders?: string;
  responseBody?: string;
  duration?: number;
  timestamp: number;
};

export function ApiLogViewer({ bodyOnly = false }: { bodyOnly?: boolean }) {
  const [apiLogs, setApiLogs] = useState<ApiLog[]>([]);
  const requestMetadata = useRef(new WeakMap<object, { logId: string; startTime: number }>());

  // Axios interceptor 설정
  useEffect(() => {
    const requestInterceptor = axios.interceptors.request.use(
      (config) => {
        const logId = `${Date.now()}-${Math.random()}`;
        const startTime = Date.now();
        requestMetadata.current.set(config, { logId, startTime });

        const log: ApiLog = {
          id: logId,
          method: config.method?.toUpperCase() || "GET",
          url: config.url || "",
          requestHeaders: JSON.stringify(config.headers, null, 2),
          requestBody:
            config.data === undefined
              ? undefined
              : config.data instanceof Object
                ? JSON.stringify(config.data, null, 2)
                : String(config.data),
          requestQuery: JSON.stringify(config.params, null, 2),
          timestamp: startTime,
        };

        // FormData는 표시 불가
        if (config.data instanceof FormData) {
          log.requestBody = "[FormData]";
        }

        setApiLogs((prev) => [log, ...prev]);
        return config;
      },
      (error) => {
        return Promise.reject(error);
      },
    );

    const responseInterceptor = axios.interceptors.response.use(
      (response) => {
        const metadata = requestMetadata.current.get(response.config);
        const logId = metadata?.logId;
        const duration = metadata ? Date.now() - metadata.startTime : undefined;
        requestMetadata.current.delete(response.config);

        setApiLogs((prev) =>
          prev.map((log) =>
            logId && log.id === logId
              ? {
                  ...log,
                  responseStatus: response.status,
                  responseHeaders: JSON.stringify(response.headers, null, 2),
                  responseBody:
                    response.data === undefined
                      ? undefined
                      : response.data instanceof Object
                        ? JSON.stringify(response.data, null, 2)
                        : String(response.data),
                  duration,
                }
              : log,
          ),
        );

        return response;
      },
      (error) => {
        const config = isAxiosError(error) ? error.config : undefined;
        const metadata = config ? requestMetadata.current.get(config) : undefined;
        const logId = metadata?.logId;
        const duration = metadata ? Date.now() - metadata.startTime : undefined;
        if (config) requestMetadata.current.delete(config);

        if (logId) {
          setApiLogs((prev) =>
            prev.map((log) =>
              log.id === logId
                ? {
                    ...log,
                    responseStatus: isAxiosError(error) ? error.response?.status : undefined,
                    responseHeaders:
                      isAxiosError(error) && error.response
                        ? JSON.stringify(error.response.headers, null, 2)
                        : undefined,
                    responseBody:
                      isAxiosError(error) && error.response
                        ? error.response.data === undefined
                          ? undefined
                          : error.response.data instanceof Object
                            ? JSON.stringify(error.response.data, null, 2)
                            : String(error.response.data)
                        : undefined,
                    duration,
                  }
                : log,
            ),
          );
        }

        return Promise.reject(error);
      },
    );

    return () => {
      axios.interceptors.request.eject(requestInterceptor);
      axios.interceptors.response.eject(responseInterceptor);
    };
  }, []);

  return (
    <Card className="border-purple-200 bg-purple-50/50 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <div className="text-sm font-semibold text-purple-700">API 로그</div>
          <Button
            size="sm"
            onClick={() => setApiLogs([])}
            disabled={apiLogs.length === 0}
            icon={<TrashIcon />}
          >
            로그 지우기
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div
          style={{
            maxHeight: "400px",
            overflowY: "auto",
            fontFamily: "monospace",
            fontSize: "12px",
            backgroundColor: "#1e1e1e",
            color: "#d4d4d4",
            padding: "1em",
            borderRadius: "4px",
          }}
        >
          {apiLogs.length === 0 ? (
            <div style={{ color: "#808080" }}>API 호출이 없습니다.</div>
          ) : (
            apiLogs.map((log) => (
              <div
                key={log.id}
                style={{
                  marginBottom: "2em",
                  borderBottom: "1px solid #3e3e3e",
                  paddingBottom: "1em",
                }}
              >
                <div style={{ marginBottom: "0.5em" }}>
                  <span style={{ color: "#569cd6", fontWeight: "bold" }}>[{log.method}]</span>{" "}
                  <span style={{ color: "#4ec9b0" }}>{log.url}</span>
                  {log.duration !== undefined && (
                    <span style={{ color: "#808080", marginLeft: "1em" }}>({log.duration}ms)</span>
                  )}
                  {log.responseStatus !== undefined && (
                    <span
                      style={{
                        color:
                          log.responseStatus >= 200 && log.responseStatus < 300
                            ? "#6a9955"
                            : log.responseStatus >= 400
                              ? "#f48771"
                              : "#dcdcaa",
                        marginLeft: "1em",
                        fontWeight: "bold",
                      }}
                    >
                      Status: {log.responseStatus}
                    </span>
                  )}
                </div>

                {!bodyOnly && log.requestHeaders && log.requestHeaders !== "{}" && (
                  <div style={{ marginBottom: "0.5em" }}>
                    <div style={{ color: "#9cdcfe", marginBottom: "0.25em" }}>Request Headers:</div>
                    <pre
                      style={{
                        margin: 0,
                        padding: "0.5em",
                        backgroundColor: "#252526",
                        borderRadius: "4px",
                        overflowX: "auto",
                      }}
                    >
                      {log.requestHeaders}
                    </pre>
                  </div>
                )}

                {!bodyOnly && log.requestQuery && log.requestQuery !== "{}" && (
                  <div style={{ marginBottom: "0.5em" }}>
                    <div style={{ color: "#9cdcfe", marginBottom: "0.25em" }}>Query Params:</div>
                    <pre
                      style={{
                        margin: 0,
                        padding: "0.5em",
                        backgroundColor: "#252526",
                        borderRadius: "4px",
                        overflowX: "auto",
                      }}
                    >
                      {log.requestQuery}
                    </pre>
                  </div>
                )}

                {!bodyOnly && log.requestBody !== undefined && (
                  <div style={{ marginBottom: "0.5em" }}>
                    <div style={{ color: "#9cdcfe", marginBottom: "0.25em" }}>Request Body:</div>
                    <pre
                      style={{
                        margin: 0,
                        padding: "0.5em",
                        backgroundColor: "#252526",
                        borderRadius: "4px",
                        overflowX: "auto",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-all",
                      }}
                    >
                      {log.requestBody}
                    </pre>
                  </div>
                )}

                {!bodyOnly && log.responseHeaders && log.responseHeaders !== "{}" && (
                  <div style={{ marginBottom: "0.5em" }}>
                    <div style={{ color: "#9cdcfe", marginBottom: "0.25em" }}>
                      Response Headers:
                    </div>
                    <pre
                      style={{
                        margin: 0,
                        padding: "0.5em",
                        backgroundColor: "#252526",
                        borderRadius: "4px",
                        overflowX: "auto",
                      }}
                    >
                      {log.responseHeaders}
                    </pre>
                  </div>
                )}

                {log.responseBody !== undefined && (
                  <div style={{ marginBottom: "0.5em" }}>
                    <div style={{ color: "#9cdcfe", marginBottom: "0.25em" }}>Response Body:</div>
                    <pre
                      style={{
                        margin: 0,
                        padding: "0.5em",
                        backgroundColor: "#252526",
                        borderRadius: "4px",
                        overflowX: "auto",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-all",
                        maxHeight: "200px",
                        overflowY: "auto",
                      }}
                    >
                      {log.responseBody}
                    </pre>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
