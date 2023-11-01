import {
  Button,
  Checkbox,
  Divider,
  Label,
  Segment,
  Table,
} from "semantic-ui-react";
import { SonamuUIService } from "../../services/sonamu-ui.service";
import { useState } from "react";
import { difference, intersection, uniq } from "lodash";
import classNames from "classnames";
import { defaultCatch } from "../../services/sonamu.shared";
import { useCommonModal } from "../../components/core/CommonModal";
import { MigrationActionForm } from "../entities/_action_form";

type MigrationsIndexProps = {};
export default function MigrationsIndex(_props: MigrationsIndexProps) {
  const { data, error, mutate } = SonamuUIService.useMigrationStatus();
  const { status } = data ?? {};
  const { preparedCodes, conns, codes } = status ?? {};

  // useCommonModal
  const { openModal } = useCommonModal();

  const isLoading = !error && !data;
  const [loading, setLoading] = useState(false);

  const [selectedConnKeys, setSelectedConnKeys] = useState<string[]>([]);
  const [selectedCodeNames, setSelectedCodeNames] = useState<string[]>([]);
  const [isAllCodeViewerOpen, setAllCodeViewerOpen] = useState(false);

  const toggleConnKeys = (
    preset: "ALL" | "LOCAL" | "REMOTE" | "TESTING" | "FIXTURE"
  ) => {
    const targetKeys = (() => {
      switch (preset) {
        case "ALL":
          return [
            "test",
            "fixture_local",
            "fixture_remote",
            "development_master",
            "production_master",
          ];
        case "LOCAL":
          return ["test", "fixture_local"];
        case "REMOTE":
          return ["fixture_remote", "development_master", "production_master"];
        case "TESTING":
          return ["test", "fixture_local", "fixture_remote"];
        case "FIXTURE":
          return ["fixture_local", "fixture_remote"];
      }
    })();

    if (
      intersection(targetKeys, selectedConnKeys).length === targetKeys.length
    ) {
      setSelectedConnKeys(
        selectedConnKeys.filter((key) => !targetKeys.includes(key))
      );
    } else if (difference(targetKeys, selectedConnKeys).length > 0) {
      setSelectedConnKeys(targetKeys);
    } else {
      setSelectedConnKeys(uniq([...selectedConnKeys, ...targetKeys]));
    }
  };

  const confirmDelCodes = () => {
    if (selectedCodeNames.length === 0) {
      return;
    }
    const answer = confirm(
      `Are you sure to delete the selected ${selectedCodeNames.length} migration codes?`
    );
    if (!answer) {
      return;
    }

    setLoading(true);
    SonamuUIService.migrationsDelCodes(selectedCodeNames)
      .then(() => {
        mutate();
      })
      .catch(defaultCatch)
      .finally(() => {
        setLoading(false);
      });
  };

  const generatePreparedCodes = () => {
    setLoading(true);
    SonamuUIService.migrationsGeneratePreparedCodes()
      .then(() => {
        // TS컴파일을 위해 0.5초 대기
        setTimeout(() => {
          mutate();
        }, 500);
      })
      .catch(defaultCatch)
      .finally(() => {
        setLoading(false);
      });
  };

  const openActionModal = (
    action: "latest" | "rollback" | "shadow",
    _targets?: string[]
  ) => {
    if (!conns) {
      return;
    }
    const targets = _targets ?? selectedConnKeys;
    openModal(
      <MigrationActionForm action={action} targets={targets} conns={conns} />,
      {
        onCompleted: () => {
          mutate();
        },
      }
    );
  };

  const toggleAllFiles = () => {
    if (!codes) {
      return;
    }

    if (selectedCodeNames.length === 0) {
      setSelectedCodeNames(codes.map((code) => code.name));
    } else {
      setSelectedCodeNames([]);
    }
  };

  if (error) {
    return (
      <div className="migrations-index">
        <div className="message-box error">{error.message}</div>
      </div>
    );
  }
  return (
    <div className="migrations-index">
      <Segment className="migrations-index" loading={loading || isLoading}>
        {preparedCodes && (
          <div className="prepared">
            <h3>
              Prepared Migration Codes{" "}
              <div className="buttons">
                <Button
                  icon={`toggle ${isAllCodeViewerOpen ? "on" : "off"}`}
                  size="mini"
                  color="olive"
                  content="Toggle codes"
                  onClick={() => setAllCodeViewerOpen(!isAllCodeViewerOpen)}
                />
                <Divider vertical />
                <Button
                  size="mini"
                  color="green"
                  icon="play"
                  content="Generate"
                  onClick={() => generatePreparedCodes()}
                />
              </div>
            </h3>
            <Table celled selectable>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Type</Table.HeaderCell>
                  <Table.HeaderCell>Table</Table.HeaderCell>
                  <Table.HeaderCell>Name</Table.HeaderCell>
                  <Table.HeaderCell>Code</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {preparedCodes.length === 0 && (
                  <Table.Row className="table-empty">
                    <Table.Cell colSpan={6}>
                      No prepared migration codes.
                    </Table.Cell>
                  </Table.Row>
                )}
                {preparedCodes.map((pcode, pcodeIndex) => (
                  <Table.Row key={pcodeIndex} className="prepared-code">
                    <Table.Cell collapsing>{pcode.type}</Table.Cell>
                    <Table.Cell collapsing>{pcode.table}</Table.Cell>
                    <Table.Cell collapsing>{pcode.title}</Table.Cell>
                    <Table.Cell
                      style={{ padding: 0, width: 700, textAlign: "center" }}
                    >
                      <CodeViewer
                        code={pcode.formatted!}
                        open={isAllCodeViewerOpen}
                      />
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
            <Divider />
          </div>
        )}
        <div className="codes">
          <h3>Migration Code Files</h3>
          <div className="tools">
            <div className="code-buttons">
              <Button
                size="tiny"
                color="red"
                icon="trash"
                content="Delete codes"
                disabled={selectedCodeNames.length === 0}
                onClick={() => confirmDelCodes()}
              />
            </div>
            <div className="conn-preset-buttons">
              {(["ALL", "LOCAL", "REMOTE", "TESTING", "FIXTURE"] as const).map(
                (preset) => (
                  <Button
                    key={preset}
                    color="black"
                    size="tiny"
                    content={preset}
                    onClick={() => toggleConnKeys(preset)}
                  />
                )
              )}
            </div>
            <div className="conn-action-buttons">
              <Button
                size="tiny"
                color="green"
                icon="play"
                content="Apply to Latest"
                disabled={selectedConnKeys.length === 0}
                onClick={() => openActionModal("latest")}
              />
              <Button
                size="tiny"
                color="red"
                icon="refresh"
                content="Rollback!!"
                disabled={selectedConnKeys.length === 0}
                onClick={() => openActionModal("rollback")}
              />
            </div>
          </div>
          {conns && codes && (
            <Table celled selectable>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>
                    Name{" "}
                    <Button
                      icon="check"
                      size="mini"
                      color="blue"
                      onClick={() => toggleAllFiles()}
                    />
                  </Table.HeaderCell>
                  {conns.map((conn, connIndex) => (
                    <Table.HeaderCell
                      key={connIndex}
                      width="2"
                      className={classNames({
                        "conn-selected": selectedConnKeys.includes(
                          conn.connKey
                        ),
                      })}
                    >
                      <Checkbox
                        label={`${conn.name} / ${conn.status}`}
                        checked={selectedConnKeys.includes(conn.connKey)}
                        onChange={(_e, data) => {
                          if (data.checked) {
                            setSelectedConnKeys(
                              uniq([...selectedConnKeys, conn.connKey])
                            );
                          } else {
                            setSelectedConnKeys(
                              selectedConnKeys.filter(
                                (key) => key !== conn.connKey
                              )
                            );
                          }
                        }}
                      />
                    </Table.HeaderCell>
                  ))}
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {codes.length === 0 && (
                  <Table.Row className="table-empty">
                    <Table.Cell colSpan={6}>No migration code files</Table.Cell>
                  </Table.Row>
                )}
                {codes.map((code, codeIndex) => (
                  <Table.Row key={codeIndex}>
                    <Table.Cell>
                      <Checkbox
                        label={code.name}
                        checked={selectedCodeNames.includes(code.name)}
                        onChange={(_e, data) => {
                          if (data.checked) {
                            setSelectedCodeNames(
                              uniq([...selectedCodeNames, code.name])
                            );
                          } else {
                            setSelectedCodeNames(
                              selectedCodeNames.filter(
                                (name) => name !== code.name
                              )
                            );
                          }
                        }}
                      />
                      &nbsp;{" "}
                      <Button
                        size="mini"
                        icon="code"
                        onClick={() => {
                          SonamuUIService.openVscode({
                            absPath: code.path,
                          });
                        }}
                      />
                    </Table.Cell>
                    {conns.map((conn, connIndex) => (
                      <Table.Cell
                        key={connIndex}
                        className={classNames("conn-status", {
                          "conn-selected": selectedConnKeys.includes(
                            conn.connKey
                          ),
                        })}
                      >
                        {conn.pending.includes(code.name) ? (
                          <Label
                            size="mini"
                            color="yellow"
                            icon="minus"
                            content="PENDING"
                          />
                        ) : (
                          <Label
                            size="mini"
                            color="green"
                            icon="check"
                            content="APPLIED"
                          />
                        )}
                      </Table.Cell>
                    ))}
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </div>
      </Segment>
    </div>
  );
}

type CodeViewerProps = {
  code: string;
  open: boolean;
};
export function CodeViewer({ code, open }: CodeViewerProps) {
  return (
    <div className="code-viewer">
      {open ? <code>{code}</code> : <div>Code is collapsed</div>}
    </div>
  );
}
