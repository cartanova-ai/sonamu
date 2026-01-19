/** biome-ignore-all lint/suspicious/noExplicitAny: axios 사용 시 타입 추론 어려우므로 허용 */

import { Button, Card, CardContent, CardHeader } from "@sonamu-kit/react-components/components";
import axios from "axios";
import { useEffect, useRef, useState } from "react";
import TrashIcon from "~icons/lucide/trash-2";

type ApiLog = {
  id: string;
  method: string;
  url: string;
  requestHeaders?: Record<string, any>;
  requestBody?: any;
  requestQuery?: Record<string, any>;
  responseStatus?: number;
  responseHeaders?: Record<string, any>;
  responseBody?: any;
  duration?: number;
  timestamp: number;
};

export function ApiLogViewer({ bodyOnly = false }: { bodyOnly?: boolean }) {
  const [apiLogs, setApiLogs] = useState<ApiLog[]>([]);
  const requestStartTimes = useRef<Map<string, number>>(new Map());

  // Axios interceptor 설정
  useEffect(() => {
    const requestInterceptor = axios.interceptors.request.use(
      (config) => {
        const logId = `${Date.now()}-${Math.random()}`;
        const startTime = Date.now();
        requestStartTimes.current.set(logId, startTime);

        const log: ApiLog = {
          id: logId,
          method: config.method?.toUpperCase() || "GET",
          url: config.url || "",
          requestHeaders: config.headers as Record<string, any>,
          requestBody: config.data,
          requestQuery: config.params,
          timestamp: startTime,
        };

        // FormData는 표시 불가
        if (config.data instanceof FormData) {
          log.requestBody = "[FormData]";
        }

        setApiLogs((prev) => [log, ...prev]);
        (config as any).__logId = logId;

        return config;
      },
      (error) => {
        return Promise.reject(error);
      },
    );

    const responseInterceptor = axios.interceptors.response.use(
      (response) => {
        const logId = (response.config as any).__logId;
        const startTime = requestStartTimes.current.get(logId);
        const duration = startTime ? Date.now() - startTime : undefined;
        requestStartTimes.current.delete(logId);

        setApiLogs((prev) =>
          prev.map((log) =>
            log.id === logId
              ? {
                  ...log,
                  responseStatus: response.status,
                  responseHeaders: response.headers as Record<string, any>,
                  responseBody: response.data,
                  duration,
                }
              : log,
          ),
        );

        return response;
      },
      (error) => {
        const logId = (error.config as any)?.__logId;
        const startTime = logId ? requestStartTimes.current.get(logId) : undefined;
        const duration = startTime ? Date.now() - startTime : undefined;
        if (logId) {
          requestStartTimes.current.delete(logId);
        }

        if (logId) {
          setApiLogs((prev) =>
            prev.map((log) =>
              log.id === logId
                ? {
                    ...log,
                    responseStatus: error.response?.status,
                    responseHeaders: error.response?.headers,
                    responseBody: error.response?.data,
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

                {!bodyOnly && log.requestHeaders && Object.keys(log.requestHeaders).length > 0 && (
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
                      {JSON.stringify(log.requestHeaders, null, 2)}
                    </pre>
                  </div>
                )}

                {!bodyOnly && log.requestQuery && Object.keys(log.requestQuery).length > 0 && (
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
                      {JSON.stringify(log.requestQuery, null, 2)}
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
                      {typeof log.requestBody === "string"
                        ? log.requestBody
                        : JSON.stringify(log.requestBody, null, 2)}
                    </pre>
                  </div>
                )}

                {!bodyOnly &&
                  log.responseHeaders &&
                  Object.keys(log.responseHeaders).length > 0 && (
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
                        {JSON.stringify(log.responseHeaders, null, 2)}
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
                      {typeof log.responseBody === "string"
                        ? log.responseBody
                        : JSON.stringify(log.responseBody, null, 2)}
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
