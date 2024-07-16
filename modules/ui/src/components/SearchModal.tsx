import React, { useState, useEffect } from "react";
import { Modal, Input, List } from "semantic-ui-react";
import { useNavigate } from "react-router-dom";
import _ from "lodash";
import { SonamuUIService } from "../services/sonamu-ui.service";
import { SearchResult, useEntitySearch } from "./useEntitySearch";

type SearchModalProps = {
  open: boolean;
  onClose: () => void;
};
export default function SearchModal({ open, onClose }: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const navigate = useNavigate();

  const { data, error, mutate } = SonamuUIService.useEntities();
  const { entities: documents } = data ?? {};

  const { search, setSearchItems } = useEntitySearch({
    items: documents,
    ngramSize: 2,
  });

  const handleResultClick = (url: string, id?: string) => {
    setQuery("");
    setResults([]);
    onClose();
    navigate(url);
    if (id) {
      scrollToElement(id);
    }
  };

  const scrollToElement = (id: string) => {
    const interval = setInterval(() => {
      const element = document.getElementById(id);
      if (element) {
        element.scrollIntoView({ behavior: "instant", block: "center" });
        element.style.backgroundColor = "yellow";
        setTimeout(() => {
          element.style.backgroundColor = "";
          element.style.transition = "background-color 1s";
        }, 1000);
        clearInterval(interval);
      }
    }, 100);
  };

  const highlightText = (target: string, query: string) => {
    if (!query) return target;

    const escapedQuery = query.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    const regex = new RegExp(`[${escapedQuery}]`, "gi");

    return target.replace(
      regex,
      (match) => `<span style="color: green;">${match}</span>`
    );
  };

  useEffect(() => {
    if (documents) {
      const entity = window.location.pathname.split("/entities/")[1];
      setSearchItems(Object.assign([], documents));
      setResults(search(query, entity));
    }
  }, [query]);

  return (
    <Modal
      className="search-modal"
      open={open}
      onClose={() => {
        setQuery("");
        setResults([]);
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
                className="search-result"
              >
                <div
                  className="click-item"
                  onClick={() => handleResultClick(`/entities/${result.id}`)}
                >
                  <List.Header
                    dangerouslySetInnerHTML={{
                      __html: highlightText(result.id, query),
                    }}
                  />
                  <List.Description
                    dangerouslySetInnerHTML={{
                      __html: highlightText(result.title, query),
                    }}
                  />
                </div>

                {!!fields?.filter((f) => f.type === "scaffolding")?.length && (
                  <List.Description
                    className="click-item sub-item"
                    onClick={() => handleResultClick("/scaffolding", result.id)}
                  >
                    <strong
                      dangerouslySetInnerHTML={{
                        __html: highlightText(
                          `Scaffolding > ${result.id}(${result.title})`,
                          query
                        ),
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
                      {fields?.map((field) => {
                        if (field.type !== "props") return;

                        return (
                          <List.Description
                            key={field.key}
                            dangerouslySetInnerHTML={{
                              __html: highlightText(
                                `${field.key}(${field.desc})`,
                                query
                              ),
                            }}
                            className="click-item sub-item"
                            onClick={() =>
                              handleResultClick(
                                `/entities/${result.id}`,
                                `prop-${field.key}`
                              )
                            }
                          />
                        );
                      })}
                    </div>
                  )}

                  {!!fields?.filter((f) => f.type === "subsets")?.length &&
                    _(fields?.filter((f) => f.type === "subsets"))
                      .groupBy("key")
                      .map((group, key) => {
                        return (
                          <div key={key} className="sub-item">
                            <List.Description>
                              <strong>{`Subset${key} >`}</strong>
                            </List.Description>
                            {group.map((field) => (
                              <List.Description
                                key={field.desc}
                                dangerouslySetInnerHTML={{
                                  __html: highlightText(field.desc, query),
                                }}
                                className="click-item sub-item"
                                onClick={() =>
                                  handleResultClick(
                                    `/entities/${result.id}`,
                                    field.desc
                                  )
                                }
                              />
                            ))}
                          </div>
                        );
                      })
                      .value()}

                  {!!fields?.filter((f) => f.type === "enums")?.length && (
                    <div className="sub-item">
                      <List.Description>
                        <strong>{"enums >"}</strong>
                      </List.Description>
                      {fields?.map((field) => {
                        if (field.type !== "enums") return;

                        return (
                          <List.Description
                            key={field.key}
                            dangerouslySetInnerHTML={{
                              __html: highlightText(field.key, query),
                            }}
                            className="click-item sub-item"
                            onClick={() =>
                              handleResultClick(
                                `/entities/${result.id}`,
                                `enum-${field.key}`
                              )
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
