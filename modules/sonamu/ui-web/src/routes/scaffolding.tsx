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
  TableHead,
  TableHeader,
  TableRow,
} from "@sonamu-kit/react-components";
import { type TableCol } from "@sonamu-kit/react-components";
import { createFileRoute } from "@tanstack/react-router";
import { type Dispatch, Fragment, type SetStateAction, useState } from "react";
import CheckIcon from "~icons/lucide/check";
import CodeIcon from "~icons/lucide/code";
import PlayIcon from "~icons/lucide/play";
import XIcon from "~icons/lucide/x";

import { useSonamuContext } from "../contexts/sonamu-provider";
import { SonamuUIService } from "../services/sonamu-ui.service";
import { type ScaffoldingStatus } from "../services/sonamu-ui.service";
import { defaultCatch } from "../services/sonamu.shared";

export const Route = createFileRoute("/scaffolding")({
  component: ScaffoldingIndex,
});

type ScaffoldingIndexProps = {};
type GenerateOptions = Record<string, { overwrite: boolean }>;
type Translate = ReturnType<typeof useSonamuContext>["SD"];

function getScaffoldingKey(status: ScaffoldingStatus): string {
  return [status.entityId, status.templateKey].join("///");
}

function createScaffoldingColumns(
  SD: Translate,
  generateOptions: GenerateOptions,
  setGenerateOptions: Dispatch<SetStateAction<GenerateOptions>>,
  toggleOverwrite: () => void,
  openPreviewModal: (status: ScaffoldingStatus) => void,
): TableCol<ScaffoldingStatus>[] {
  return [
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
    {
      label: SD("common.path"),
      tc: (row) => <>{row.subPath}</>,
    },
    {
      label: SD("scaffolding.isExists"),
      tc: (row) =>
        row.isExists ? (
          <Button
            icon={<CodeIcon />}
            size="xs"
            variant="yellow"
            onClick={(event) => {
              event.stopPropagation();
              SonamuUIService.openVscode({ absPath: row.fullPath });
            }}
          />
        ) : (
          <XIcon />
        ),
      fit: true,
    },
    {
      label: (
        <Button
          size="xs"
          variant="destructive"
          icon={<CheckIcon />}
          onClick={(event) => {
            event.stopPropagation();
            toggleOverwrite();
          }}
        >
          {SD("common.overwrite")}
        </Button>
      ),
      tc: (row) =>
        row.isExists ? (
          <Checkbox
            checked={generateOptions[getScaffoldingKey(row)]?.overwrite ?? false}
            onCheckedChange={(checked) => {
              setGenerateOptions({
                ...generateOptions,
                [getScaffoldingKey(row)]: { overwrite: checked === true },
              });
            }}
          />
        ) : null,
      fit: true,
    },
    {
      label: SD("common.preview"),
      tc: (row) => (
        <Button
          size="xs"
          variant="green"
          onClick={(event) => {
            event.stopPropagation();
            openPreviewModal(row);
          }}
        >
          {SD("common.preview")}
        </Button>
      ),
      fit: true,
    },
  ];
}

function ScaffoldingIndex({}: ScaffoldingIndexProps) {
  const { SD } = useSonamuContext();
  const { data: entitiesData } = SonamuUIService.useEntities();
  const { entities: allEntities } = entitiesData ?? {};

  const [selected, setSelected] = useState<{
    entityIds: string[];
    templateKeys: string[];
  }>({
    entityIds: [],
    templateKeys: [],
  });

  const [previewModalState, setPreviewModalState] = useState<{
    open: boolean;
    pathAndCodes: { path: string; code: string }[] | null;
  }>({
    open: false,
    pathAndCodes: null,
  });

  const [generateOptions, setGenerateOptions] = useState<GenerateOptions>({});

  const entities = (allEntities ?? []).filter((e) => !e.parentId);
  const templateKeys = ["model", "model_test", "view_list", "view_search_input", "view_form"];

  const setEntityIds = (entityIds: string[]) => {
    setSelected({
      ...selected,
      entityIds,
    });
  };
  const setTemplateKeys = (keys: string[]) => {
    setSelected({
      ...selected,
      templateKeys: templateKeys.filter((tk) => keys.includes(tk)),
    });
  };

  const {
    data: scaffoldingData,
    isLoading: scaffoldingIsLoading,
    refetch: scaffoldRefetch,
  } = SonamuUIService.useScaffoldingStatus(selected);
  const { statuses } = scaffoldingData ?? {};

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
      const nextGenerateOptions: typeof generateOptions = {};
      for (const status of filtered) {
        nextGenerateOptions[getScaffoldingKey(status)] = { overwrite: true };
      }
      setGenerateOptions(nextGenerateOptions);
    }
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

  const columns = createScaffoldingColumns(
    SD,
    generateOptions,
    setGenerateOptions,
    toggleOverwrite,
    openPreviewModal,
  );

  const generate = () => {
    if (!statuses) {
      return;
    }

    const options = statuses.map((st) => ({
      entityId: st.entityId,
      templateKey: st.templateKey,
      overwrite: generateOptions[getScaffoldingKey(st)]?.overwrite ?? false,
    }));
    SonamuUIService.scaffoldingGenerate(options)
      .then(() => {
        scaffoldRefetch();
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
              label={entity.id}
              onCheckedChange={(checked) => {
                if (checked) {
                  setEntityIds([...selected.entityIds, entity.id]);
                } else {
                  setEntityIds(selected.entityIds.filter((id) => id !== entity.id));
                }
              }}
            />
          </div>
        ))}
      </div>
      <div className="bg-sidebar-bg pl-8 border-l border-[#85aa8a] h-[calc(100vh-var(--spacing-gnb))] sticky left-0 top-gnb text-white w-[250px] overflow-y-auto">
        <div className="pb-4">
          <h4 className="mb-1">{SD("scaffolding.template").replace("{name}", "Entity")}</h4>
          <div className="py-3 text-center">
            {selected.templateKeys.length !== templateKeys.length ? (
              <Button icon={<CheckIcon />} onClick={() => setTemplateKeys(templateKeys)}>
                {SD("scaffolding.checkAll")}
              </Button>
            ) : (
              <Button icon={<CheckIcon />} onClick={() => setTemplateKeys([])}>
                {SD("scaffolding.uncheckAll")}
              </Button>
            )}
          </div>
          {templateKeys.map((templateKey) => (
            <div className="flex items-center pb-2" key={templateKey}>
              <Checkbox
                checked={selected.templateKeys.includes(templateKey)}
                label={templateKey}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setTemplateKeys([...selected.templateKeys, templateKey]);
                  } else {
                    setTemplateKeys(selected.templateKeys.filter((id) => id !== templateKey));
                  }
                }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 p-4">
        <div>
          {!statuses && !scaffoldingIsLoading && (
            <div className="w-[50em] my-[30vh] mx-auto whitespace-pre-line p-[3em] bg-white leading-[2em] border-2 border-orange-500">
              {SD("scaffolding.selectPrompt")}
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
