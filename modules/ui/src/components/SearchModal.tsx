import React, { useState, useEffect } from "react";
import { Modal, Input, List } from "semantic-ui-react";
import { useNavigate } from "react-router-dom";
import { ExtendedEntity, SonamuUIService } from "../services/sonamu-ui.service";

type SearchModalProps = {
  open: boolean;
  onClose: () => void;
};
export default function SearchModal({ open, onClose }: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ExtendedEntity[]>([]);
  const navigate = useNavigate();

  const { data, error, mutate } = SonamuUIService.useEntities();
  const { entities: documents } = data ?? {};

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

  const highlightText = (text: string, query: string) => {
    if (!query) return text;
    const regex = new RegExp(`(${query})`, "gi");
    return text.replace(regex, '<span style="color: green;">$1</span>');
  };

  const searchDocuments = (documents: ExtendedEntity[]): ExtendedEntity[] => {
    if (!query) return [];

    const isMatch = (subset: string[]) =>
      subset.some((item) => item.toLowerCase().includes(query));
    const isMatchEntity = ({ id, title }: ExtendedEntity) =>
      id.toLowerCase().includes(query) || title.toLowerCase().includes(query);
    const isMatchProp = ({ name, desc }: ExtendedEntity["props"][0]) =>
      name.toLowerCase().includes(query) || desc?.toLowerCase().includes(query);
    const isMatchEnum = (enumLabel: ExtendedEntity["enumLabels"][0]) =>
      Object.entries(enumLabel).some(
        ([key, value]) =>
          key.toLowerCase().includes(query) ||
          value.toLowerCase().includes(query)
      );

    return documents
      .filter(
        (doc) =>
          isMatchEntity(doc) ||
          doc.props.some((prop) => isMatchProp(prop)) ||
          Object.values(doc.subsets).some((subset) => isMatch(subset)) ||
          Object.entries(doc.enumLabels).some(
            ([enumId, enumLabels]) =>
              enumId.toLowerCase().includes(query) || isMatchEnum(enumLabels)
          )
      )
      .map((doc) => {
        doc.props = doc.props.filter((prop) => isMatchProp(prop));
        doc.subsets = Object.fromEntries(
          Object.entries(doc.subsets).map(([subsetName, subset]) => [
            subsetName,
            subset.filter((item) => isMatch([item])),
          ])
        );
        doc.enumLabels = Object.fromEntries(
          Object.entries(doc.enumLabels)
            .filter(
              ([enumId, enumLabels]) =>
                enumId.toLowerCase().includes(query) ||
                Object.entries(enumLabels).some(([key, value]) =>
                  isMatch([key, value])
                )
            )
            .map(([enumId, enumLabels]) => [
              enumId,
              Object.fromEntries(
                Object.entries(enumLabels).filter(([key, value]) =>
                  isMatch([key, value])
                )
              ),
            ])
        );
        return doc;
      })
      .sort((a, b) => {
        // Entity 정보에 query가 포함되어 있는 경우 우선순위를 높게 함
        // EntityId가 query와 일치하는 경우 우선순위를 가장 높게 함
        if (a.id.toLowerCase() === query) return -1;
        if (b.id.toLowerCase() === query) return 1;

        const aMatch = isMatchEntity(a);
        const bMatch = isMatchEntity(b);
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
        return 0;
      });
  };

  useEffect(() => {
    if (documents) {
      setResults(searchDocuments(documents));
    }
  }, [query, documents]);

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
            {results.map((result) => (
              <List.Item key={result.id} className="search-result">
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

                {(result.id.toLowerCase().includes(query) ||
                  result.title.toLowerCase().includes(query)) && (
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
                  {/* Props */}
                  {result.props.length > 0 && (
                    <div className="sub-item">
                      <List.Description>
                        <strong>{"props >"}</strong>
                      </List.Description>
                      {result.props.map((prop) => (
                        <List.Description
                          key={prop.name}
                          dangerouslySetInnerHTML={{
                            __html: highlightText(
                              `${prop.name}(${prop.desc})`,
                              query
                            ),
                          }}
                          className="click-item sub-item"
                          onClick={() =>
                            handleResultClick(
                              `/entities/${result.id}`,
                              `prop-${prop.name}`
                            )
                          }
                        />
                      ))}
                    </div>
                  )}

                  {/* Subsets */}
                  {Object.entries(result.subsets).map(
                    ([subsetName, subset]) =>
                      subset.length > 0 && (
                        <div key={subsetName} className="sub-item">
                          <List.Description>
                            <strong>{`Subset${subsetName} >`}</strong>
                          </List.Description>
                          {subset.map((item) => (
                            <List.Description
                              key={item}
                              dangerouslySetInnerHTML={{
                                __html: highlightText(item, query),
                              }}
                              className="click-item sub-item"
                              onClick={() =>
                                handleResultClick(
                                  `/entities/${result.id}`,
                                  item
                                )
                              }
                            />
                          ))}
                        </div>
                      )
                  )}

                  {/* Enums */}
                  {Object.entries(result.enumLabels).map(
                    ([enumId, enumLabels]) => (
                      <div key={enumId} className="sub-item">
                        <List.Description
                          className="click-item"
                          onClick={() =>
                            handleResultClick(
                              `/entities/${result.id}`,
                              `enum-${enumId}`
                            )
                          }
                        >
                          <strong
                            dangerouslySetInnerHTML={{
                              __html: highlightText(`Enum${enumId} >`, query),
                            }}
                          />
                        </List.Description>
                        {Object.entries(enumLabels).map(([key, value]) => (
                          <List.Description
                            key={key}
                            dangerouslySetInnerHTML={{
                              __html: highlightText(`${key}(${value})`, query),
                            }}
                            className="click-item sub-item"
                            onClick={() =>
                              handleResultClick(
                                `/entities/${result.id}`,
                                `enum-${enumId}-${key}`
                              )
                            }
                          />
                        ))}
                      </div>
                    )
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
