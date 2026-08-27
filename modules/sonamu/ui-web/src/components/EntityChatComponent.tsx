import { useChat } from "@ai-sdk/react";
import { Button, Textarea } from "@sonamu-kit/react-components";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";
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
  const [requestStartIndex, setRequestStartIndex] = useState(0);
  const processedToolCallIdsRef = useRef(new Set<string>());
  const [transportErrorMessage, setTransportErrorMessage] = useState<string | null>(null);

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
            // createEntity 도구 결과 처리
            if (part.type === "tool-createEntity" && "output" in part) {
              // SAFETY: createEntity 도구의 서버 응답 스키마는 성공 여부와 Entity ID를 함께 반환합니다.
              const result = part.output as { success: boolean; entityId: string };
              if (result?.success && result?.entityId && onEntityCreated) {
                onEntityCreated(result.entityId);
              }
            }

            // updateEntity 도구 결과 처리
            if (part.type === "tool-updateEntity" && "output" in part) {
              // SAFETY: updateEntity 도구의 서버 응답 스키마는 Entity ID와 변경 필드 배열을 반환합니다.
              const result = part.output as {
                success: boolean;
                entityId: string;
                updatedFields: string[];
              };
              if (result?.success && result?.entityId && onEntityUpdated) {
                onEntityUpdated(result.entityId, result.updatedFields);
              }
            }

            processedToolCallIdsRef.current.add(part.toolCallId);
          }
        }
      }
    }
  }, [messages, onEntityCreated, onEntityUpdated]);

  let toolState: ToolState = "idle";
  let toolName: string | null = null;
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
    }
  }

  if (status === "ready" && toolState === "running") toolState = "success";
  const errorMessage = transportErrorMessage ?? toolErrorMessage;

  const isLoading = status === "streaming" || status === "submitted";

  const handleSubmit = () => {
    if (!input.trim() || isLoading) return;

    setTransportErrorMessage(null);
    setRequestStartIndex(messages.length);

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
      <div className="max-h-[300px] overflow-y-auto text-[0.9em] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/10">
        <div
          className={`flex items-center gap-2 mb-2 text-text-muted text-[0.85em] ${toolState === "running" ? "text-[#fbbf24]" : ""} ${toolState === "success" ? "text-[#34d399]" : ""}`}
        >
          <div>
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
          <span className="font-mono bg-black/30 px-[0.4em] py-[0.1em] rounded">{displayName}</span>
          {toolState === "running" && <span>처리 중...</span>}
        </div>

        {errorMessage && (
          <div className="text-[#fca5a5] bg-red-500/10 p-[0.8em] rounded-lg border border-red-500/20 animate-fade-in">
            <CircleIcon className="inline-block mr-1" /> {errorMessage}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4 backdrop-blur-[10px]">
      {renderStatus()}

      <div className="relative bg-black/30 rounded-[20px] px-[0.8em] py-[0.2em] pl-[0.8em] pr-[0.5em] border border-white/10 transition-[border-color] duration-200 flex items-center focus-within:border-accent focus-within:bg-black/40">
        <Textarea
          placeholder="Entity 또는 Enum 생성 요청..."
          value={input}
          onValueChange={setInput}
          disabled={isLoading}
          rows={1}
          style={{ height: "auto", minHeight: "38px" }}
          className="flex-1 bg-transparent border-none text-white resize-none py-[0.6em] text-[0.95em] max-h-[100px] min-h-0 leading-[1.4] focus:outline-none placeholder:text-white/30"
          onInput={(e) => {
            const target = e.currentTarget;
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
        <div className="flex items-center ml-[0.3em]">
          {isLoading ? (
            <Button
              icon={<StopCircleIcon />}
              className="m-0 p-[0.5em] shadow-none!"
              size="xs"
              onClick={stop}
              variant="ghost"
            />
          ) : (
            <Button
              icon={<SendIcon />}
              className={`m-0 p-[0.5em] shadow-none! ${input.trim() ? "text-accent! bg-accent/10!" : "text-text-muted!"}`}
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
