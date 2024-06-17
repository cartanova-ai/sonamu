import React, { useState, ChangeEvent } from "react";
import { Modal, Input, List } from "semantic-ui-react";
import { useNavigate } from "react-router-dom";
import { ExtendedEntity } from "../services/sonamu-ui.service";

type SearchModalProps = {
  open: boolean;
  onClose: () => void;
  entities: ExtendedEntity[];
};
export default function SearchModal({
  open,
  onClose,
  entities: documents,
}: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ExtendedEntity[]>([]);
  const navigate = useNavigate();

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setResults(searchDocuments(documents, value));
  };

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

  const searchDocuments = (
    documents: ExtendedEntity[],
    query: string
  ): ExtendedEntity[] => {
    if (!query) return [];

    const q = query.toLowerCase();

    const isMatch = (subset: string[]) =>
      subset.some((item) => item.toLowerCase().includes(q));
    const isMatchEntity = ({ id, title }: ExtendedEntity) =>
      id.toLowerCase().includes(q) || title.toLowerCase().includes(q);
    const isMatchProp = ({ name, desc }: ExtendedEntity["props"][0]) =>
      name.toLowerCase().includes(q) || desc?.toLowerCase().includes(q);
    const isMatchEnum = (enumLabel: ExtendedEntity["enumLabels"][0]) =>
      Object.entries(enumLabel).some(
        ([key, value]) =>
          key.toLowerCase().includes(q) || value.toLowerCase().includes(q)
      );

    return documents
      .filter(
        (doc) =>
          isMatchEntity(doc) ||
          doc.props.some((prop) => isMatchProp(prop)) ||
          Object.values(doc.subsets).some((subset) => isMatch(subset)) ||
          Object.entries(doc.enumLabels).some(
            ([enumId, enumLabels]) =>
              enumId.toLowerCase().includes(q) || isMatchEnum(enumLabels)
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
                enumId.toLowerCase().includes(q) ||
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
      });
  };

  return (
    <Modal className="search-modal" open={open} onClose={onClose}>
      <Modal.Header>Search</Modal.Header>
      <Modal.Content>
        <Input
          icon="search"
          placeholder="Search..."
          value={query}
          onChange={handleChange}
          fluid
          autoFocus
        />
        {results.length > 0 && (
          <List selection>
            {results.map((result) => (
              <List.Item
                key={result.id}
                onClick={() => handleResultClick(`/entities/${result.id}`)}
                className="search-result"
              >
                <div className="click-item">
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
                          <strong>{`Enum${enumId} >`}</strong>
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
