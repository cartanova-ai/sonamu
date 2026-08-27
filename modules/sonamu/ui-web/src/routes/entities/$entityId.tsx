/* oxlint-disable @typescript-eslint/no-non-null-assertion */ // 너무 많이 사용하고 있어서 일단 허용

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
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import classNames from "classnames";
import { unique } from "radashi";
import { useRef, useState } from "react";
import { type EntityIndex, type EntityProp, type FlattenSubsetRow } from "sonamu";
import CheckIcon from "~icons/lucide/check";
import Loader2Icon from "~icons/lucide/loader-2";
import PencilIcon from "~icons/lucide/pencil";
import PlusIcon from "~icons/lucide/plus";
import RefreshCwIcon from "~icons/lucide/refresh-cw";
import SparklesIcon from "~icons/lucide/sparkles";
import Trash2Icon from "~icons/lucide/trash-2";

import { ConeButton } from "../../components/ConeButton";
import { ConeModal } from "../../components/ConeModal";
import { EditableInput } from "../../components/EditableInput";
import { SheetCellInput } from "../../components/SheetCellInput";
import { useSheetTable } from "../../components/useSheetTable";
import { useSonamuContext } from "../../contexts/sonamu-provider";
import { SonamuUIService } from "../../services/sonamu-ui.service";
import { defaultCatch } from "../../services/sonamu.shared";
import { EntityIndexModal } from "../entities/_entity_index_modal";
import { EntityPropModal } from "../entities/_entity_prop_modal";
import { EntitySelectorModal } from "../entities/_entity_selector_modal";

export const Route = createFileRoute("/entities/$entityId")({
  component: EntitiesShowPage,
});

function scrollToAndHighlight(elementId: string, highlightClasses: string[]): void {
  const element = document.getElementById(elementId);
  if (element) {
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.classList.remove(...highlightClasses);
    void element.offsetWidth;
    element.classList.add(...highlightClasses);
    setTimeout(() => {
      element.classList.remove(...highlightClasses);
    }, 1500);
  }
}

type EntitiesShowPageProps = {};
function EntitiesShowPage({}: EntitiesShowPageProps) {
  const { SD } = useSonamuContext();
  const { data, refetch, isLoading } = SonamuUIService.useEntities();
  const { entities } = data ?? {};

  // naviagte
  const navigate = useNavigate();

  const { entityId } = Route.useParams();

  const entity = entities?.find((candidate) => candidate.id === entityId) ?? null;
  const delEntity = () => {
    if (!entity) {
      return;
    }
    const answer = confirm(SD("entity.confirm.delete").replace("{id}", entity.id));
    if (!answer) {
      return;
    }

    SonamuUIService.delEntity(entity.id)
      .then(() => {
        refetch();
        navigate({ to: "/entities" });
      })
      .catch(defaultCatch);
  };

  // 비어있는 Cone만 생성 (안전)
  const handleGenerateEmptyCones = () => {
    if (!entity) {
      return;
    }

    const answer = confirm(
      `비어있는 Cone만 AI로 생성하시겠습니까?\n\n- FixtureHint가 있는 Cone은 보존됩니다\n- 예상 비용: ~$0.01\n- 소요 시간: 10-30초`,
    );
    if (!answer) {
      return;
    }

    setGeneratingCones(true);
    SonamuUIService.generateCones(entity.id, {
      preserveExisting: true,
      onlyEmpty: true,
    })
      .then((result) => {
        alert(`Cone 생성 완료!\n\n사용 토큰: ${result.tokensUsed}`);
        refetch();
      })
      .catch((error) => {
        const message = error?.message || String(error);
        if (message.includes("Entity not found")) {
          alert("Entity를 찾을 수 없습니다.");
        } else if (message.includes("API key not configured")) {
          alert("API 키가 설정되지 않았습니다.\n\nANTHROPIC_API_KEY 환경변수를 설정해주세요.");
        } else if (message.includes("Rate limit exceeded")) {
          alert("요청 한도 초과.\n\n잠시 후 다시 시도해주세요.");
        } else {
          alert(`Cone 생성 실패:\n\n${message}`);
        }
      })
      .finally(() => {
        setGeneratingCones(false);
      });
  };

  // 전체 Cone 재생성 (위험)
  const handleRegenerateAllCones = () => {
    if (!entity) {
      return;
    }

    const answer = confirm(
      `⚠️ 모든 Cone을 AI로 재생성하시겠습니까?\n\n경고: 수동으로 작성한 모든 Cone이 덮어씌워집니다!\n\n- 예상 비용: ~$0.01\n- 소요 시간: 10-30초`,
    );
    if (!answer) {
      return;
    }

    setGeneratingCones(true);
    SonamuUIService.generateCones(entity.id, {
      preserveExisting: false,
      onlyEmpty: false,
    })
      .then((result) => {
        alert(`Cone 재생성 완료!\n\n사용 토큰: ${result.tokensUsed}`);
        refetch();
      })
      .catch((error) => {
        const message = error?.message || String(error);
        if (message.includes("Entity not found")) {
          alert("Entity를 찾을 수 없습니다.");
        } else if (message.includes("API key not configured")) {
          alert("API 키가 설정되지 않았습니다.\n\nANTHROPIC_API_KEY 환경변수를 설정해주세요.");
        } else if (message.includes("Rate limit exceeded")) {
          alert("요청 한도 초과.\n\n잠시 후 다시 시도해주세요.");
        } else {
          alert(`Cone 생성 실패:\n\n${message}`);
        }
      })
      .finally(() => {
        setGeneratingCones(false);
      });
  };

  // EntityPropModal 상태
  const [propModalOpen, setPropModalOpen] = useState(false);
  const [propModalData, setPropModalData] = useState<{
    mode: "add" | "modify";
    at?: number;
    oldOne?: EntityProp;
    focusIndex?: number;
  } | null>(null);

  // EntitySelectorModal 상태
  const [selectorModalOpen, setSelectorModalOpen] = useState(false);

  // EntityIndexModal 상태
  const [indexModalOpen, setIndexModalOpen] = useState(false);
  const [indexModalData, setIndexModalData] = useState<{
    mode: "add" | "modify";
    at?: number;
    oldOne?: EntityIndex;
    focusIndex?: number;
  } | null>(null);

  // Entity ConeModal 상태
  const [entityConeModalOpen, setEntityConeModalOpen] = useState(false);

  // Prop ConeModal 상태
  const [propConeModal, setPropConeModal] = useState<{
    open: boolean;
    propName: string;
  } | null>(null);

  // Enum ConeModal 상태
  const [enumConeModal, setEnumConeModal] = useState<{
    open: boolean;
    enumId: string;
  } | null>(null);

  // Subset ConeModal 상태
  const [subsetConeModal, setSubsetConeModal] = useState<{
    open: boolean;
    subsetKey: string;
  } | null>(null);

  // AI Cone 생성 상태
  const [generatingCones, setGeneratingCones] = useState(false);

  const enumLabelsArray: {
    [enumId: string]: { key: string; label: string }[];
  } = entity
    ? Object.fromEntries(
        Object.entries(entity.enumLabels).map(([enumId, enumLabels]) => [
          enumId,
          Object.entries(enumLabels).map(([key, label]) => ({ key, label })),
        ]),
      )
    : {};

  // useSheetTable
  const { regRow, regCell, cursor, setCursor, setFocusedCursor, turnKeyHandler, isFocused } =
    useSheetTable({
      sheets: [
        {
          name: "props",
        },
        {
          name: "indexes",
        },
        ...Object.keys(entity?.enumLabels ?? {}).map((enumId) => ({
          name: `enumLabels-${enumId}`,
        })),
        ...(entity?.parentId === undefined
          ? [
              {
                name: "subsets",
              },
            ]
          : []),
      ],
      resetKey: entityId,
      onExecute: (sheet, y, x) => {
        if (sheet === "props") {
          openPropModal("modify", y, x);
        } else if (sheet === "indexes") {
          openIndexModal("modify", y, x);
        }
      },
      onKeywordChanged: (sheet, keyword) => {
        if (!entity) {
          return;
        }
        setCursor({
          sheet,
          y: (() => {
            if (sheet === "props") {
              return entity.props.findIndex((prop) => prop.name.startsWith(keyword));
            } else if (sheet === "indexes") {
              return entity.indexes.findIndex((index) => index.columns.join(",").includes(keyword));
            } else if (sheet === "subsets") {
              return entity.flattenSubsetRows.findIndex((subsetRow) =>
                subsetRow.field.startsWith(keyword),
              );
            } else if (sheet.startsWith("enumLabels-")) {
              const enumId = sheet.replace("enumLabels-", "");
              return enumLabelsArray[enumId].findIndex(
                (enumLabel) =>
                  enumLabel.key.startsWith(keyword) || enumLabel.label.startsWith(keyword),
              );
            }
            return 0;
          })(),
          x: 0,
        });
      },
      onKeydown: (e) => {
        if (!entity) {
          return false;
        }

        switch (e.key) {
          case "n":
          case "N":
            if (e.ctrlKey && e.metaKey && e.shiftKey) {
              if (cursor.sheet === "props") {
                openPropModal("add", undefined, 2);
              } else if (cursor.sheet === "indexes") {
                openIndexModal("add", cursor.y);
              } else if (cursor.sheet.includes("enumLabels")) {
                addEnumLabelRow(cursor.sheet.split("-")[1], cursor.y);
              }
              return false;
            }
            break;

          case "Backspace":
            if (e.metaKey) {
              if (cursor.sheet === "props") {
                confirmDelProp(cursor.y);
              } else if (cursor.sheet === "indexes") {
                confirmDelIndex(cursor.y);
              } else if (cursor.sheet.startsWith("enumLabels")) {
                const [, enumId] = /^enumLabels-(.+)$/.exec(cursor.sheet) ?? [];
                if (!enumId) {
                  return false;
                }
                const enumLabels = enumLabelsArray[enumId];
                enumLabels.splice(cursor.y, 1);
                SonamuUIService.modifyEnumLabels(
                  entity.id,
                  enumLabelsArrayToEnumLabels(enumLabelsArray),
                )
                  .then(({ updated }) => {
                    entity.enumLabels = updated;
                    refetch();
                  })
                  .catch(defaultCatch);
              }
              e.preventDefault();
              return false;
            }
            break;
          case "p":
          case "P":
            if (e.ctrlKey && e.shiftKey && e.metaKey) {
              setSelectorModalOpen(true);
              turnKeyHandler(false);
            }
            break;
        }
        return true;
      },
      disable: propModalOpen,
    });

  const enumPropMap = entity
    ? new Map(entity.props.filter((p) => p.type === "enum").map((p) => [p.id, p.name]))
    : new Map<string, string>();

  function enumLabelsArrayToEnumLabels(labelsByEnum: {
    [enumId: string]: { key: string; label: string }[];
  }) {
    if (!entity) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(labelsByEnum).map(([enumId, enumLabels]) => [
        enumId,
        Object.fromEntries(enumLabels.map(({ key, label }) => [key, label])),
      ]),
    );
  }
  const appendFieldOnSubset = (subsetKey: string, field: string, at?: number) => {
    if (!entity) {
      return;
    }
    const subset = entity.subsets[subsetKey];
    if (subset.includes(field)) {
      return;
    }

    const newSubset = [...subset];
    if (at === undefined) {
      newSubset.push(field);
    } else {
      newSubset.splice(at, 0, field);
    }

    SonamuUIService.modifySubset(entity.id, subsetKey, newSubset)
      .then(({ updated }) => {
        entity.subsets[subsetKey] = updated;
        refetch();
      })
      .catch(defaultCatch);
  };
  const omitFieldOnSubset = (subsetKey: string, field: string) => {
    if (!entity) {
      return;
    }
    const subset = entity.subsets[subsetKey];
    if (!subset.includes(field)) {
      return;
    }

    const newSubset = subset.filter((subsetField) => subsetField !== field);

    SonamuUIService.modifySubset(entity.id, subsetKey, newSubset)
      .then(({ updated }) => {
        entity.subsets[subsetKey] = updated;
        refetch();
      })
      .catch(defaultCatch);
  };

  // Internal 필드 추가/제거 함수
  const appendFieldOnSubsetInternal = (subsetKey: string, field: string) => {
    if (!entity) {
      return;
    }
    const internalSubset = entity.subsetsInternal?.[subsetKey] ?? [];
    if (internalSubset.includes(field)) {
      return;
    }

    const newInternalSubset = [...internalSubset, field];
    // 일반 subset에서 제거
    const newSubset = (entity.subsets[subsetKey] ?? []).filter((f) => f !== field);

    SonamuUIService.modifySubset(entity.id, subsetKey, newSubset, newInternalSubset)
      .then(({ updated, updatedInternal }) => {
        entity.subsets[subsetKey] = updated;
        entity.subsetsInternal = entity.subsetsInternal ?? {};
        entity.subsetsInternal[subsetKey] = updatedInternal ?? [];
        refetch();
      })
      .catch(defaultCatch);
  };

  const omitFieldOnSubsetInternal = (subsetKey: string, field: string) => {
    if (!entity) {
      return;
    }
    const internalSubset = entity.subsetsInternal?.[subsetKey] ?? [];
    if (!internalSubset.includes(field)) {
      return;
    }

    const newInternalSubset = internalSubset.filter((f) => f !== field);

    SonamuUIService.modifySubset(entity.id, subsetKey, entity.subsets[subsetKey], newInternalSubset)
      .then(({ updated, updatedInternal }) => {
        entity.subsets[subsetKey] = updated;
        entity.subsetsInternal = entity.subsetsInternal ?? {};
        entity.subsetsInternal[subsetKey] = updatedInternal ?? [];
        refetch();
      })
      .catch(defaultCatch);
  };

  const expandRelationEntity = (at: number) => () => {
    if (!entities || !entity) {
      return;
    }

    const srcRow = entity.flattenSubsetRows[at];
    const relationEntityId = srcRow.relationEntity;
    if (!relationEntityId) {
      return;
    }

    const srcPrefix = [...srcRow.prefixes, srcRow.field].join(".");
    const existsOne = entity.flattenSubsetRows.find((r) =>
      r.prefixes.join(".").startsWith(srcPrefix),
    );
    if (existsOne) {
      return;
    }

    const relEntity = entities.find((et) => et.id === relationEntityId);
    if (!relEntity) {
      return alert(`Cannot find a relation entity named ${relationEntityId}`);
    }

    const newSubsetRows = relEntity.flattenSubsetRows
      .filter((r) => r.prefixes.length === 0)
      .map((r) => ({
        ...r,
        prefixes: [...srcRow.prefixes, srcRow.field],
        has: Object.fromEntries(Object.keys(entity.subsets).map((subsetKey) => [subsetKey, false])),
        isInternal: Object.fromEntries(
          Object.keys(entity.subsets).map((subsetKey) => [subsetKey, false]),
        ),
        isOpen: false,
      }));
    entity.flattenSubsetRows.splice(at + 1, 0, ...newSubsetRows);

    srcRow.isOpen = true;
  };
  const toggleAllFieldsOnSubset = (subsetKey: string, subsetRow?: FlattenSubsetRow) => {
    if (!entity) {
      return;
    }

    const newSubset = (() => {
      const oldSubset = entity.subsets[subsetKey];
      if (subsetRow === undefined) {
        const targetFields = entity.flattenSubsetRows
          .filter((sr) => sr.prefixes.length === 0 && !sr.relationEntity)
          .map((sr) => sr.field);
        const toAppend = targetFields.filter((field) => !entity.subsets[subsetKey].includes(field));
        if (toAppend.length === 0) {
          // 모두 선택된 경우 아무 것도 하지 않음
          return oldSubset;
        } else {
          console.log({ toAppend });
          // 선택 추가
          return unique([...oldSubset, ...toAppend]);
        }
      } else {
        const targetFields = entity.flattenSubsetRows
          .filter(
            (sr) =>
              sr.prefixes.join(".") === subsetRow.prefixes.concat(subsetRow.field).join(".") &&
              !sr.relationEntity,
          )
          .map((sr) => sr.prefixes.concat(sr.field).join("."));
        const toAppend = targetFields.filter((field) => !entity.subsets[subsetKey].includes(field));
        if (toAppend.length === 0) {
          // 모두 선택된 경우 전체 선택 해제
          return oldSubset.filter((field) => !targetFields.includes(field));
        } else {
          console.log({ toAppend });
          // 선택 추가
          return unique([...oldSubset, ...toAppend]);
        }
      }
    })();

    SonamuUIService.modifySubset(entity.id, subsetKey, newSubset)
      .then(({ updated }) => {
        entity.subsets[subsetKey] = updated;
        refetch();
      })
      .catch(defaultCatch);
  };

  // base
  const handleEntityBaseOnEnter = (which: "parentId" | "title" | "table") => {
    return (
      _e: React.KeyboardEvent<HTMLInputElement>,
      { value }: { value: string },
    ): Promise<void> => {
      if (!entity) {
        return Promise.resolve();
      }

      return new Promise((resolve, reject) => {
        SonamuUIService.modifyEntityBase(entity.id, {
          title: entity.title,
          table: entity.table,
          parentId: entity.parentId === "" ? undefined : entity.parentId,
          [which]: value,
        })
          .then(() => {
            refetch();
            return resolve();
          })
          .catch((e) => {
            return reject(e);
          });
      });
    };
  };

  // props
  const openPropModal = (mode: "add" | "modify", at?: number, focusIndex?: number) => {
    if (!entity) {
      return;
    }

    const oldOne = mode === "add" ? undefined : entity.props[at!];

    setPropModalData({ mode, at, oldOne, focusIndex });
    setPropModalOpen(true);
    turnKeyHandler(false);
  };

  const handlePropModalCompleted = async (propData: EntityProp) => {
    if (!entity || !propModalData) return;

    const { mode, at } = propModalData;

    if (mode === "modify") {
      await SonamuUIService.modifyProp(entity.id, propData, at!);
    } else {
      await SonamuUIService.createProp(entity.id, propData, at);
    }

    refetch();
    setTimeout(() => {
      setCursor({
        ...cursor,
        sheet: "props",
        y: at! + 1,
      });
    }, 100);
  };

  const handlePropModalOpenChange = (open: boolean) => {
    setPropModalOpen(open);
    if (!open) {
      setPropModalData(null);
      turnKeyHandler(true);
    }
  };

  // EntitySelectorModal 핸들러
  const handleSelectorModalOpenChange = (open: boolean) => {
    setSelectorModalOpen(open);
    if (!open) {
      turnKeyHandler(true);
    }
  };

  const handleSelectorModalCompleted = (selectedEntityId: string) => {
    navigate({ to: "/entities/$entityId", params: { entityId: selectedEntityId } });
  };

  const confirmDelProp = async (at: number) => {
    if (!entity) {
      return;
    }
    const answer = confirm(
      SD("entity.confirm.deleteProp").replace("{name}", entity.props[at].name),
    );
    if (!answer) {
      return;
    }

    await SonamuUIService.delProp(entity.id, at);
    refetch();
    setTimeout(() => {
      setCursor({
        ...cursor,
        sheet: "props",
        y: Math.min(at, entity.props.length - 1),
      });
    });
  };

  // indexes
  const openIndexModal = (mode: "add" | "modify", at?: number, focusIndex?: number) => {
    if (!entity) {
      return;
    }

    const oldOne = mode === "add" ? undefined : entity.indexes[at!];

    setIndexModalData({ mode, at, oldOne, focusIndex });
    setIndexModalOpen(true);
    turnKeyHandler(false);
  };

  const handleIndexModalCompleted = async (indexData: EntityIndex | null) => {
    if (!entity || !indexModalData) return;

    if (indexData === null) {
      // Cancel 처리
      setIndexModalOpen(false);
      setIndexModalData(null);
      turnKeyHandler(true);
      return;
    }

    const { mode, at } = indexModalData;
    const newIndexes = [...entity.indexes];

    if (mode === "modify") {
      newIndexes[at!] = indexData;
    } else {
      if (at === undefined) {
        newIndexes.push(indexData);
      } else {
        newIndexes.splice(at, 0, indexData);
      }
    }

    await SonamuUIService.modifyIndexes(entity.id, newIndexes);
    refetch();

    setTimeout(() => {
      setCursor({
        ...cursor,
        sheet: "indexes",
        y: mode === "modify" ? at! : newIndexes.length - 1,
      });
    }, 100);
  };

  const handleIndexModalOpenChange = (open: boolean) => {
    setIndexModalOpen(open);
    if (!open) {
      setIndexModalData(null);
      turnKeyHandler(true);
    }
  };
  const confirmDelIndex = (at: number) => {
    if (!entity) {
      return;
    }
    const answer = confirm(SD("entity.confirm.deleteIndex"));
    if (!answer) {
      return;
    }

    const newIndexes = entity.indexes.filter((_index, index) => index !== at);
    SonamuUIService.modifyIndexes(entity.id, newIndexes)
      .then(({ updated }) => {
        entity.indexes = updated;
        refetch();
        setTimeout(() => {
          setCursor({
            ...cursor,
            sheet: "indexes",
            y: Math.min(at, entity.indexes.length - 1),
          });
        });
      })
      .catch(defaultCatch);
  };

  // subsets
  const addSubsetKey = () => {
    const subsetKey = prompt(SD("entity.prompt.subsetKey"));
    if (!subsetKey) {
      return;
    }

    SonamuUIService.modifySubset(entity!.id, subsetKey, ["id"])
      .then(({ updated }) => {
        entity!.subsets[subsetKey] = updated;
        refetch();
      })
      .catch(defaultCatch);
  };
  const delSubset = (subsetKey: string) => {
    const answer = confirm(SD("entity.confirm.deleteSubset").replace("{key}", subsetKey));
    if (!answer) {
      return;
    }

    SonamuUIService.delSubset(entity!.id, subsetKey)
      .then((_res) => {
        delete entity!.subsets[subsetKey];
        refetch();
      })
      .catch(defaultCatch);
  };

  // enums
  const addEnumLabelRow = (enumId: string, cursorY?: number) => {
    if (!entity) {
      return;
    }

    cursorY ??= Object.keys(enumLabelsArray[enumId]).length - 1;
    enumLabelsArray[enumId].push({
      key: "",
      label: "",
    });
    setCursor({
      sheet: `enumLabels-${enumId}`,
      y: cursorY + 1,
      x: 0,
    });
    setFocusedCursor({ sheet: `enumLabels-${enumId}`, y: cursorY + 1, x: 0 });
  };
  const modifyEnumLabels = (
    enumId: string,
    at: number,
    which: "key" | "label",
    newValue: string,
  ) => {
    if (!entity) {
      return;
    }

    enumLabelsArray[enumId] = enumLabelsArray[enumId].map((item, index) => {
      return index === at
        ? {
            ...item,
            [which]: newValue,
          }
        : item;
    });
    SonamuUIService.modifyEnumLabels(entity.id, enumLabelsArrayToEnumLabels(enumLabelsArray))
      .then(({ updated }) => {
        entity.enumLabels = updated;
        refetch();
      })
      .catch(defaultCatch);
  };
  const editEnumId = (oldEnumId: string, newEnumId: string) => {
    if (!entity) {
      return;
    }

    SonamuUIService.modifyEnumId(entity.id, {
      before: oldEnumId,
      after: newEnumId,
    })
      .then(() => {
        refetch();
      })
      .catch(defaultCatch);
  };
  const confirmDelEnum = (enumId: string) => {
    if (!entity) {
      return;
    }
    const answer = confirm(SD("entity.confirm.deleteEnum").replace("{id}", enumId));
    if (!answer) {
      return;
    }

    SonamuUIService.deleteEnumId({ entityId: entity.id, enumId })
      .then(() => {
        refetch();
      })
      .catch(defaultCatch);
  };
  const openCreateNewEnum = () => {
    if (!entity) {
      return;
    }

    const newEnumId = prompt(SD("entity.prompt.newEnumId"));
    if (!newEnumId) {
      return;
    }

    SonamuUIService.createEnumId({ entityId: entity.id, newEnumId })
      .then(() => {
        refetch();
      })
      .catch(defaultCatch);
  };

  // Props Drag&Drop
  const dragStartPropIndex = useRef<number | null>(null);
  const [dragEnterPropIndex, setDragEnterPropIndex] = useState<number | null>();

  return (
    <div className="flex-1 p-8 overflow-x-hidden flex flex-col gap-8 min-h-[calc(100vh-50px)] bg-gray-50">
      {isLoading && <div>Loading</div>}
      {entity && (
        <>
          <div className="relative pb-4 border-b border-gray-200">
            <h3 className="text-2xl text-slate-800 mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>{SD("entity.title").replace("{id}", entity.id)}</span>
                <ConeButton size="sm" onClick={() => setEntityConeModalOpen(true)} />
                <Button
                  size="sm"
                  variant="outline"
                  icon={<SparklesIcon />}
                  onClick={handleGenerateEmptyCones}
                  disabled={generatingCones}
                  className="text-xs"
                  title="비어있는 Cone만 AI로 생성 (안전)"
                />
                <Button
                  size="sm"
                  variant="yellow"
                  icon={<RefreshCwIcon />}
                  onClick={handleRegenerateAllCones}
                  disabled={generatingCones}
                  className="text-xs"
                  title="⚠️ 전체 Cone 재생성 (기존 내용 덮어쓰기)"
                />
              </div>
              <Button
                size="xs"
                variant="destructive"
                icon={<Trash2Icon />}
                content="Delete"
                className="absolute text-[0.4em] right-0 top-0 opacity-70 hover:opacity-100"
                onClick={() => delEntity()}
              />
            </h3>
            <form className="block">
              <div className="flex gap-[14px]">
                <div className="flex-1">
                  <label className="block mb-1 font-bold">{SD("entity.parentId")}</label>
                  <EditableInput
                    value={entity.parentId ?? ""}
                    onChange={handleEntityBaseOnEnter("parentId")}
                  />
                </div>
                <div className="flex-1">
                  <label className="block mb-1 font-bold">Title</label>
                  <EditableInput value={entity.title} onChange={handleEntityBaseOnEnter("title")} />
                </div>
                <div className="flex-1">
                  <label className="block mb-1 font-bold">{SD("entity.tableName")}</label>
                  <EditableInput value={entity.table} onChange={handleEntityBaseOnEnter("table")} />
                </div>
                <div className="flex-1">
                  {/* <EditableInput
                    originValue={entity.table}
                    onEnter={handleEntityBaseOnEnter}
                  /> */}
                </div>
              </div>
            </form>
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <h3>{SD("entity.props")}</h3>
              <Table className="border border-separate border-spacing-0 rounded-lg bg-white overflow-hidden">
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead>{SD("entity.prop.name")}</TableHead>
                    <TableHead>{SD("entity.prop.desc")}</TableHead>
                    <TableHead>{SD("entity.prop.type")}</TableHead>
                    <TableHead>{SD("entity.prop.nullable")}</TableHead>
                    <TableHead>{SD("entity.prop.withAs")}</TableHead>
                    <TableHead>{SD("entity.prop.default")}</TableHead>
                    <TableHead>{SD("entity.prop.filter")}</TableHead>
                    <TableHead>{SD("entity.prop.cone")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entity.props.map((prop, propIndex) => (
                    <TableRow
                      id={`prop-${prop.name}`}
                      key={propIndex}
                      {...regRow(
                        "props",
                        propIndex,
                        classNames({
                          "[&>td]:!border-t-2 [&>td]:!border-t-red-500":
                            dragEnterPropIndex === propIndex,
                        }),
                      )}
                      draggable={true}
                      onDragStart={() => {
                        dragStartPropIndex.current = propIndex;
                      }}
                      onDragEnter={(e: React.DragEvent<HTMLTableRowElement>) => {
                        e.preventDefault();
                        setDragEnterPropIndex(propIndex);
                      }}
                      onDragEnd={() => {
                        const at = dragStartPropIndex.current;
                        const to = dragEnterPropIndex;
                        if (!entity || !at || !to) {
                          return;
                        }

                        SonamuUIService.moveProp(entity.id, at, to).then(() => {
                          refetch();

                          dragStartPropIndex.current = null;
                          setDragEnterPropIndex(null);
                        });
                      }}
                    >
                      <TableCell {...regCell("props", propIndex, 0)}>{prop.name}</TableCell>
                      <TableCell {...regCell("props", propIndex, 1)}>{prop.desc}</TableCell>
                      <TableCell {...regCell("props", propIndex, 2)}>
                        {prop.type} {prop.type === "string" && prop.length && <>({prop.length}) </>}
                        {(prop.type === "numeric" ||
                          (prop.type === "number" && prop.numberType === "numeric")) && (
                          <>
                            ({prop.precision},{prop.scale}){" "}
                          </>
                        )}
                      </TableCell>
                      <TableCell {...regCell("props", propIndex, 3)}>
                        {prop.nullable && (
                          <span className="inline-block px-[8.33px] py-[5.833px] text-[10px] font-bold leading-[10px] rounded-[4px] bg-[#e8e8e8] text-[rgba(0,0,0,0.6)]">
                            NULL
                          </span>
                        )}
                      </TableCell>
                      <TableCell {...regCell("props", propIndex, 4)}>
                        {(prop.type === "enum" || prop.type === "enum[]") && (
                          <span
                            className="inline-block px-[8.33px] py-[5.833px] text-[10px] font-bold leading-[10px] rounded-[4px] bg-[#6b7280] text-white cursor-pointer hover:bg-[#4b5563] transition-colors"
                            onClick={() =>
                              scrollToAndHighlight(`enum-${prop.id}`, ["animate-blink-highlight"])
                            }
                          >
                            {prop.id}
                          </span>
                        )}
                        {(prop.type === "json" || prop.type === "virtual") && (
                          <span className="inline-block px-[8.33px] py-[5.833px] text-[10px] font-bold leading-[10px] rounded-[4px] bg-[#ca8a04] text-white">
                            {prop.id}
                          </span>
                        )}
                        {prop.type === "relation" && (
                          <span
                            className={`inline-block px-[8.33px] py-[5.833px] text-[10px] font-bold leading-[10px] rounded-[4px] text-white ${
                              prop.relationType.endsWith("ToOne") ? "bg-[#f97316]" : "bg-[#a855f7]"
                            }`}
                          >
                            {prop.relationType}: {prop.with}
                          </span>
                        )}
                      </TableCell>

                      <TableCell {...regCell("props", propIndex, 5)}>
                        {prop.type !== "relation" && <>{prop.dbDefault}</>}
                      </TableCell>
                      <TableCell {...regCell("props", propIndex, 6)}>
                        {prop.toFilter && <CheckIcon />}
                      </TableCell>
                      <TableCell {...regCell("props", propIndex, 7)} className="text-center">
                        <ConeButton
                          size="sm"
                          onClick={() => {
                            setPropConeModal({ open: true, propName: prop.name });
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={8} className="footer-buttons text-center">
                      <Button
                        variant="blue"
                        icon={<PlusIcon />}
                        onClick={() => openPropModal("add", undefined, 2)}
                      >
                        {SD("entity.addProp")}
                      </Button>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            <div className="flex-[0.5]">
              <h3>{SD("entity.indexes")}</h3>
              <Table className="border border-separate border-spacing-0 rounded-lg bg-white overflow-hidden">
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead>{SD("entity.index.type")}</TableHead>
                    <TableHead>{SD("entity.index.columns")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entity.indexes.map((index, indexIndex) => (
                    <TableRow key={indexIndex} {...regRow("indexes", indexIndex)}>
                      <TableCell {...regCell("indexes", indexIndex, 0)}>
                        <strong>{index.type}</strong>
                      </TableCell>
                      <TableCell {...regCell("indexes", indexIndex, 1)}>
                        {index.columns.map((col, colIndex) => (
                          <span
                            className="inline-block px-[8.33px] py-[5.833px] text-[10px] font-bold leading-[10px] rounded-[4px] bg-[#e8e8e8] text-[rgba(0,0,0,0.6)] mr-1"
                            key={colIndex}
                          >
                            {col.name}
                          </span>
                        ))}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={2} className="footer-buttons text-center">
                      <Button
                        variant="blue"
                        icon={<PlusIcon />}
                        onClick={() => openIndexModal("add", undefined, 0)}
                      >
                        {SD("entity.addIndex")}
                      </Button>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
          <div className="flex gap-8">
            {entity && Object.keys(enumLabelsArray).length > 0 && (
              <div className="flex-1">
                <h3>
                  {SD("entity.enums")}{" "}
                  <Button size="xs" icon={<PlusIcon />} onClick={() => openCreateNewEnum()} />
                </h3>
                <div className="flex flex-wrap gap-8">
                  {Object.keys(enumLabelsArray).map((enumId, enumsIndex) => (
                    <div id={`enum-${enumId}`} className="w-80 rounded-lg" key={enumsIndex}>
                      <Table className="border border-separate border-spacing-0 rounded-lg bg-white overflow-hidden">
                        <TableHeader className="bg-gray-50">
                          <TableRow>
                            <TableHead colSpan={2}>
                              <div className="flex items-center gap-2">
                                <span
                                  id={`enum-title-${enumId}`}
                                  className={
                                    enumPropMap.has(enumId)
                                      ? "cursor-pointer hover:text-blue-600 transition-colors"
                                      : undefined
                                  }
                                  onClick={
                                    enumPropMap.has(enumId)
                                      ? () =>
                                          scrollToAndHighlight(`prop-${enumPropMap.get(enumId)}`, [
                                            "bg-blue-50",
                                          ])
                                      : undefined
                                  }
                                >
                                  {enumId}
                                </span>
                                <ConeButton
                                  size="sm"
                                  onClick={() => {
                                    setEnumConeModal({ open: true, enumId });
                                  }}
                                />
                                <Button
                                  size="xs"
                                  variant="yellow"
                                  icon={<PencilIcon />}
                                  onClick={() => {
                                    const newEnumId = prompt(
                                      SD("entity.prompt.changeEnumId"),
                                      enumId,
                                    );
                                    if (!newEnumId) {
                                      return;
                                    }
                                    editEnumId(enumId, newEnumId);
                                  }}
                                />
                                <Button
                                  size="xs"
                                  icon={<Trash2Icon />}
                                  variant="destructive"
                                  className="btn-del-enum"
                                  onClick={() => confirmDelEnum(enumId)}
                                />
                              </div>
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {enumLabelsArray[enumId].map(({ key, label }, enumLabelIndex) => (
                            <TableRow
                              id={`enum-${enumId}-${key}`}
                              key={enumLabelIndex}
                              {...regRow(`enumLabels-${enumId}`, enumLabelIndex)}
                            >
                              <TableCell {...regCell(`enumLabels-${enumId}`, enumLabelIndex, 0)}>
                                <SheetCellInput
                                  editable={isFocused(`enumLabels-${enumId}`, enumLabelIndex, 0)}
                                  initialValue={key}
                                  onChange={(newValue) => {
                                    setFocusedCursor(null);
                                    if (newValue !== key) {
                                      modifyEnumLabels(enumId, enumLabelIndex, "key", newValue);

                                      setFocusedCursor({
                                        sheet: `enumLabels-${enumId}`,
                                        y: enumLabelIndex,
                                        x: 1,
                                      });
                                    }
                                  }}
                                />
                              </TableCell>
                              <TableCell {...regCell(`enumLabels-${enumId}`, enumLabelIndex, 1)}>
                                <SheetCellInput
                                  editable={isFocused(`enumLabels-${enumId}`, enumLabelIndex, 1)}
                                  initialValue={label}
                                  onChange={(newValue) => {
                                    setFocusedCursor(null);
                                    if (newValue !== label) {
                                      modifyEnumLabels(enumId, enumLabelIndex, "label", newValue);
                                    }
                                  }}
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow>
                            <TableCell colSpan={2} className="text-center">
                              <Button
                                size="xs"
                                variant="default"
                                icon={<PlusIcon />}
                                className="mx-auto py-[0.3em] px-4"
                                onClick={() => addEnumLabelRow(enumId)}
                              />
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {entity && Object.keys(entity.subsets).length > 0 && (
              <div className="flex-[0.5]">
                <h3>
                  {SD("entity.subsets")}{" "}
                  <Button
                    size="xs"
                    icon={<PlusIcon />}
                    variant="default"
                    onClick={() => addSubsetKey()}
                  />
                </h3>
                {entity && entity.flattenSubsetRows.length > 0 && (
                  <Table className="border border-separate border-spacing-0 rounded-lg bg-white overflow-hidden">
                    <TableHeader className="bg-gray-50">
                      <TableRow>
                        <TableHead>Field</TableHead>
                        {Object.keys(entity.subsets).map((subsetKey) => (
                          <TableHead key={subsetKey}>
                            <div className="flex items-center gap-2">
                              Subset{subsetKey}
                              <ConeButton
                                size="sm"
                                onClick={() => {
                                  setSubsetConeModal({ open: true, subsetKey });
                                }}
                              />
                              {subsetKey !== "A" && (
                                <Button
                                  icon={<Trash2Icon />}
                                  size="xs"
                                  variant="destructive"
                                  className="btn-del-subset"
                                  onClick={() => delSubset(subsetKey)}
                                />
                              )}
                            </div>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell></TableCell>
                        {Object.keys(entity.subsets).map((subsetKey) => (
                          <TableCell key={subsetKey}>
                            <Button
                              size="xs"
                              variant="ghost"
                              className="bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-full w-5 h-5 p-0 flex items-center justify-center"
                              onClick={() => toggleAllFieldsOnSubset(subsetKey)}
                            >
                              <span className="text-[11px] font-bold leading-none">!</span>
                            </Button>
                          </TableCell>
                        ))}
                      </TableRow>
                      {entity.flattenSubsetRows.map((subsetRow, subsetRowIndex) => (
                        <TableRow
                          id={[...subsetRow.prefixes, subsetRow.field].join(".")}
                          key={subsetRowIndex}
                          {...regRow("subsets", subsetRowIndex)}
                        >
                          <TableCell {...regCell("subsets", subsetRowIndex, 0)}>
                            <span className="text-gray-400">
                              {subsetRow.prefixes.join(" > ")}
                              {subsetRow.prefixes.length > 0 && " > "}
                            </span>
                            {subsetRow.field}
                            {subsetRow.relationEntity && (
                              <Button
                                variant="green"
                                size="xs"
                                className="ml-2"
                                onClick={expandRelationEntity(subsetRowIndex)}
                                disabled={subsetRow.isOpen}
                              >
                                {subsetRow.relationEntity}
                              </Button>
                            )}
                          </TableCell>
                          {Object.keys(entity.subsets).map((subsetKey) => (
                            <TableCell key={subsetKey}>
                              {subsetRow.relationEntity ? (
                                // oxlint-disable-next-line react/jsx-no-useless-fragment -- 필요한데?
                                <>
                                  {subsetRow.isOpen && (
                                    <Button
                                      size="xs"
                                      variant="ghost"
                                      className="bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-full w-5 h-5 p-0 flex items-center justify-center"
                                      onClick={() => toggleAllFieldsOnSubset(subsetKey, subsetRow)}
                                    >
                                      <span className="text-[11px] font-bold leading-none">!</span>
                                    </Button>
                                  )}
                                </>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <Checkbox
                                    checked={subsetRow.has[subsetKey]}
                                    onCheckedChange={(checked) => {
                                      const field = [...subsetRow.prefixes, subsetRow.field].join(
                                        ".",
                                      );
                                      if (checked === false) {
                                        // 서브셋의 필드 삭제
                                        omitFieldOnSubset(subsetKey, field);
                                      } else if (checked === true) {
                                        // 서브셋에 필드 추가 (internal에서 제거)
                                        if (subsetRow.isInternal?.[subsetKey]) {
                                          omitFieldOnSubsetInternal(subsetKey, field);
                                        }
                                        appendFieldOnSubset(subsetKey, field);
                                      }
                                    }}
                                  />
                                  <Button
                                    size="xs"
                                    variant="ghost"
                                    className={
                                      subsetRow.isInternal?.[subsetKey]
                                        ? "bg-orange-500 hover:bg-orange-600 text-white rounded-full w-4 h-4 p-0 flex items-center justify-center"
                                        : "bg-white hover:bg-gray-100 border border-gray-300 rounded-full w-4 h-4 p-0 flex items-center justify-center"
                                    }
                                    title="Internal: 쿼리만 수행하고 결과 타입에서 제외"
                                    onClick={() => {
                                      const field = [...subsetRow.prefixes, subsetRow.field].join(
                                        ".",
                                      );
                                      if (subsetRow.isInternal?.[subsetKey]) {
                                        // internal 해제
                                        omitFieldOnSubsetInternal(subsetKey, field);
                                      } else {
                                        // internal 설정 (일반에서 제거)
                                        if (subsetRow.has[subsetKey]) {
                                          omitFieldOnSubset(subsetKey, field);
                                        }
                                        appendFieldOnSubsetInternal(subsetKey, field);
                                      }
                                    }}
                                  >
                                    <span
                                      className={`text-[9px] font-bold leading-none ${
                                        subsetRow.isInternal?.[subsetKey]
                                          ? "text-white"
                                          : "text-gray-400"
                                      }`}
                                    >
                                      !
                                    </span>
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            )}
          </div>
        </>
      )}
      {entity && propModalData && (
        <EntityPropModal
          entityId={entity.id}
          oldOne={propModalData.oldOne}
          open={propModalOpen}
          onOpenChange={handlePropModalOpenChange}
          onCompleted={handlePropModalCompleted}
        />
      )}
      <EntitySelectorModal
        open={selectorModalOpen}
        onOpenChange={handleSelectorModalOpenChange}
        onCompleted={handleSelectorModalCompleted}
      />
      {entity && indexModalData && (
        <EntityIndexModal
          entityId={entity.id}
          table={entity.table}
          oldOne={indexModalData.oldOne}
          open={indexModalOpen}
          onOpenChange={handleIndexModalOpenChange}
          onCompleted={handleIndexModalCompleted}
        />
      )}
      {entity && (
        <ConeModal
          open={entityConeModalOpen}
          onOpenChange={setEntityConeModalOpen}
          title={`Entity: ${entity.id}`}
          cone={entity.cone}
          onSave={async (cone) => {
            await SonamuUIService.updateEntityCone(entity.id, cone);
            refetch();
          }}
        />
      )}
      {entity && propConeModal && propConeModal.open && (
        <ConeModal
          open={propConeModal.open}
          onOpenChange={(open) => {
            if (!open) {
              setPropConeModal(null);
            }
          }}
          title={`Prop: ${entity.id}.${propConeModal.propName}`}
          cone={entity.props.find((p) => p.name === propConeModal.propName)?.cone}
          onSave={async (cone) => {
            await SonamuUIService.updatePropCone(entity.id, propConeModal.propName, cone);
            refetch();
            setPropConeModal(null);
          }}
        />
      )}
      {entity && enumConeModal && enumConeModal.open && (
        <ConeModal
          open={enumConeModal.open}
          onOpenChange={(open) => {
            if (!open) {
              setEnumConeModal(null);
            }
          }}
          title={`Enum: ${enumConeModal.enumId}`}
          cone={entity.enumCones?.[enumConeModal.enumId]}
          onSave={async (cone) => {
            await SonamuUIService.updateEnumCone(entity.id, enumConeModal.enumId, cone);
            refetch();
            setEnumConeModal(null);
          }}
        />
      )}
      {entity && subsetConeModal && subsetConeModal.open && (
        <ConeModal
          open={subsetConeModal.open}
          onOpenChange={(open) => {
            if (!open) {
              setSubsetConeModal(null);
            }
          }}
          title={`Subset: ${entity.id}.Subset${subsetConeModal.subsetKey}`}
          cone={entity.subsetCones?.[subsetConeModal.subsetKey]}
          onSave={async (cone) => {
            await SonamuUIService.updateSubsetCone(entity.id, subsetConeModal.subsetKey, cone);
            refetch();
            setSubsetConeModal(null);
          }}
        />
      )}
      {/* Cone Generation Loading Modal */}
      <Dialog open={generatingCones} onOpenChange={() => {}}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cone 생성 중</DialogTitle>
            <DialogDescription>AI가 전체 Cone을 생성하고 있습니다...</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <Loader2Icon className="h-12 w-12 animate-spin text-blue-500" />
            <p className="text-sm text-gray-600">
              예상 시간: 10-30초
              <br />
              잠시만 기다려주세요...
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
