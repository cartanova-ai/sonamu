import { Button, Checkbox, Icon, Table } from "semantic-ui-react";
import { SonamuUIService } from "../../services/sonamu-ui.service";
import { useState } from "react";
import { defaultCatch } from "../../services/sonamu.shared";

type ScaffoldingIndexProps = {};
export function ScaffoldingIndex({}: ScaffoldingIndexProps) {
  const { data: entitiesData } = SonamuUIService.useEntities();
  const { entities: allEntities } = entitiesData ?? {};

  const [selected, setSelected] = useState<{
    templateGroupName: "Entity" | "Enums";
    entityIds: string[];
    templateKeys: string[];
    enumIds: string[];
  }>({
    templateGroupName: "Entity",
    entityIds: [],
    templateKeys: [],
    enumIds: [],
  });

  const entities = (allEntities ?? []).filter((e) => !e.parentId);
  const templateGroups = [
    {
      name: "Entity" as const,
      templateKeys: [
        "model",
        "model_test",
        "view_list",
        "view_search_input",
        "view_form",
        "view_id_async_select",
      ],
    },
    {
      name: "Enums" as const,
      templateKeys: ["view_enums_select", "view_enums_dropdown"],
    },
  ];
  const filteredEnumIds = entities
    .filter((e) => selected.entityIds.includes(e.id))
    .map((e) => Object.keys(e.enumLabels))
    .flat();
  const setEntityIds = (entityIds: string[]) => {
    setSelected({
      ...selected,
      entityIds,
      enumIds: filteredEnumIds.filter((eid) => selected.enumIds.includes(eid)),
    });
  };
  const setTemplateKeys = (
    templateGroupName: "Entity" | "Enums",
    templateKeys: string[]
  ) => {
    const group = templateGroups.find((g) => g.name === templateGroupName);
    if (!group) {
      return;
    }
    setSelected({
      ...selected,
      templateGroupName,
      templateKeys: group.templateKeys.filter((tk) =>
        templateKeys.includes(tk)
      ),
      enumIds: templateGroupName === "Entity" ? [] : selected.enumIds,
    });
  };
  const setEnumIds = (enumIds: string[]) => {
    setSelected({
      ...selected,
      enumIds: filteredEnumIds.filter((eid) => enumIds.includes(eid)),
    });
  };

  const {
    data: scaffoldingData,
    isLoading: scaffoldingIsLoading,
    mutate: scaffoldMutate,
  } = SonamuUIService.useScaffoldingStatus(selected);
  const { statuses } = scaffoldingData ?? {};

  const generate = () => {
    if (!statuses) {
      return;
    }

    const options = statuses.map((st) => ({
      entityId: st.entityId,
      templateKey: st.templateKey,
      enumId: st.enumId,
    }));
    SonamuUIService.scaffoldingGenerate(options)
      .then(() => {
        scaffoldMutate();
      })
      .catch(defaultCatch);
  };

  return (
    <div className="scaffolding-index">
      <div className="entities">
        <h3>Entities</h3>
        <div className="button-set">
          {selected.entityIds.length !== entities.length ? (
            <Button
              size="mini"
              icon="check"
              content="Check all entities"
              onClick={() => setEntityIds(entities.map((e) => e.id))}
            />
          ) : (
            <Button
              size="mini"
              icon="check"
              content="Uncheck all entities"
              onClick={() => setEntityIds([])}
            />
          )}
        </div>

        {entities.map((entity) => (
          <div className="entity" key={entity.id}>
            <Checkbox
              label={entity.id}
              checked={selected.entityIds.includes(entity.id)}
              onChange={(_e, { checked }) => {
                if (checked) {
                  setEntityIds([...selected.entityIds, entity.id]);
                } else {
                  setEntityIds(
                    selected.entityIds.filter((id) => id !== entity.id)
                  );
                }
              }}
            />
          </div>
        ))}
      </div>
      <div className="template-groups">
        {templateGroups.map((group) => (
          <div className="template-group" key={group.name}>
            <h4>Template: {group.name}</h4>
            <div className="button-set">
              {selected.templateGroupName !== group.name ||
              selected.templateKeys.length !== group.templateKeys.length ? (
                <Button
                  size="mini"
                  icon="check"
                  content={`Check all`}
                  onClick={() =>
                    setTemplateKeys(group.name, group.templateKeys)
                  }
                />
              ) : (
                <Button
                  size="mini"
                  icon="check"
                  content={`Uncheck all`}
                  onClick={() => setTemplateKeys(group.name, [])}
                />
              )}
            </div>
            {group.templateKeys.map((templateKey) => (
              <div className="template-key" key={templateKey}>
                <Checkbox
                  label={templateKey}
                  checked={
                    selected.templateGroupName === group.name &&
                    selected.templateKeys.includes(templateKey)
                  }
                  onChange={(_e, { checked }) => {
                    if (checked) {
                      setTemplateKeys(group.name, [
                        ...selected.templateKeys,
                        templateKey,
                      ]);
                    } else {
                      setTemplateKeys(
                        group.name,
                        selected.templateKeys.filter((id) => id !== templateKey)
                      );
                    }
                  }}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
      {selected.templateGroupName === "Enums" && (
        <div className="enums-list">
          <h4>Enums</h4>
          <div className="button-set">
            {selected.enumIds.length !== filteredEnumIds.length ? (
              <Button
                size="mini"
                icon="check"
                content="Check all enums"
                onClick={() => setEnumIds(filteredEnumIds)}
              />
            ) : (
              <Button
                size="mini"
                icon="check"
                content="Uncheck all enums"
                onClick={() => setEnumIds([])}
              />
            )}
          </div>
          {filteredEnumIds.map((enumId) => (
            <div className="enums">
              <Checkbox
                label={enumId}
                checked={selected.enumIds.includes(enumId)}
                onChange={(_e, { checked }) => {
                  if (checked) {
                    setEnumIds([...selected.enumIds, enumId]);
                  } else {
                    setEnumIds(selected.enumIds.filter((id) => id !== enumId));
                  }
                }}
              />
            </div>
          ))}
        </div>
      )}
      <div className="content">
        {!statuses && !scaffoldingIsLoading && (
          <div className="message-box warning">
            Please select EntityIDs / TemplateKeys
            {selected.templateGroupName === "Enums" ? " / EnumIDs" : ""} to
            generate
          </div>
        )}
        {statuses && (
          <div className="statuses">
            {statuses.length > 0 && (
              <Button
                size="small"
                color="green"
                icon="play"
                content={`Generate ${statuses.length} template(s)`}
                onClick={() => generate()}
              />
            )}
            <Table celled selectable>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Entity</Table.HeaderCell>
                  <Table.HeaderCell>TemplateKey</Table.HeaderCell>
                  {selected.templateGroupName === "Enums" && (
                    <Table.HeaderCell>EnumId</Table.HeaderCell>
                  )}
                  <Table.HeaderCell>Path</Table.HeaderCell>
                  <Table.HeaderCell>IsExists</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {statuses.map((status, statusIndex) => (
                  <Table.Row
                    key={statusIndex}
                    positive={!status.isExists}
                    negative={status.isExists}
                  >
                    <Table.Cell collapsing>{status.entityId}</Table.Cell>
                    <Table.Cell collapsing>{status.templateKey}</Table.Cell>
                    {selected.templateGroupName === "Enums" && (
                      <Table.Cell collapsing>{status.enumId}</Table.Cell>
                    )}
                    <Table.Cell>{status.subPath}</Table.Cell>
                    <Table.Cell>
                      {status.isExists ? (
                        <Button
                          icon="code"
                          size="mini"
                          color="blue"
                          onClick={() => {
                            SonamuUIService.openVscode({
                              absPath: status.fullPath,
                            });
                          }}
                        />
                      ) : (
                        <Icon name="x" />
                      )}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
