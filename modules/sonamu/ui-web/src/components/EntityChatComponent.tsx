import { useChat } from "@ai-sdk/react";
import { Button, Textarea } from "@sonamu-kit/react-components";
import { DefaultChatTransport } from "ai";
import { useEffect, useState } from "react";
import AlertCircleIcon from "~icons/lucide/alert-circle";
import CheckCircleIcon from "~icons/lucide/check-circle";
import CircleIcon from "~icons/lucide/circle";
import Loader2Icon from "~icons/lucide/loader-2";
import MessageCircleIcon from "~icons/lucide/message-circle";
import SendIcon from "~icons/lucide/send";
import StopCircleIcon from "~icons/lucide/stop-circle";

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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { messages, status, sendMessage, stop } = useChat({
    // @ts-expect-error TODO: fix this (ai-sdk stable/beta 이슈)
    transport: new DefaultChatTransport({
      api: "/sonamu-ui/api/ai/entity/chat",
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
      }
    }

    if (hasError) {
      setToolState("error");
      setErrorMessage(errorText);
    }
  }, [messages, onEntityCreated, onEntityUpdated, processedToolCallIds]);

  // status 변경 감시
  useEffect(() => {
    if (status === "ready" && toolState === "running") {
      setToolState("success");
    }
  }, [status, toolState]);

  const isLoading = status === "streaming" || status === "submitted";

  const handleSubmit = () => {
    if (!input.trim() || isLoading) return;

    setToolState("idle");
    setErrorMessage(null);

    sendMessage({ text: input });
    setInput("");
  };

  const renderStatus = () => {
    if (toolState === "idle" && !errorMessage) return null;

    const displayName = toolName ?? "AI Assistant";

    const statusConfig = {
      idle: { color: "#9ca3af" },
      running: { color: "#fbbf24" },
      success: { color: "#34d399" },
      error: { color: "#f87171" },
    } as const;

    const config = statusConfig[toolState];

    return (
      <div className="chat-response-area">
        <div className={`status-header ${toolState}`}>
          <div className="status-icon">
            {toolState === "idle" && (
              <MessageCircleIcon style={{ color: config.color, margin: 0 }} />
            )}
            {toolState === "running" && (
              <Loader2Icon className="animate-spin" style={{ color: config.color, margin: 0 }} />
            )}
            {toolState === "success" && (
              <CheckCircleIcon style={{ color: config.color, margin: 0 }} />
            )}
            {toolState === "error" && (
              <AlertCircleIcon style={{ color: config.color, margin: 0 }} />
            )}
          </div>
          <span className="tool-name">{displayName}</span>
          {toolState === "running" && <span className="status-text">처리 중...</span>}
        </div>

        {errorMessage && (
          <div className="error-message animate-fade-in">
            <CircleIcon className="inline-block mr-1" /> {errorMessage}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="entity-ai-chat">
      {renderStatus()}

      <div className="chat-input-wrapper">
        <Textarea
          placeholder="Entity 또는 Enum 생성 요청..."
          value={input}
          onValueChange={setInput}
          disabled={isLoading}
          rows={1}
          style={{ height: "auto", minHeight: "38px" }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = "auto";
            target.style.height = `${Math.min(target.scrollHeight, 100)}px`;
          }}
          onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        <div className="action-buttons">
          {isLoading ? (
            <Button
              icon={<StopCircleIcon />}
              className="stop-btn"
              size="xs"
              onClick={stop}
              variant="ghost"
            />
          ) : (
            <Button
              icon={<SendIcon />}
              className={`send-btn ${input.trim() ? "active" : ""}`}
              size="xs"
              onClick={handleSubmit}
              disabled={!input.trim()}
              variant="ghost"
            />
          )}
        </div>
      </div>
    </div>
  );
}
