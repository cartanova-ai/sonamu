import { useEffect, useState } from "react";
import {
  Segment,
  Form,
  TextArea,
  Button,
  Header,
  Popup,
} from "semantic-ui-react";
import { atom, useAtom } from "jotai";
import { SonamuUIService } from "../services/sonamu-ui.service";
import { defaultCatch } from "../services/sonamu.shared";
import { Entity, EntityJson } from "sonamu";

// Types
export type EnumJson = Entity["enumLabels"];
type ResponseType = EntityJson | EnumJson;
type AICreateFormState<T extends ResponseType> = {
  loading: boolean;
  response: T | null;
  type: "entity" | "enum";
  prevMessageId?: {
    entity?: string;
    enum?: string;
  };
};

// Atom
const aiCreateFormAtom = atom<AICreateFormState<ResponseType>>({
  loading: false,
  response: null,
  type: "entity",
});

type AICreateFormProps = {
  children: React.ReactNode;
  write?: () => void;
};
export default function AICreateForm({ children, write }: AICreateFormProps) {
  const [{ loading, type, response }, setAICreateFormState] =
    useAtom(aiCreateFormAtom);

  const [content, setContent] = useState("");

  const sendMessage = () => {
    if (!content) return;

    setAICreateFormState((prev) => ({
      ...prev,
      loading: true,
    }));

    SonamuUIService.chat(content)
      .then((res) => {
        const p = JSON.parse(res.content);
        setContent("");
        setAICreateFormState((prev) => ({
          ...prev,
          response: p,
          prevMessageId: {
            [type]: res.id,
          },
        }));
      })
      .catch(defaultCatch)
      .finally(() => {
        setAICreateFormState((prev) => ({
          ...prev,
          loading: false,
        }));
      });
  };

  const pressEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!loading && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearThread = () => {
    setAICreateFormState((prev) => ({
      ...prev,
      response: null,
      prevMessageId: undefined,
    }));
    SonamuUIService.clearThread().catch(defaultCatch);
  };

  useEffect(() => {
    const adjustHeight = () => {
      const textarea = document.getElementById(
        "dynamicTextarea"
      ) as HTMLTextAreaElement;
      if (!textarea) return;

      textarea.style.height = "auto";
      const computedStyle = window.getComputedStyle(textarea);
      const lineHeight = parseInt(computedStyle.lineHeight);
      const newHeight = Math.min(
        Math.max(textarea.scrollHeight, lineHeight),
        15 * lineHeight
      );
      textarea.style.height = `${newHeight}px`;
    };

    adjustHeight();
  }, [content]);

  useEffect(() => {
    setAICreateFormState((prev) => ({
      ...prev,
      type,
      response: null,
    }));

    // 컴포넌트 언마운트 시 초기화
    return () => {
      setAICreateFormState((prev) => ({
        ...prev,
        type,
        response: null,
      }));
    };
  }, []);

  return (
    <div className="create-ai-form">
      <Segment className="scrollable-content">
        <div className="header-row">
          <Header>Create With AI</Header>
          <div>
            <Popup
              content="Clear chat history"
              trigger={<Button icon="eraser" onClick={clearThread} />}
            />
            {write && (
              <Popup
                content={`Create ${type}`}
                trigger={
                  <Button
                    icon="plus"
                    onClick={write}
                    disabled={!loading && !response}
                  />
                }
              />
            )}
          </div>
        </div>
        <Segment className="response">{children}</Segment>
      </Segment>

      <div className="chat-form">
        <Form reply onSubmit={(e) => e.preventDefault()}>
          <TextArea
            onChange={(e) => setContent(e.target.value)}
            placeholder="Type your message..."
            onKeyPress={pressEnter}
            id="dynamicTextarea"
            rows={1}
            value={content}
          />
          <Button
            icon="send"
            primary
            loading={loading}
            type="submit"
            disabled={!content}
            onClick={sendMessage}
          />
        </Form>
      </div>
    </div>
  );
}

export function useAICreateForm<T extends ResponseType>({
  type,
}: {
  type: "entity" | "enum";
}) {
  const [state, setState] = useAtom(aiCreateFormAtom);

  useEffect(() => {
    setState((prev) => ({ ...prev, type }));

    if (!state.prevMessageId?.[type]) return;

    SonamuUIService.getMessage(state.prevMessageId[type] as string)
      .then((message) => {
        setState((prev) => ({
          ...prev,
          response: JSON.parse(message.content),
        }));
      })
      .catch(defaultCatch);
  }, []);

  return state as AICreateFormState<T>;
}
