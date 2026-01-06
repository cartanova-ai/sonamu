import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Switch,
  useTypeForm,
} from "@sonamu-kit/react-components";
import classNames from "classnames";
import { useState } from "react";
import type { MigrationStatus, SonamuDBConfig } from "sonamu";
import { z } from "zod";
import CheckIcon from "~icons/lucide/check";
import PlayIcon from "~icons/lucide/play";
import { defaultCatch } from "../../services/sonamu.shared";
import { SonamuUIService } from "../../services/sonamu-ui.service";

type MigrationActionModalProps = {
  action: "apply" | "rollback" | "shadow";
  targets: (keyof SonamuDBConfig)[];
  conns: MigrationStatus["conns"];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted?: () => void;
};
export function MigrationActionModal({
  action,
  targets,
  conns,
  open,
  onOpenChange,
  onCompleted,
}: MigrationActionModalProps) {
  const [loading, setLoading] = useState(false);

  const { form, register } = useTypeForm(
    z.object({
      doShadowDbTesting: z.boolean(),
    }),
    {
      doShadowDbTesting: action === "apply",
    },
  );

  const handleSubmit = async () => {
    setLoading(true);
    try {
      if (form.doShadowDbTesting) {
        await SonamuUIService.migrationsRunAction("shadow", targets);
      }

      await SonamuUIService.migrationsRunAction(action, targets);
      onOpenChange(false);
      if (onCompleted) {
        onCompleted();
      }
    } catch (e) {
      defaultCatch(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Migrations Action Form</DialogTitle>
          <DialogDescription>Execute migration action: {action.toUpperCase()}</DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 p-4">
          <div className={`form migration-commit-form ${loading ? "loading" : ""}`}>
            <div className="ui basic segment">
              <div>
                <h4>Action: {action.toUpperCase()}</h4>
                <p>&nbsp;</p>
              </div>
              <div className="targets">
                <h4>Targets</h4>
                <div className="conns">
                  {conns.map((conn) => (
                    <div
                      key={conn.name}
                      className={classNames("conn", {
                        "is-targeted": targets.includes(conn.connKey),
                      })}
                    >
                      {targets.includes(conn.connKey) && (
                        <CheckIcon className="h-4 w-4 inline-block mr-1" />
                      )}
                      {conn.name}
                    </div>
                  ))}
                </div>
              </div>
              {action === "apply" && (
                <div className="shadow-db-testing">
                  <h4>Shadow DB Testing</h4>
                  <Switch {...register("doShadowDbTesting")} />
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSubmit} icon={<PlayIcon />} disabled={loading}>
            Commit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
