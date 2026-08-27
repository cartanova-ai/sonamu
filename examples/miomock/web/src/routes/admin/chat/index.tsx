import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from "@sonamu-kit/react-components/components";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import MessageCircleIcon from "~icons/lucide/message-circle";
import SendIcon from "~icons/lucide/send";

import { authClient } from "@/contexts/sonamu-provider";
import { SD } from "@/i18n/sd.generated";
import { type ChatMessage, type ChatUser } from "@/services/chat/chat.types";
import { ChatService } from "@/services/services.generated";

export const Route = createFileRoute("/admin/chat/")({
  head: () => ({
    meta: [{ title: "Chat" }, { name: "description", content: "Realtime chat room" }],
  }),
  component: ChatPage,
});

const TYPING_IDLE_MS = 2000;

function ChatPage() {
  const session = authClient.useSession();
  const me = session.data?.user ?? null;
  const navigate = useNavigate();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typingUsers, setTypingUsers] = useState<ChatUser[]>([]);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  const localIdRef = useRef(0);

  const channel = ChatService.useSubscribeChat(
    {},
    {
      newMessage: (msg) => {
        setMessages((prev) => [...prev, { ...msg, id: msg.id || --localIdRef.current }]);
      },
      typingUsers: (users) => {
        setTypingUsers(users);
      },
    },
    { enabled: !!me },
  );

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  });

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, []);

  const stopTypingNow = () => {
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    if (isTypingRef.current) {
      channel.send("typing", { active: false });
      isTypingRef.current = false;
    }
  };

  const handleSend = () => {
    const trimmed = draft.trim();
    if (!trimmed || channel.readyState !== WebSocket.OPEN) return;
    channel.send("send", { content: trimmed });
    setDraft("");
    stopTypingNow();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDraft(value);

    if (channel.readyState !== WebSocket.OPEN) return;

    if (value.trim()) {
      if (!isTypingRef.current) {
        channel.send("typing", { active: true });
        isTypingRef.current = true;
      }
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(stopTypingNow, TYPING_IDLE_MS);
    } else {
      stopTypingNow();
    }
  };

  const othersTyping = typingUsers.filter((u) => u.id !== me?.id);

  if (!me) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-6 py-6">
          <Card className="border-border/40 shadow-sm">
            <CardContent className="p-10 text-center space-y-4">
              <p className="text-sm text-muted-foreground">{SD("dashboard.loginRequired")}</p>
              <Button variant="secondary" onClick={() => navigate({ to: "/admin/login" })}>
                {SD("common.login")}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden">
      <div className="h-full max-w-3xl mx-auto px-6 py-6 flex flex-col">
        <Card className="border-border/40 shadow-sm flex-1 flex flex-col min-h-0">
          <CardHeader className="px-5 py-3 border-b border-gray-100 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageCircleIcon className="h-4 w-4" />
              <CardTitle className="text-sm font-medium leading-none m-0">
                {SD("menu.chat")}
              </CardTitle>
            </div>
            <WebSocketStatus readyState={channel.readyState} />
          </CardHeader>

          <CardContent className="p-0 flex-1 flex flex-col min-h-0">
            <div ref={listRef} className="flex-1 overflow-auto px-5 py-4 space-y-3">
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10">
                  메시지를 시작해보세요
                </p>
              ) : (
                messages.map((msg) => (
                  <MessageRow key={msg.id} message={msg} isMine={msg.user.id === me.id} />
                ))
              )}
            </div>

            <div className="px-5 h-5 text-xs text-muted-foreground border-t border-gray-100 flex items-center">
              {othersTyping.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <TypingDots />
                  {formatTyping(othersTyping)}
                </span>
              )}
            </div>

            <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-2">
              <Input
                className="h-10"
                placeholder={
                  channel.readyState === WebSocket.OPEN ? "메시지를 입력하세요" : "연결 중..."
                }
                value={draft}
                onChange={handleChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                maxLength={2000}
                disabled={channel.readyState !== WebSocket.OPEN}
              />
              <Button
                onClick={handleSend}
                disabled={!draft.trim() || channel.readyState !== WebSocket.OPEN}
                icon={<SendIcon />}
              >
                전송
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function formatTyping(users: ChatUser[]): string {
  if (users.length === 1) return `${users[0].name}님이 입력 중`;
  if (users.length === 2) return `${users[0].name}, ${users[1].name}님이 입력 중`;
  return `${users[0].name}님 외 ${users.length - 1}명이 입력 중`;
}

function MessageRow({ message, isMine }: { message: ChatMessage; isMine: boolean }) {
  const time = new Date(message.created_at).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className={`flex gap-2 ${isMine ? "flex-row-reverse" : "flex-row"}`}>
      <Avatar user={message.user} />
      <div className={`flex flex-col max-w-[70%] ${isMine ? "items-end" : "items-start"}`}>
        {!isMine && (
          <span className="text-xs text-muted-foreground mb-0.5 px-1">{message.user.name}</span>
        )}
        <div className={`flex items-end gap-1.5 ${isMine ? "flex-row-reverse" : "flex-row"}`}>
          <div
            className={`px-3 py-2 rounded-2xl text-sm break-words whitespace-pre-wrap ${
              isMine ? "bg-gray-900 text-white" : "bg-gray-100 text-foreground"
            }`}
          >
            {message.content}
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{time}</span>
        </div>
      </div>
    </div>
  );
}

function Avatar({ user }: { user: ChatUser }) {
  const initial = user.name.charAt(0).toUpperCase();
  if (user.image) {
    return (
      <img
        src={user.image}
        alt={user.name}
        className="h-7 w-7 rounded-full object-cover shrink-0"
      />
    );
  }
  return (
    <div className="h-7 w-7 rounded-full bg-gray-200 text-gray-700 text-xs font-medium flex items-center justify-center shrink-0">
      {initial}
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex gap-0.5">
      <span className="h-1 w-1 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.3s]" />
      <span className="h-1 w-1 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.15s]" />
      <span className="h-1 w-1 bg-muted-foreground rounded-full animate-bounce" />
    </span>
  );
}

function WebSocketStatus({ readyState }: { readyState: number }) {
  const config =
    readyState === WebSocket.OPEN
      ? { color: "bg-emerald-500", label: "연결됨", pulse: false }
      : readyState === WebSocket.CONNECTING
        ? { color: "bg-amber-500", label: "연결 중", pulse: true }
        : readyState === WebSocket.CLOSING
          ? { color: "bg-orange-500", label: "종료 중", pulse: true }
          : { color: "bg-red-500", label: "연결 끊김", pulse: false };

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
      title={`WebSocket: ${config.label}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        {config.pulse && (
          <span
            className={`absolute inline-flex h-full w-full rounded-full ${config.color} opacity-60 animate-ping`}
          />
        )}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${config.color}`} />
      </span>
      {config.label}
    </span>
  );
}
