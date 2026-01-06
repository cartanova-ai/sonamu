import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
} from "@sonamu-kit/react-components";
import { useNavigate } from "@tanstack/react-router";
import { group } from "radashi";
import { useCallback, useEffect, useState } from "react";
import SearchIcon from "~icons/lucide/search";
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
    navigate({ to: url });

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

    return target.replace(regex, (match) => `<span style="color: green;">${match}</span>`);
  };

  useEffect(() => {
    if (documents) {
      const entity = window.location.pathname.split("/entities/")[1];
      resetIndex();
      setSearchItems(Object.assign([], documents));
      setResults(search(query, entity));
    }
  }, [query]);

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
    return grouped.map(([key, items], index) => {
      if (!items) return null;
      return (
        <div key={key} className="ml-4">
          <div className="list-description">
            <strong>{`Subset${key} >`}</strong>
          </div>
          {items.map((field) => (
            <div
              key={field.desc}
              dangerouslySetInnerHTML={{
                __html: highlightText(field.desc, query),
              }}
              className={`hover:bg-[#d0dbb0] ml-4 list-description cursor-pointer ${
                index === selectedIndex &&
                selectedIndex2 !== -1 &&
                selectedIndex2 === fields.indexOf(field)
                  ? "bg-[#d0dbb0]"
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
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          setQuery("");
          setResults([]);
          resetIndex();
          onClose();
        }
      }}
    >
      <DialogContent className="search-modal max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="sr-only">Search</DialogTitle>
          <DialogDescription className="sr-only">
            Search through entities, props, subsets, and enums
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search docs"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value.toLowerCase());
            }}
            className="pl-10 w-full"
            autoFocus
          />
        </div>
        {results.length > 0 && (
          <div className="list-container overflow-y-auto flex-1 mt-4">
            {results.map(({ item: result, fields }, index) => (
              <div
                key={`${result.id}-${index}`}
                className={`bg-[#f3f3f3] mt-[0.3em] pl-4 list-item ${
                  index === selectedIndex && selectedIndex2 === -1 ? "bg-[#d0dbb0]" : ""
                }`}
              >
                <button
                  type="button"
                  className="hover:bg-[#d0dbb0] w-full text-left"
                  onClick={() => handleResultClick(`/entities/${result.id}`)}
                >
                  <div
                    className="list-header"
                    dangerouslySetInnerHTML={{
                      __html: highlightText(result.id, query),
                    }}
                  />
                  <div
                    className="list-description"
                    dangerouslySetInnerHTML={{
                      __html: highlightText(result.title, query),
                    }}
                  />
                </button>

                {!!fields?.filter((f) => f.type === "scaffolding")?.length && (
                  <div
                    className={`hover:bg-[#d0dbb0] ml-4 list-description cursor-pointer ${
                      index === selectedIndex && selectedIndex2 !== -1 && selectedIndex2 === 0
                        ? "bg-[#d0dbb0]"
                        : ""
                    }`}
                    onClick={() => handleResultClick("/scaffolding", result.id)}
                  >
                    <strong
                      dangerouslySetInnerHTML={{
                        __html: highlightText(`Scaffolding > ${result.id}(${result.title})`, query),
                      }}
                    />
                  </div>
                )}

                <div>
                  {!!fields?.filter((f) => f.type === "props")?.length && (
                    <div className="ml-4">
                      <div className="list-description">
                        <strong>{"props >"}</strong>
                      </div>
                      {fields?.map((field, fieldIndex) => {
                        if (field.type !== "props") return <span key={field.key}>&nbsp;</span>;

                        return (
                          <div
                            key={field.key}
                            dangerouslySetInnerHTML={{
                              __html: highlightText(`${field.key}(${field.desc})`, query),
                            }}
                            className={`hover:bg-[#d0dbb0] ml-4 list-description cursor-pointer ${
                              index === selectedIndex &&
                              selectedIndex2 !== -1 &&
                              selectedIndex2 === fieldIndex
                                ? "bg-[#d0dbb0]"
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
                    <div className="ml-4">
                      <div className="list-description">
                        <strong>{"enums >"}</strong>
                      </div>
                      {fields?.map((field) => {
                        if (field.type !== "enums") return <span key={field.key}>&nbsp;</span>;

                        return (
                          <div
                            key={field.key}
                            dangerouslySetInnerHTML={{
                              __html: highlightText(field.key, query),
                            }}
                            className={`hover:bg-[#d0dbb0] ml-4 list-description cursor-pointer ${
                              index === selectedIndex &&
                              selectedIndex2 !== -1 &&
                              selectedIndex2 === fields.indexOf(field)
                                ? "bg-[#d0dbb0]"
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
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
