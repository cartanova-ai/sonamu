// components/ChatComponent.tsx
import { useChat } from "@ai-sdk/react";
import { Button, Textarea } from "@sonamu-kit/react-components";
import { DefaultChatTransport } from "ai";
import { useEffect, useState } from "react";
import type { FixtureRecord } from "sonamu";
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
  const [processedToolCallIds, setProcessedToolCallIds] = useState<Set<string>>(new Set());
  const [toolState, setToolState] = useState<ToolState>("idle");
  const [toolName, setToolName] = useState<string | null>(null);
  const [summaryMessage, setSummaryMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
        setErrorMessage(
          "API Key 설정이 필요합니다. process.env.ANTHROPIC_API_KEY 설정 후 다시 시도하세요.",
        );
      } else {
        setErrorMessage(err.message);
      }
    },
  });

  // messages에서 tool result 감시
  useEffect(() => {
    let hasError = false;
    let errorText: string | null = null;
    let lastAssistantText: string | null = null;

    for (const msg of messages) {
      for (const part of msg.parts) {
        if (part.type === "step-start") {
          setToolState("running");
        }

        // "tool-"로 시작하는 모든 part 처리
        if (part.type.startsWith("tool-") && "state" in part && "toolCallId" in part) {
          const name = part.type.slice(5); // "tool-" 제거
          setToolName(name);

          if (part.state === "output-available" && !processedToolCallIds.has(part.toolCallId)) {
            // updateFixtures 또는 createFixtures 도구인 경우 결과 처리
            if (
              (part.type === "tool-updateFixtures" || part.type === "tool-createFixtures") &&
              "output" in part
            ) {
              const result = part.output as { success: boolean; updatedRecords: FixtureRecord[] };
              if (result?.success && result?.updatedRecords && onUpdateFixtures) {
                onUpdateFixtures(result.updatedRecords);
              }
            }
            setProcessedToolCallIds((prev) => new Set([...prev, part.toolCallId]));
            setToolState("success");
          } else if (part.state === "output-error") {
            hasError = true;
            errorText = ("errorText" in part ? part.errorText : null) ?? "알 수 없는 오류";
          }
        }

        // assistant의 text 메시지 캡처
        if (msg.role === "assistant" && part.type === "text" && part.text.trim()) {
          lastAssistantText = part.text;
        }
      }
    }

    if (hasError) {
      setToolState("error");
      setErrorMessage(errorText);
    }

    setSummaryMessage(lastAssistantText);
  }, [messages, onUpdateFixtures, processedToolCallIds]);

  // status 변경 감시
  useEffect(() => {
    if (status === "ready" && toolState === "running") {
      // streaming 완료 후에도 running이면 성공으로 처리
      setToolState("success");
    }
  }, [status, toolState]);

  const isLoading = status === "streaming" || status === "submitted";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    if (!fixtureRecords || fixtureRecords.length === 0) {
      setErrorMessage("픽스쳐 레코드가 없습니다. 픽스쳐 조회 후 시도하세요.");
      return;
    }

    setToolState("idle");
    setErrorMessage(null);
    sendMessage({ text: input }, { body: { fixtureRecords } });
    setInput("");
  };

  const handleClear = () => {
    setMessages([]);
    setToolState("idle");
    setToolName(null);
    setSummaryMessage(null);
    setErrorMessage(null);
    setProcessedToolCallIds(new Set());
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
      <div className="chat-status">
        <div
          className="chat-status-badge"
          style={{
            backgroundColor: config.bg,
            color: config.color,
            ...(toolState === "running" && { alignItems: "center" }),
          }}
        >
          {toolState === "running" && <Loader2Icon className="animate-spin" />}
          {toolState === "success" && <CheckIcon />}
          {toolState === "error" && <AlertCircleIcon />}
          <span className="chat-status-tool">{displayName}</span>
          <span className="chat-status-text">{config.text}</span>
        </div>
        {summaryMessage && toolState === "success" && (
          <div className="chat-summary">{summaryMessage}</div>
        )}
      </div>
    );
  };

  return (
    <div className="chat-compact">
      <form onSubmit={handleSubmit} className="ui form chat-input-form">
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
        <div className="chat-error-message">
          <AlertCircleIcon className="text-red-500" />
          {errorMessage}
        </div>
      )}
    </div>
  );
}
