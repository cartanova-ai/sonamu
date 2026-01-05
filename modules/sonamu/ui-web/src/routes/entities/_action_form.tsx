import { Button, useTypeForm } from "@sonamu-kit/react-components";
import classNames from "classnames";
import { useState } from "react";
import type { MigrationStatus, SonamuDBConfig } from "sonamu";
import { z } from "zod";
import CheckIcon from "~icons/lucide/check";
import PlayIcon from "~icons/lucide/play";
import { BooleanToggle } from "../../components/BooleanToggle";
import { useCommonModal } from "../../components/core/CommonModal";
import { defaultCatch } from "../../services/sonamu.shared";
import { SonamuUIService } from "../../services/sonamu-ui.service";

type MigrationActionFormProps = {
  action: "apply" | "rollback" | "shadow";
  targets: (keyof SonamuDBConfig)[];
  conns: MigrationStatus["conns"];
};
export function MigrationActionForm({ action, targets, conns }: MigrationActionFormProps) {
  const [loading, setLoading] = useState(false);

  // useCommonModal
  const { doneModal } = useCommonModal();

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
      doneModal();
    } catch (e) {
      defaultCatch(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="form migration-commit-form">
      <div className={`ui padded basic segment ${loading ? "loading" : ""}`}>
        <div className="ui padded green segment">
          <div className="header-row">
            <h2 className="ui header">Migrations Action Form</h2>
          </div>
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
                <BooleanToggle {...register("doShadowDbTesting")} />
              </div>
            )}
            <div className="text-center" style={{ marginTop: "2em" }}>
              <Button variant="default" onClick={() => handleSubmit()} icon={<PlayIcon />}>
                Commit
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
