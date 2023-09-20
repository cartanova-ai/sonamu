import { Segment, Header, Button, Icon } from "semantic-ui-react";
import { z } from "zod";
import { SonamuUIService } from "../../services/sonamu-ui.service";
import { useCommonModal } from "../../components/core/CommonModal";
import { defaultCatch } from "../../services/sonamu.shared";
import { BooleanToggle, useTypeForm } from "@sonamu-kit/react-sui";
import { MigrationStatus } from "sonamu";
import classNames from "classnames";
import { useState } from "react";

type MigrationActionFormProps = {
  action: "latest" | "rollback" | "shadow";
  targets: string[];
  conns: MigrationStatus["conns"];
};
export function MigrationActionForm({
  action,
  targets,
  conns,
}: MigrationActionFormProps) {
  const [loading, setLoading] = useState(false);

  // useCommonModal
  const { doneModal } = useCommonModal();

  const { form, register } = useTypeForm(
    z.object({
      doShadowDbTesting: z.boolean(),
    }),
    {
      doShadowDbTesting: action === "latest",
    }
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
      <Segment padded basic loading={loading}>
        <Segment padded color="green">
          <div className="header-row">
            <Header>Migrations Action Form</Header>
          </div>
          <Segment basic>
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
                    {targets.includes(conn.connKey) && <Icon name="check" />}
                    {conn.name}
                  </div>
                ))}
              </div>
            </div>
            {action === "latest" && (
              <div className="shadow-db-testing">
                <h4>Shadow DB Testing</h4>
                <BooleanToggle {...register("doShadowDbTesting")} />
              </div>
            )}
            <div className="text-center" style={{ marginTop: "2em" }}>
              <Button
                color="green"
                onClick={() => handleSubmit()}
                icon="play"
                content="Commit"
              />
            </div>
          </Segment>
        </Segment>
      </Segment>
    </div>
  );
}
