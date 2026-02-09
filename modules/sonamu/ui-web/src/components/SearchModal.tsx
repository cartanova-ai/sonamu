import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@sonamu-kit/react-components";
import { useNavigate } from "@tanstack/react-router";
import { SonamuUIService } from "../services/sonamu-ui.service";

const substringFilter = (value: string, search: string): number => {
  const v = value.toLowerCase();
  const s = search.toLowerCase();
  if (!s) return 1;
  if (v.includes(s)) return 1;
  return 0;
};

type SearchModalProps = {
  open: boolean;
  onClose: () => void;
};
export default function SearchModal({ open, onClose }: SearchModalProps) {
  const navigate = useNavigate();

  const { data } = SonamuUIService.useEntities();
  const { entities } = data ?? {};

  const handleSelect = (url: string, elementId?: string) => {
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
        element.style.backgroundColor = "yellow";
        setTimeout(() => {
          element.style.backgroundColor = "";
          element.style.transition = "background-color 1s";
        }, 1000);
        clearInterval(interval);
      }
    }, 100);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      commandProps={{ filter: substringFilter }}
    >
      <CommandInput placeholder="Search entities..." />
      <CommandList className="max-h-[60vh]">
        <CommandEmpty>검색 결과가 없습니다.</CommandEmpty>
        {entities?.map((entity) => (
          <CommandGroup key={entity.id} heading={`${entity.id} ${entity.title}`}>
            <CommandItem
              value={`entity:${entity.id} ${entity.title}`}
              onSelect={() => handleSelect(`/entities/${entity.id}`)}
            >
              {entity.id} ({entity.title})
            </CommandItem>
            <CommandItem
              value={`scaffolding:${entity.id} ${entity.title}`}
              onSelect={() => handleSelect("/scaffolding", entity.id)}
            >
              Scaffolding &gt; {entity.id}({entity.title})
            </CommandItem>

            {entity.props.map((prop) => (
              <CommandItem
                key={`prop-${prop.name}`}
                value={`prop:${prop.name} ${prop.desc ?? ""} ${entity.id}`}
                onSelect={() => handleSelect(`/entities/${entity.id}`, `prop-${prop.name}`)}
              >
                prop &gt; {prop.name}
                {prop.desc ? ` (${prop.desc})` : ""}
              </CommandItem>
            ))}

            {Object.entries(entity.subsets).flatMap(([subsetKey, fields]) =>
              fields.map((field) => (
                <CommandItem
                  key={`subset-${subsetKey}-${field}`}
                  value={`subset:${subsetKey} ${field} ${entity.id}`}
                  onSelect={() => handleSelect(`/entities/${entity.id}`, field)}
                >
                  Subset{subsetKey} &gt; {field}
                </CommandItem>
              )),
            )}

            {Object.keys(entity.enumLabels).map((enumKey) => (
              <CommandItem
                key={`enum-${enumKey}`}
                value={`enum:${enumKey} ${entity.id}`}
                onSelect={() => handleSelect(`/entities/${entity.id}`, `enum-${enumKey}`)}
              >
                enum &gt; {enumKey}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
