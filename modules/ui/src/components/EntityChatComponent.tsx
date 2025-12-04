import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useState } from "react";
import { Button, Form, Icon, TextArea } from "semantic-ui-react";

type ToolState = "idle" | "running" | "success" | "error";

type EntityChatComponentProps = {
  onEntityCreated?: (entityId: string) => void;
  onEntityUpdated?: (entityId: string, updatedFields: string[]) => void;
};

export default function EntityChatComponent({
  onEntityCreated,
  onEntityUpdated,
}: EntityChatComponentProps) {
  const [input, setInput] = useState("");
  const [processedToolCallIds, setProcessedToolCallIds] = useState<Set<string>>(new Set());
  const [toolState, setToolState] = useState<ToolState>("idle");
  const [toolName, setToolName] = useState<string | null>(null);
  const [summaryMessage, setSummaryMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { messages, status, sendMessage, setMessages, stop } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/ai/entity/chat",
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
      console.log(msg);
      for (const part of msg.parts) {
        if (part.type === "step-start") {
          setToolState("running");
        }

        // "tool-"로 시작하는 모든 part 처리
        if (part.type.startsWith("tool-") && "state" in part && "toolCallId" in part) {
          const name = part.type.slice(5); // "tool-" 제거
          setToolName(name);

          if (part.state === "output-available" && !processedToolCallIds.has(part.toolCallId)) {
            // createEntity 도구 결과 처리
            if (part.type === "tool-createEntity" && "output" in part) {
              const result = part.output as { success: boolean; entityId: string };
              if (result?.success && result?.entityId && onEntityCreated) {
                onEntityCreated(result.entityId);
              }
            }

            // updateEntity 도구 결과 처리
            if (part.type === "tool-updateEntity" && "output" in part) {
              const result = part.output as {
                success: boolean;
                entityId: string;
                updatedFields: string[];
              };
              if (result?.success && result?.entityId && onEntityUpdated) {
                onEntityUpdated(result.entityId, result.updatedFields);
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
  }, [messages, onEntityCreated, onEntityUpdated, processedToolCallIds]);

  // status 변경 감시
  useEffect(() => {
    if (status === "ready" && toolState === "running") {
      setToolState("success");
    }
  }, [status, toolState]);

  const isLoading = status === "streaming" || status === "submitted";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    setToolState("idle");
    setErrorMessage(null);

    sendMessage({ text: input });
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
      running: { icon: "spinner", color: "#f59e0b", bg: "#fef3c7", text: "처리 중" },
      success: { icon: "check", color: "#10b981", bg: "#d1fae5", text: "완료" },
      error: { icon: "warning", color: "#ef4444", bg: "#fee2e2", text: "오류" },
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
          <Icon name={config.icon} loading={toolState === "running"} />
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
    <div className="entity-chat-compact">
      <Form onSubmit={handleSubmit} className="chat-input-form">
        <TextArea
          placeholder="Entity 또는 Enum 생성 요청을 입력하세요..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isLoading}
          rows={2}
          onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === "Enter" && e.metaKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
        />
        <div className="chat-buttons">
          {isLoading ? (
            <Button type="button" color="red" size="mini" onClick={stop}>
              Stop
            </Button>
          ) : (
            <Button type="submit" primary size="mini" disabled={!input.trim()}>
              Send
            </Button>
          )}
          <Button type="button" basic size="mini" onClick={handleClear}>
            Clear
          </Button>
        </div>
      </Form>

      {renderStatus()}

      {errorMessage && (
        <div className="chat-error-message">
          <Icon name="warning circle" color="red" />
          {errorMessage}
        </div>
      )}
    </div>
  );
}
