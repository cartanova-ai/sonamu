import { List, Form, TextArea, Button, Dropdown } from "semantic-ui-react";
import { SonamuUIService } from "../../services/sonamu-ui.service";
import { useEffect, useRef, useState } from "react";
import { defaultCatch } from "../../services/sonamu.shared";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import themeList from "react-syntax-highlighter/dist/cjs/styles/prism";
import remarkGfm from "remark-gfm";
import { useNavigate } from "react-router-dom";

export type Message = {
  role: "user" | "assistant";
  content: string;
};

type ChatIndexProps = {};
export default function ChatIndex({}: ChatIndexProps) {
  const navigate = useNavigate();

  const { data: entitiesData } = SonamuUIService.useEntities();

  const [loading, setLoading] = useState(false);

  // API Key
  const [key, setKey] = useState("");
  const [config, setConfig] = useState({ threadId: "", apiKey: "" });

  // Chat
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState<string>("");

  // Theme
  const [theme, setTheme] = useState(localStorage.getItem("theme") ?? "cb");

  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const chatBoxRef = useRef<HTMLDivElement>(null);

  const setAPIKey = () => {
    setLoading(true);
    SonamuUIService.setOpenAIKey(key)
      .then(() => {
        setKey("");
        setConfig({ ...config, apiKey: key });
      })
      .catch(defaultCatch)
      .finally(() => setLoading(false));
  };

  const createThread = () => {
    SonamuUIService.createThread()
      .then(({ threadId }) => setConfig({ ...config, threadId }))
      .catch(defaultCatch);
  };

  const getMessages = () => {
    SonamuUIService.getMessages()
      .then(setMessages)
      .catch((e) => {
        console.log(e);
        if (e.message.includes("threadId")) {
          setMessages([]);
        }
      });
  };

  const sendMessage = () => {
    setLoading(true);
    setMessages([
      ...(messages ?? []),
      {
        role: "user",
        content: message,
      },
    ]);
    setMessage("");

    SonamuUIService.chat(message)
      .then(() => {
        const event = new EventSource(
          "http://localhost:57001/api/openai/chat",
          {
            withCredentials: true,
          }
        );

        event.addEventListener("end", () => {
          setLoading(false);
          event.close();
        });
        event.onmessage = (e) => {
          const data = e.data.replace(/\\n/g, "\n");

          setMessages((prev) => {
            const newMessages = [...prev];
            if (
              newMessages.length > 0 &&
              newMessages[newMessages.length - 1].role === "assistant"
            ) {
              newMessages[newMessages.length - 1].content += data;
            } else {
              newMessages.push({
                role: "assistant",
                content: data,
              });
            }
            return newMessages;
          });
        };
        event.onerror = function () {
          event.close();
        };
      })
      .catch(defaultCatch);
  };

  const writeEntity = (s: any) => {
    const entity = JSON.parse(s);
    if (!entity.table) {
      alert("테이블명이 누락되었습니다.");
      return;
    }

    SonamuUIService.createEntity(entity)
      .then(() => {
        const answer = confirm(
          "엔티티 파일이 생성되었습니다. 생성된 엔티티 페이지로 이동하시겠습니까?"
        );
        if (answer) {
          navigate(`/entities/${entity.id}`);
        }
      })
      .catch(defaultCatch);
  };

  const modifyProp = (s: any) => {
    const entity = JSON.parse(s);
    if (!entity.props) {
      alert("프로퍼티 정의가 누락되었습니다.");
      return;
    }

    const exProps = entitiesData?.entities.find(
      (e) => e.id === entity.id
    )?.props;
    if (!exProps) {
      alert("해당 엔티티가 존재하지 않습니다.");
      return;
    }

    // exProps에 존재하는 경우 수정
    // exProps에 존재하지 않는 경우 추가
    // exProps에 존재하는데 props에 존재하지 않는 경우 삭제
    entity.props.forEach((prop: any) => {
      const index = exProps.findIndex((e) => e.name === prop.name);
      if (index === -1) {
        SonamuUIService.createProp(entity.id, prop).catch(defaultCatch);
      } else {
        SonamuUIService.modifyProp(entity.id, prop, index)
          .then(() => {
            exProps.splice(index, 1);
          })
          .catch(defaultCatch);
      }
    });
    exProps.forEach((prop, i) => {
      const index = entity.props.findIndex((e: any) => e.name === prop.name);
      if (index === -1) {
        SonamuUIService.delProp(entity.id, i).catch(defaultCatch);
      }
    });
    alert("수정되었습니다.");
  };

  const modifyIndex = (s: any) => {
    const entity = JSON.parse(s);
    if (!entity.id) {
      alert("ID가 누락되었습니다.");
      return;
    }
    if (!entity.indexes) {
      alert("인덱스 정의가 누락되었습니다.");
      return;
    }

    SonamuUIService.modifyIndexes(entity.id, entity.indexes)
      .then(() => {
        alert("수정되었습니다.");
      })
      .catch(defaultCatch);
  };

  const modifySubset = (s: any) => {
    const entity = JSON.parse(s);
    if (!entity.id) {
      alert("ID가 누락되었습니다.");
      return;
    }
    if (!entity.subsets) {
      alert("서브셋 정의가 누락되었습니다.");
      return;
    }

    Object.keys(entity.subsets).forEach((subset) => {
      const subsetProps = entity.subsets[subset];
      SonamuUIService.modifySubset(entity.id, subset, subsetProps)
        .then(() => {
          alert("수정되었습니다.");
        })
        .catch(defaultCatch);
    });
  };

  const modifyEnum = (s: any) => {
    const entity = JSON.parse(s);
    if (!entity.id) {
      alert("ID가 누락되었습니다.");
      return;
    }
    if (!entity.enums) {
      alert("Enum 정의가 누락되었습니다.");
      return;
    }

    const exEnums = entitiesData?.entities.find(
      (e) => e.id === entity.id
    )?.enums;
    SonamuUIService.modifyEnumLabels(entity.id, {
      ...exEnums,
      ...entity.enums,
    })
      .then(() => {
        alert("수정되었습니다.");
      })
      .catch(defaultCatch);
  };

  useEffect(() => {
    SonamuUIService.getConfig().then(setConfig).catch(defaultCatch);
  }, []);

  useEffect(() => {
    if (!config.apiKey || !config.threadId) {
      return;
    }
    getMessages();
  }, [config]);

  useEffect(() => {
    const chatBox = chatBoxRef.current;
    if (!chatBox) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = chatBox;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10;
      setShouldAutoScroll(isAtBottom);
    };

    chatBox.addEventListener("scroll", handleScroll);

    if (shouldAutoScroll) {
      chatBox.scrollTop = chatBox.scrollHeight;
    }

    chatBox.removeEventListener("scroll", handleScroll);
  }, [messages]);

  return (
    <div className="chat">
      {!config.apiKey && (
        <Form>
          <label>OpenAI API Key</label>
          <input
            placeholder="OpenAI API Key"
            onChange={(e) => {
              setKey(e.target.value);
            }}
            value={key}
          />
          <Button
            content="Set API Key"
            labelPosition="left"
            icon="key"
            primary
            loading={loading}
            onClick={setAPIKey}
          />
        </Form>
      )}
      {config.apiKey && !config.threadId && (
        <Button
          content="Create Thread"
          labelPosition="left"
          icon="plus"
          primary
          loading={loading}
          onClick={createThread}
        />
      )}

      {config.apiKey && config.threadId && (
        <>
          <Dropdown
            placeholder="Select Theme"
            options={Object.keys(themeList).map((theme) => ({
              key: theme,
              text: theme,
              value: theme,
            }))}
            onChange={(_, { value }) => {
              setTheme(value as keyof typeof themeList);
              localStorage.setItem("theme", value as string);
            }}
            value={theme}
          />

          <div className="chat-box" ref={chatBoxRef}>
            <List className="chat-list">
              {messages.map((chat, index) => (
                <List.Item
                  key={index}
                  className={`chat-item ${chat.role === "user" ? "me" : ""}`}
                >
                  <ReactMarkdown
                    remarkPlugins={[[remarkGfm, { singleTilde: false }]]}
                    children={chat.content}
                    components={{
                      code(props) {
                        const { children, className, node, ref, ...rest } =
                          props;
                        const match = /language-(\w+)/.exec(className || "");
                        return match ? (
                          <>
                            <SyntaxHighlighter
                              {...rest}
                              style={
                                themeList[
                                  (theme as keyof typeof themeList) ?? "cb"
                                ]
                              }
                              PreTag="div"
                              language={match[1]}
                            >
                              {String(children)}
                            </SyntaxHighlighter>
                            {!loading &&
                              (entitiesData?.entities.length &&
                              entitiesData.entities.find((e) => {
                                const entity = JSON.parse(children as string);
                                return entity.id === e.id;
                              }) ? (
                                <>
                                  <Button onClick={() => modifyProp(children)}>
                                    Prop 수정
                                  </Button>
                                  <Button
                                    onClick={() => modifySubset(children)}
                                  >
                                    Subset 수정
                                  </Button>
                                  <Button onClick={() => modifyIndex(children)}>
                                    Index 수정
                                  </Button>
                                  <Button onClick={() => modifyEnum(children)}>
                                    Enum 수정
                                  </Button>
                                </>
                              ) : (
                                <Button onClick={() => writeEntity(children)}>
                                  엔티티 파일 생성
                                </Button>
                              ))}
                          </>
                        ) : (
                          <code
                            {...rest}
                            className={className}
                            style={{
                              backgroundColor: "rgba(0, 0, 0, 0.05)",
                              padding: "0.2em 0.5em",
                              borderRadius: "0.25em",
                            }}
                          >
                            {children}
                          </code>
                        );
                      },
                    }}
                  />
                </List.Item>
              ))}
            </List>
          </div>
          <Form reply className="chat-form">
            <div className="form-box">
              <TextArea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your message..."
              />
              <Button
                icon="send"
                primary
                loading={loading}
                onClick={sendMessage}
              />
            </div>
          </Form>
        </>
      )}
    </div>
  );
}
