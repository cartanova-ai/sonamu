// components/ChatComponent.tsx
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";
import { Button, Form, Segment, TextArea } from "semantic-ui-react";

export default function ChatComponent() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");

  const { messages, status, sendMessage, setMessages, stop } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/openai/chat/stream",
    }),
  });

  const isLoading = status === "streaming" || status === "submitted";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    sendMessage({ text: input });
    setInput("");
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // messages 변경 시 스크롤 (별도 useEffect)
  const messagesLength = messages.length;
  useEffect(() => {
    console.log(messagesLength);
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesLength]);

  return (
    <div className="chat-container">
      <div className="messages-container">
        {messages.map((msg) => (
          <Segment key={msg.id} className={`message ${msg.role}`}>
            <strong>{msg.role === "user" ? "You" : "Assistant"}</strong>
            <div style={{ whiteSpace: "pre-wrap" }}>
              {msg.parts.map((part, index) => {
                switch (part.type) {
                  case "text":
                    return <span key={index}>{part.text}</span>;
                  case "reasoning":
                    return (
                      <details key={index} className="reasoning">
                        <summary>Thinking...</summary>
                        <p>{part.text}</p>
                      </details>
                    );
                  default:
                    return null;
                }
              })}
            </div>
          </Segment>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <Form onSubmit={handleSubmit} className="input-form">
        <TextArea
          value={input}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
          placeholder="메시지를 입력하세요..."
          disabled={isLoading}
          rows={2}
        />
        <div className="button-group">
          <Button type="button" onClick={() => setMessages([])}>
            Clear
          </Button>
          {isLoading ? (
            <Button type="button" color="red" onClick={stop}>
              Stop
            </Button>
          ) : (
            <Button type="submit" primary disabled={!input.trim()}>
              Send
            </Button>
          )}
        </div>
      </Form>
    </div>
  );
}
