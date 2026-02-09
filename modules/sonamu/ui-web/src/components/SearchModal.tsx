import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@sonamu-kit/react-components";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { SonamuUIService } from "../services/sonamu-ui.service";

function Highlight({ text, search }: { text: string; search: string }) {
  if (!search) return <span>{text}</span>;
  const index = text.toLowerCase().indexOf(search.toLowerCase());
  if (index === -1) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, index)}
      <span className="bg-amber-200/60 text-amber-900 rounded-sm">
        {text.slice(index, index + search.length)}
      </span>
      {text.slice(index + search.length)}
    </span>
  );
}

type SearchModalProps = {
  open: boolean;
  onClose: () => void;
};
export default function SearchModal({ open, onClose }: SearchModalProps) {
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const { data } = SonamuUIService.useEntities();
  const { entities } = data ?? {};

  const filteredEntities = useMemo(() => {
    if (!entities) return [];
    const s = search.toLowerCase();
    if (!s) return [];

    return entities
      .map((entity) => {
        const entityMatch = `${entity.id} ${entity.title}`.toLowerCase().includes(s);
        const matchedProps = entity.props.filter((prop) =>
          `${prop.name} ${prop.desc ?? ""}`.toLowerCase().includes(s),
        );
        const matchedSubsets = Object.entries(entity.subsets).flatMap(([subsetKey, fields]) =>
          fields
            .filter((field) => `${subsetKey} ${field}`.toLowerCase().includes(s))
            .map((field) => ({ subsetKey, field })),
        );
        const matchedEnums = Object.keys(entity.enumLabels).filter((enumKey) =>
          enumKey.toLowerCase().includes(s),
        );

        if (
          entityMatch ||
          matchedProps.length > 0 ||
          matchedSubsets.length > 0 ||
          matchedEnums.length > 0
        ) {
          return {
            entity,
            entityMatch,
            matchedProps,
            matchedSubsets,
            matchedEnums,
          };
        }
        return null;
      })
      .filter(Boolean);
  }, [entities, search]);

  const handleSelect = (url: string, elementId?: string) => {
    setSearch("");
    onClose();
    navigate({ to: url });
    if (elementId) {
      scrollToElement(elementId);
    }
  };

  const scrollToElement = (id: string) => {
    const interval = setInterval(() => {
      const element = document.getElementById(id);
      if (element) {
        element.scrollIntoView({ behavior: "instant", block: "center" });
        element.style.backgroundColor = "#fef3c7";
        element.style.boxShadow = "0 0 0 2px #fbbf24";
        setTimeout(() => {
          element.style.backgroundColor = "";
          element.style.boxShadow = "";
          element.style.transition = "background-color 1s, box-shadow 1s";
        }, 1000);
        clearInterval(interval);
      }
    }, 100);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          setSearch("");
          onClose();
        }
      }}
      commandProps={{ shouldFilter: false }}
    >
      <CommandInput placeholder="Search entities..." value={search} onValueChange={setSearch} />
      <CommandList className="max-h-[60vh]">
        {search && filteredEntities.length === 0 && (
          <CommandEmpty>검색 결과가 없습니다.</CommandEmpty>
        )}
        {filteredEntities.map((item) => {
          if (!item) return null;
          const { entity, entityMatch, matchedProps, matchedSubsets, matchedEnums } = item;

          return (
            <CommandGroup
              key={entity.id}
              heading={<Highlight text={`${entity.id} ${entity.title}`} search={search} />}
            >
              {entityMatch && (
                <>
                  <CommandItem
                    value={`entity:${entity.id} ${entity.title}`}
                    onSelect={() => handleSelect(`/entities/${entity.id}`)}
                  >
                    <Highlight text={`${entity.id} (${entity.title})`} search={search} />
                  </CommandItem>
                  <CommandItem
                    value={`scaffolding:${entity.id} ${entity.title}`}
                    onSelect={() => handleSelect("/scaffolding", entity.id)}
                  >
                    Scaffolding &gt;{" "}
                    <Highlight text={`${entity.id}(${entity.title})`} search={search} />
                  </CommandItem>
                </>
              )}

              {matchedProps.map((prop) => (
                <CommandItem
                  key={`prop-${prop.name}`}
                  value={`prop:${prop.name} ${prop.desc ?? ""} ${entity.id}`}
                  onSelect={() => handleSelect(`/entities/${entity.id}`, `prop-${prop.name}`)}
                >
                  prop &gt; <Highlight text={prop.name} search={search} />
                  {prop.desc ? (
                    <span>
                      {" ("}
                      <Highlight text={prop.desc} search={search} />
                      {")"}
                    </span>
                  ) : null}
                </CommandItem>
              ))}

              {matchedSubsets.map(({ subsetKey, field }) => (
                <CommandItem
                  key={`subset-${subsetKey}-${field}`}
                  value={`subset:${subsetKey} ${field} ${entity.id}`}
                  onSelect={() => handleSelect(`/entities/${entity.id}`, field)}
                >
                  Subset{subsetKey} &gt; <Highlight text={field} search={search} />
                </CommandItem>
              ))}

              {matchedEnums.map((enumKey) => (
                <CommandItem
                  key={`enum-${enumKey}`}
                  value={`enum:${enumKey} ${entity.id}`}
                  onSelect={() => handleSelect(`/entities/${entity.id}`, `enum-${enumKey}`)}
                >
                  enum &gt; <Highlight text={enumKey} search={search} />
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}
