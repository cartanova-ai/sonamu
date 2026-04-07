import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@sonamu-kit/react-components";

import { EntityIdSelect } from "../../components/EntityIdSelect";

type EntitySelectorModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted?: (entityId: string) => void;
};

export function EntitySelectorModal({ open, onOpenChange, onCompleted }: EntitySelectorModalProps) {
  const handleEntitySelect = (value: string | null) => {
    if (value && onCompleted) {
      onCompleted(value);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="entity-selector max-w-xl">
        <DialogHeader>
          <DialogTitle>Select an entity</DialogTitle>
          <DialogDescription className="sr-only">Choose an entity to navigate to</DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <form className="block">
            <div className="field">
              <EntityIdSelect
                onValueChange={(value) => {
                  handleEntitySelect(value);
                }}
                search
              />
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
