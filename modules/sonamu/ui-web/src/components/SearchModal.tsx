import assert from "assert";
import { group } from "radashi";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input, List, Modal } from "semantic-ui-react";
import { SonamuUIService } from "../services/sonamu-ui.service";
import { type SearchResult, useEntitySearch } from "./useEntitySearch";

type SearchModalProps = {
  open: boolean;
  onClose: () => void;
};
export default function SearchModal({ open, onClose }: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1); // 현재 선택된 검색 결과의 인덱스
  const [selectedIndex2, setSelectedIndex2] = useState(-1); // 현재 선택된 검색 결과의 하위인덱스

  const navigate = useNavigate();

  const { data } = SonamuUIService.useEntities();
  const { entities: documents } = data ?? {};

  const { search, setSearchItems } = useEntitySearch({
    items: documents,
    ngramSize: 2,
  });

  const resetIndex = () => {
    setSelectedIndex(-1);
    setSelectedIndex2(-1);
  };

  const handleResultClick = (url: string, id?: string) => {
    setQuery("");
    setResults([]);
    resetIndex();
    onClose();
    navigate(url);
    if (id) {
      scrollToElement(id);
    }
  };

  const scrollToElement = (id: string) => {
    // 메모리 누수 방지: 최대 30번(3초) 시도 후 포기
    const MAX_ATTEMPTS = 30;
    let attempts = 0;

    const interval = setInterval(() => {
      attempts++;
      const element = document.getElementById(id);

      if (element) {
        element.scrollIntoView({ behavior: "instant", block: "center" });
        element.style.backgroundColor = "yellow";
        setTimeout(() => {
          element.style.backgroundColor = "";
          element.style.transition = "background-color 1s";
        }, 1000);
        clearInterval(interval);
      } else if (attempts >= MAX_ATTEMPTS) {
        // 최대 시도 횟수 초과시 interval 정리
        clearInterval(interval);
      }
    }, 100);
  };

  /**
   * XSS 방지를 위해 HTML 특수 문자를 이스케이프합니다.
   */
  const escapeHtml = (text: string): string => {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

  const highlightText = (target: string, query: string) => {
    // XSS 방지: 먼저 HTML 이스케이프 처리
    const escapedTarget = escapeHtml(target);
    if (!query) return escapedTarget;

    const escapedQuery = query.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    const regex = new RegExp(`[${escapedQuery}]`, "gi");

    return escapedTarget.replace(regex, (match) => `<span style="color: green;">${match}</span>`);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: query 변경시에만
  useEffect(() => {
    if (documents) {
      const entity = window.location.pathname.split("/entities/")[1];
      resetIndex();
      setSearchItems(Object.assign([], documents));
      setResults(search(query, entity));
    }
  }, [query]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: handleResultClick 함수는 컴포넌트가 마운트될 때만 등록되어야 함
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!open) return;

      switch (event.key) {
        case "ArrowDown":
          if (selectedIndex !== -1) {
            setSelectedIndex2((prevIndex2) =>
              prevIndex2 < results[selectedIndex].fields.length - 1 ? prevIndex2 + 1 : prevIndex2,
            );
          }
          setSelectedIndex((prevIndex) => {
            if (prevIndex === -1) {
              return results.length > 0 ? 0 : -1;
            }
            if (results[prevIndex].fields.length === selectedIndex2 + 1) {
              setSelectedIndex2(-1);
              return prevIndex < results.length - 1 ? prevIndex + 1 : 0;
            }

            return prevIndex;
          });
          break;
        case "ArrowUp":
          setSelectedIndex((prevIndex) => {
            let nextIndex = prevIndex;
            if (prevIndex === -1) {
              nextIndex = results.length > 0 ? results.length - 1 : -1;
            }
            if (selectedIndex2 === -1) {
              nextIndex = prevIndex > 0 ? prevIndex - 1 : results.length - 1;
            }

            setSelectedIndex2((prevIndex2) => {
              if (results.length === 0) return -1;
              if (prevIndex2 === -1) {
                return results[nextIndex > -1 ? nextIndex : results.length - 1].fields.length - 1;
              }
              return prevIndex2 - 1;
            });

            return nextIndex;
          });
          break;
        case "Enter":
          if (selectedIndex >= 0 && selectedIndex < results.length) {
            const result = results[selectedIndex];
            if (selectedIndex2 === -1) {
              handleResultClick(`/entities/${result.item.id}`);
            }

            const field = result.fields[selectedIndex2];
            if (field.type === "scaffolding") {
              handleResultClick("/scaffolding", result.item.id);
            } else {
              handleResultClick(`/entities/${result.item.id}`, field.id);
            }
          }
          break;
        default:
          break;
      }
    },
    [open, results, selectedIndex, selectedIndex2],
  );

  const getResultDescriptions = (result: SearchResult["item"], fields: SearchResult["fields"]) => {
    const grouped = Object.entries(
      group(
        fields?.filter((f) => f.type === "subsets"),
        (field) => field.key,
      ),
    ).filter(([_, value]) => value !== undefined);
    return grouped.map(([key, group], index) => {
      assert(group);
      return (
        <div key={key} className="sub-item">
          <List.Description>
            <strong>{`Subset${key} >`}</strong>
          </List.Description>
          {group.map((field) => (
            <List.Description
              key={field.desc}
              // biome-ignore lint/security/noDangerouslySetInnerHtml: 허용
              dangerouslySetInnerHTML={{
                __html: highlightText(field.desc, query),
              }}
              className={`click-item sub-item ${
                index === selectedIndex &&
                selectedIndex2 !== -1 &&
                selectedIndex2 === fields.indexOf(field)
                  ? "selected"
                  : ""
              }`}
              onClick={() => handleResultClick(`/entities/${result.id}`, field.desc)}
            />
          ))}
        </div>
      );
    });
  };

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  return (
    <Modal
      className="search-modal"
      open={open}
      onClose={() => {
        setQuery("");
        setResults([]);
        resetIndex();
        onClose();
      }}
    >
      <Modal.Content>
        <Input
          icon="search"
          placeholder="Search docs"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value.toLowerCase());
          }}
          fluid
          autoFocus
        />
        {results.length > 0 && (
          <List selection>
            {results.map(({ item: result, fields }, index) => (
              <List.Item
                key={`${result.id}-${index}`}
                className={`search-result ${
                  index === selectedIndex && selectedIndex2 === -1 ? "selected" : ""
                }`}
              >
                <button
                  type="button"
                  className="click-item"
                  onClick={() => handleResultClick(`/entities/${result.id}`)}
                >
                  <List.Header
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: 허용
                    dangerouslySetInnerHTML={{
                      __html: highlightText(result.id, query),
                    }}
                  />
                  <List.Description
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: 허용
                    dangerouslySetInnerHTML={{
                      __html: highlightText(result.title, query),
                    }}
                  />
                </button>

                {!!fields?.filter((f) => f.type === "scaffolding")?.length && (
                  <List.Description
                    className={`click-item sub-item ${
                      index === selectedIndex && selectedIndex2 !== -1 && selectedIndex2 === 0
                        ? "selected"
                        : ""
                    }`}
                    onClick={() => handleResultClick("/scaffolding", result.id)}
                  >
                    <strong
                      // biome-ignore lint/security/noDangerouslySetInnerHtml: 허용
                      dangerouslySetInnerHTML={{
                        __html: highlightText(`Scaffolding > ${result.id}(${result.title})`, query),
                      }}
                    />
                  </List.Description>
                )}

                <div>
                  {!!fields?.filter((f) => f.type === "props")?.length && (
                    <div className="sub-item">
                      <List.Description>
                        <strong>{"props >"}</strong>
                      </List.Description>
                      {fields?.map((field, fieldIndex) => {
                        if (field.type !== "props") return <>&nbsp;</>;

                        return (
                          <List.Description
                            key={field.key}
                            // biome-ignore lint/security/noDangerouslySetInnerHtml: 허용
                            dangerouslySetInnerHTML={{
                              __html: highlightText(`${field.key}(${field.desc})`, query),
                            }}
                            className={`click-item sub-item ${
                              index === selectedIndex &&
                              selectedIndex2 !== -1 &&
                              selectedIndex2 === fieldIndex
                                ? "selected"
                                : ""
                            }`}
                            onClick={() =>
                              handleResultClick(`/entities/${result.id}`, `prop-${field.key}`)
                            }
                          />
                        );
                      })}
                    </div>
                  )}

                  {!!fields?.filter((f) => f.type === "subsets")?.length &&
                    getResultDescriptions(result, fields)}

                  {!!fields?.filter((f) => f.type === "enums")?.length && (
                    <div className="sub-item">
                      <List.Description>
                        <strong>{"enums >"}</strong>
                      </List.Description>
                      {fields?.map((field) => {
                        if (field.type !== "enums") return <>&nbsp;</>;

                        return (
                          <List.Description
                            key={field.key}
                            // biome-ignore lint/security/noDangerouslySetInnerHtml: 허용
                            dangerouslySetInnerHTML={{
                              __html: highlightText(field.key, query),
                            }}
                            className={`click-item sub-item ${
                              index === selectedIndex &&
                              selectedIndex2 !== -1 &&
                              selectedIndex2 === fields.indexOf(field)
                                ? "selected"
                                : ""
                            }`}
                            onClick={() =>
                              handleResultClick(`/entities/${result.id}`, `enum-${field.key}`)
                            }
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              </List.Item>
            ))}
          </List>
        )}
      </Modal.Content>
    </Modal>
  );
}
