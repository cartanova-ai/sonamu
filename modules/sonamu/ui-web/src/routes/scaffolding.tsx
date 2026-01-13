import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  type TableCol,
  TableHead,
  TableHeader,
  TableRow,
} from "@sonamu-kit/react-components";
import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import CheckIcon from "~icons/lucide/check";
import CodeIcon from "~icons/lucide/code";
import PlayIcon from "~icons/lucide/play";
import XIcon from "~icons/lucide/x";
import { useSD } from "../i18n";
import { defaultCatch } from "../services/sonamu.shared";
import { type ScaffoldingStatus, SonamuUIService } from "../services/sonamu-ui.service";

export const Route = createFileRoute("/scaffolding")({
  component: ScaffoldingIndex,
});

type ScaffoldingIndexProps = {};
function ScaffoldingIndex({}: ScaffoldingIndexProps) {
  const SD = useSD();
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

  const [previewModalState, setPreviewModalState] = useState<{
    open: boolean;
    pathAndCodes: { path: string; code: string }[] | null;
  }>({
    open: false,
    pathAndCodes: null,
  });

  const [generateOptions, setGenerateOptions] = useState<{
    [key: string]: {
      overwrite: boolean;
    };
  }>({});

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
      templateKeys: ["view_enums_select"],
    },
  ];

  const filteredEnumIds = (allEntities ?? [])
    .filter(
      (e) => selected.entityIds.includes(e.id) || selected.entityIds.includes(e.parentId ?? ""),
    )
    .flatMap((e) => Object.keys(e.enumLabels));
  const setEntityIds = (entityIds: string[]) => {
    setSelected({
      ...selected,
      entityIds,
      enumIds: filteredEnumIds.filter((eid) => selected.enumIds.includes(eid)),
    });
  };
  const setTemplateKeys = (templateGroupName: "Entity" | "Enums", templateKeys: string[]) => {
    const group = templateGroups.find((g) => g.name === templateGroupName);
    if (!group) {
      return;
    }
    setSelected({
      ...selected,
      templateGroupName,
      templateKeys: group.templateKeys.filter((tk) => templateKeys.includes(tk)),
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
    refetch: scaffoldRefetch,
  } = SonamuUIService.useScaffoldingStatus(selected);
  const { statuses } = scaffoldingData ?? {};

  const getScaffoldingKey = (status: ScaffoldingStatus) =>
    [status.entityId, status.templateKey, status.enumId].join("///");

  const columns: TableCol<ScaffoldingStatus>[] = [
    {
      label: "Entity",
      tc: (row) => <>{row.entityId}</>,
      fit: true,
    },
    {
      label: "TemplateKey",
      tc: (row) => <>{row.templateKey}</>,
      fit: true,
    },
    ...(selected.templateGroupName === "Enums"
      ? [
          {
            label: "EnumId",
            tc: (row: ScaffoldingStatus) => <>{row.enumId}</>,
            fit: true,
          } as TableCol<ScaffoldingStatus>,
        ]
      : []),
    {
      label: SD("common.path"),
      tc: (row) => <>{row.subPath}</>,
    },
    {
      label: SD("scaffolding.isExists"),
      tc: (row) => (
        <>
          {row.isExists ? (
            <Button
              icon={<CodeIcon />}
              size="xs"
              variant="yellow"
              onClick={(e) => {
                e.stopPropagation();
                SonamuUIService.openVscode({
                  absPath: row.fullPath,
                });
              }}
            />
          ) : (
            <XIcon />
          )}
        </>
      ),
      fit: true,
    },
    {
      label: (
        <Button
          size="xs"
          variant="destructive"
          icon={<CheckIcon />}
          onClick={(e) => {
            e.stopPropagation();
            toggleOverwrite();
          }}
        >
          {SD("common.overwrite")}
        </Button>
      ),
      tc: (row) => (
        <>
          {row.isExists && (
            <Checkbox
              checked={generateOptions[getScaffoldingKey(row)]?.overwrite ?? false}
              onCheckedChange={(checked) => {
                setGenerateOptions({
                  ...generateOptions,
                  [getScaffoldingKey(row)]: {
                    overwrite: (checked as boolean) ?? false,
                  },
                });
              }}
            />
          )}
        </>
      ),
      fit: true,
    },
    {
      label: SD("common.preview"),
      tc: (row) => (
        <Button
          size="xs"
          variant="green"
          onClick={(e) => {
            e.stopPropagation();
            openPreviewModal(row);
          }}
        >
          {SD("common.preview")}
        </Button>
      ),
      fit: true,
    },
  ];

  const toggleOverwrite = () => {
    if (!statuses) {
      return;
    }

    const filtered = statuses.filter((st) => st.isExists);
    const allOverwrite = filtered.every(
      (st) => generateOptions[getScaffoldingKey(st)]?.overwrite ?? false,
    );
    if (allOverwrite) {
      setGenerateOptions({});
    } else {
      setGenerateOptions(
        filtered.reduce(
          (acc, st) => {
            acc[getScaffoldingKey(st)] = {
              overwrite: true,
            };
            return acc;
          },
          {} as { [key: string]: { overwrite: boolean } },
        ),
      );
    }
  };

  const generate = () => {
    if (!statuses) {
      return;
    }

    const options = statuses.map((st) => ({
      entityId: st.entityId,
      templateKey: st.templateKey,
      enumId: st.enumId,
      overwrite: generateOptions[getScaffoldingKey(st)]?.overwrite ?? false,
    }));
    SonamuUIService.scaffoldingGenerate(options)
      .then(() => {
        scaffoldRefetch();
      })
      .catch(defaultCatch);
  };

  const openPreviewModal = (status: ScaffoldingStatus) => {
    SonamuUIService.scaffoldingPreview(status)
      .then(({ pathAndCodes }) => {
        setPreviewModalState({
          open: true,
          pathAndCodes,
        });
      })
      .catch(defaultCatch);
  };

  return (
    <div className="flex justify-start min-h-[calc(100vh-50px)]">
      <div className="bg-sidebar-bg text-white pl-4 pr-0 h-[calc(100vh-var(--spacing-gnb))] sticky left-0 top-gnb w-[250px] overflow-y-auto">
        <h3>{SD("scaffolding.entities")}</h3>
        <div className="py-3 text-center">
          {selected.entityIds.length !== entities.length ? (
            <Button icon={<CheckIcon />} onClick={() => setEntityIds(entities.map((e) => e.id))}>
              {SD("scaffolding.checkAllEntities")}
            </Button>
          ) : (
            <Button icon={<CheckIcon />} onClick={() => setEntityIds([])}>
              {SD("scaffolding.uncheckAllEntities")}
            </Button>
          )}
        </div>

        {entities.map((entity) => (
          <div className="flex items-center pb-2" key={entity.id} id={entity.id}>
            <Checkbox
              checked={selected.entityIds.includes(entity.id)}
              onCheckedChange={(checked) => {
                if (checked) {
                  setEntityIds([...selected.entityIds, entity.id]);
                } else {
                  setEntityIds(selected.entityIds.filter((id) => id !== entity.id));
                }
              }}
            />
            <span className="ml-2">{entity.id}</span>
          </div>
        ))}
      </div>
      <div className="bg-sidebar-bg pl-8 border-l border-[#85aa8a] h-[calc(100vh-var(--spacing-gnb))] sticky left-0 top-gnb text-white w-[250px] overflow-y-auto">
        {templateGroups.map((group) => (
          <div className="pb-4" key={group.name}>
            <h4 className="mb-1">{SD("scaffolding.template").replace("{name}", group.name)}</h4>
            <div className="py-3 text-center">
              {selected.templateGroupName !== group.name ||
              selected.templateKeys.length !== group.templateKeys.length ? (
                <Button
                  icon={<CheckIcon />}
                  onClick={() => setTemplateKeys(group.name, group.templateKeys)}
                >
                  {SD("scaffolding.checkAll")}
                </Button>
              ) : (
                <Button icon={<CheckIcon />} onClick={() => setTemplateKeys(group.name, [])}>
                  {SD("scaffolding.uncheckAll")}
                </Button>
              )}
            </div>
            {group.templateKeys.map((templateKey) => (
              <div className="flex items-center pb-2" key={templateKey}>
                <Checkbox
                  checked={
                    selected.templateGroupName === group.name &&
                    selected.templateKeys.includes(templateKey)
                  }
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setTemplateKeys(group.name, [...selected.templateKeys, templateKey]);
                    } else {
                      setTemplateKeys(
                        group.name,
                        selected.templateKeys.filter((id) => id !== templateKey),
                      );
                    }
                  }}
                />
                <span className="ml-2">{templateKey}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      {selected.templateGroupName === "Enums" && (
        <div className="bg-sidebar-bg p-4 pl-8 border-l border-[#85aa8a] h-[calc(100vh-var(--spacing-gnb))] sticky left-0 top-gnb text-white w-[250px] overflow-y-auto">
          <h4 className="mb-1">{SD("scaffolding.enums")}</h4>
          <div className="py-3 text-center">
            {selected.enumIds.length !== filteredEnumIds.length ? (
              <Button icon={<CheckIcon />} onClick={() => setEnumIds(filteredEnumIds)}>
                {SD("scaffolding.checkAllEnums")}
              </Button>
            ) : (
              <Button icon={<CheckIcon />} onClick={() => setEnumIds([])}>
                {SD("scaffolding.uncheckAllEnums")}
              </Button>
            )}
          </div>
          {filteredEnumIds.map((enumId) => (
            <div className="flex items-center pb-2" key={enumId}>
              <Checkbox
                checked={selected.enumIds.includes(enumId)}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setEnumIds([...selected.enumIds, enumId]);
                  } else {
                    setEnumIds(selected.enumIds.filter((id) => id !== enumId));
                  }
                }}
              />
              <span className="ml-2">{enumId}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex-1 p-4">
        <div>
          {!statuses && !scaffoldingIsLoading && (
            <div className="w-[50em] my-[30vh] mx-auto whitespace-pre-line p-[3em] bg-white leading-[2em] border-2 border-orange-500">
              {SD("scaffolding.selectPrompt")}
              {selected.templateGroupName === "Enums"
                ? SD("scaffolding.selectPromptWithEnums")
                : ""}
            </div>
          )}
          {statuses && (
            <div>
              {statuses.length > 0 && (
                <Button size="sm" variant="default" icon={<PlayIcon />} onClick={() => generate()}>
                  {SD("scaffolding.generateTemplates")
                    .replace("{count}", String(statuses.length))
                    .replace("{overwriteCount}", String(Object.keys(generateOptions).length))}
                </Button>
              )}
              <Table className="mt-4 text-[0.9em]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent bg-gray-100">
                    {columns.map((col, idx) => (
                      <TableHead key={idx} fit={col.fit} className="py-2 px-3">
                        {col.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statuses.map((status, statusIndex) => (
                    <Fragment key={statusIndex}>
                      <TableRow className={status.isExists ? "bg-red-50" : "bg-green-50"}>
                        {columns.map((col, idx) => (
                          <TableCell key={idx} fit={col.fit} className="py-2 px-3">
                            {col.tc(status)}
                          </TableCell>
                        ))}
                      </TableRow>
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
      <Dialog
        open={previewModalState.open}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setPreviewModalState({ open: false, pathAndCodes: null });
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{SD("scaffolding.previewTitle")}</DialogTitle>
            <DialogDescription>{SD("scaffolding.previewDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {previewModalState.pathAndCodes?.map((pnc) => (
              <div key={pnc.path}>
                <div className="mb-2 text-lg font-bold text-gray-700">{pnc.path}</div>
                <pre className="bg-green-50 text-gray-900 p-4 rounded-lg overflow-x-auto text-sm font-mono leading-relaxed">
                  <code>{pnc.code}</code>
                </pre>
              </div>
            )) ?? <p>{SD("scaffolding.noPreviewData")}</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
