// components/ChatComponent.tsx
import { useChat } from "@ai-sdk/react";
import { Button, Textarea } from "@sonamu-kit/react-components";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";
import { type FixtureRecord } from "sonamu";
import AlertCircleIcon from "~icons/lucide/alert-circle";
import CheckIcon from "~icons/lucide/check";
import Loader2Icon from "~icons/lucide/loader-2";

type ToolState = "idle" | "running" | "success" | "error";

type ChatComponentProps = {
  fixtureRecords: FixtureRecord[];
  onUpdateFixtures?: (records: FixtureRecord[]) => void;
};

export default function ChatComponent({ fixtureRecords, onUpdateFixtures }: ChatComponentProps) {
  const [input, setInput] = useState("");
  const [requestStartIndex, setRequestStartIndex] = useState(0);
  const processedToolCallIdsRef = useRef(new Set<string>());
  const [transportErrorMessage, setTransportErrorMessage] = useState<string | null>(null);

  const { messages, status, sendMessage, setMessages, stop } = useChat({
    // @ts-expect-error TODO: fix this (ai-sdk stable/beta 이슈)
    transport: new DefaultChatTransport({
      api: "/sonamu-ui/api/ai/fixture/chat",
    }),
    onError: (error) => {
      const err = (() => {
        try {
          return JSON.parse(error.message);
        } catch {
          return error;
        }
      })();

      if ("statusCode" in err && err.statusCode === 404) {
        setTransportErrorMessage(
          "API Key 설정이 필요합니다. process.env.ANTHROPIC_API_KEY 설정 후 다시 시도하세요.",
        );
      } else {
        setTransportErrorMessage(err.message);
      }
    },
  });

  // 도구 결과 콜백은 메시지당 한 번만 외부 상태에 반영합니다.
  useEffect(() => {
    for (const msg of messages) {
      for (const part of msg.parts) {
        if (part.type.startsWith("tool-") && "state" in part && "toolCallId" in part) {
          if (
            part.state === "output-available" &&
            !processedToolCallIdsRef.current.has(part.toolCallId)
          ) {
            // updateFixtures 또는 createFixtures 도구인 경우 결과 처리
            if (
              (part.type === "tool-updateFixtures" || part.type === "tool-createFixtures") &&
              "output" in part
            ) {
              // SAFETY: 해당 도구의 서버 응답 스키마는 성공 여부와 픽스쳐 배열을 항상 함께 반환합니다.
              const result = part.output as { success: boolean; updatedRecords: FixtureRecord[] };
              if (result?.success && result?.updatedRecords && onUpdateFixtures) {
                onUpdateFixtures(result.updatedRecords);
              }
            }
            processedToolCallIdsRef.current.add(part.toolCallId);
          }
        }
      }
    }
  }, [messages, onUpdateFixtures]);

  let toolState: ToolState = "idle";
  let toolName: string | null = null;
  let summaryMessage: string | null = null;
  let toolErrorMessage: string | null = null;
  // 현재 요청 이후의 메시지만 상태 표시에 사용해 이전 요청 결과가 섞이지 않게 합니다.
  for (const msg of messages.slice(requestStartIndex)) {
    for (const part of msg.parts) {
      if (part.type === "step-start") toolState = "running";
      if (part.type.startsWith("tool-") && "state" in part) {
        toolName = part.type.slice(5);
        if (part.state === "output-available") toolState = "success";
        if (part.state === "output-error") {
          toolState = "error";
          toolErrorMessage = ("errorText" in part ? part.errorText : null) ?? "알 수 없는 오류";
        }
      }
      if (msg.role === "assistant" && part.type === "text" && part.text.trim()) {
        summaryMessage = part.text;
      }
    }
  }

  // 스트리밍이 끝났지만 완료 결과가 없는 도구도 기존과 같이 성공으로 표시합니다.
  if (status === "ready" && toolState === "running") toolState = "success";
  const errorMessage = transportErrorMessage ?? toolErrorMessage;

  const isLoading = status === "streaming" || status === "submitted";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    if (!fixtureRecords || fixtureRecords.length === 0) {
      setTransportErrorMessage("픽스쳐 레코드가 없습니다. 픽스쳐 조회 후 시도하세요.");
      return;
    }

    setTransportErrorMessage(null);
    setRequestStartIndex(messages.length);
    sendMessage({ text: input }, { body: { fixtureRecords } });
    setInput("");
  };

  const handleClear = () => {
    setMessages([]);
    setRequestStartIndex(0);
    setTransportErrorMessage(null);
    processedToolCallIdsRef.current.clear();
  };

  const renderStatus = () => {
    if (toolState === "idle") return null;

    const displayName = toolName ?? "tool";

    const statusConfig = {
      running: { color: "#f59e0b", bg: "#fef3c7", text: "처리 중" },
      success: { color: "#10b981", bg: "#d1fae5", text: "완료" },
      error: { color: "#ef4444", bg: "#fee2e2", text: "오류" },
    } as const;

    const config = statusConfig[toolState];

    return (
      <div className="mt-[0.8em] w-full">
        <div
          className={`inline-flex gap-[0.4em] px-[0.8em] py-[0.4em] rounded-[6px] text-[0.85em] font-medium h-fit ${toolState === "running" ? "items-center" : ""}`}
          style={{
            backgroundColor: config.bg,
            color: config.color,
          }}
        >
          {toolState === "running" && <Loader2Icon className="animate-spin" />}
          {toolState === "success" && <CheckIcon />}
          {toolState === "error" && <AlertCircleIcon />}
          <span className="font-mono text-[0.9em] opacity-80">{displayName}</span>
          <span className="before:content-['·'] before:mx-[0.2em] before:opacity-50">
            {config.text}
          </span>
        </div>
        {summaryMessage && toolState === "success" && (
          <div className="mt-[0.6em] p-[0.6em_0.8em] bg-[#f8fafc] border-l-[3px] border-l-accent rounded-r-[4px] text-[0.9em] text-[#334155] leading-normal">
            {summaryMessage}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-[0.8em] bg-white rounded-[0.5em] mb-4 shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <Textarea
          placeholder="픽스쳐 수정 요청을 입력하세요..."
          value={input}
          onValueChange={setInput}
          disabled={isLoading}
          onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === "Enter" && e.metaKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
        />
        {isLoading ? (
          <Button type="button" variant="destructive" onClick={stop}>
            Stop
          </Button>
        ) : (
          <Button type="submit" variant="default" disabled={!input.trim()}>
            Send
          </Button>
        )}
        <Button type="button" variant="outline" onClick={handleClear}>
          Clear
        </Button>
      </form>

      {renderStatus()}

      {errorMessage && (
        <div className="mt-[0.8em] p-[0.8em] bg-[#fff0f0] border border-[#ffccc7] rounded-[0.3em] text-[#cf1322] text-[0.9em] whitespace-pre-wrap">
          <AlertCircleIcon className="text-red-500" />
          {errorMessage}
        </div>
      )}
    </div>
  );
}
