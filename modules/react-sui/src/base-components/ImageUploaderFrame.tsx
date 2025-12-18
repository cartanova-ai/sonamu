/** biome-ignore-all lint: react-sui deprecated 예정이라 won't fix */

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import classnames from "classnames";
import type React from "react";
import {
  type ChangeEvent,
  type HTMLAttributes,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button, ButtonGroup } from "semantic-ui-react";

// lazy 모드에서 uploader 실행 후 최종 값을 반환
export function upload(): Promise<string[]> {
  return new Promise((resolve) => {
    document.dispatchEvent(
      new CustomEvent("app:image-uploader/commit", {
        detail: {
          channel: "image-uploader",
          done: resolve,
        },
      }),
    );
  });
}

type AllEvent =
  | ChangeEvent<HTMLInputElement>
  | DragEndEvent
  | React.MouseEvent<HTMLButtonElement, MouseEvent>;

type OnChange<T> = (e: AllEvent, data: { value: T }) => void;

export type UploadedFile = { url: string; name: string };

export type CommonProps = Omit<HTMLAttributes<HTMLDivElement>, "onChange"> & {
  mode: "eager" | "lazy";
  maxSize?: number;
  accept?: string;
  preview?: boolean;
};

// 단일 파일 모드
type SingleProps = CommonProps & {
  multiple?: false; // 생략되면 단일로 간주
  value: string;
  onChange: OnChange<string>;
  uploader: (domFile: File) => Promise<UploadedFile>;
};

// 다중 파일 모드
type MultiProps = CommonProps & {
  multiple: true;
  value: string[];
  onChange: OnChange<string[]>;
  uploader: (domFiles: File[]) => Promise<UploadedFile[]>;
};

export type ImageUploaderFrameProps = SingleProps | MultiProps;

function useObjectUrls(files: File[]) {
  const [urls, setUrls] = useState<string[]>([]);

  // files의 내용을 반영한 시그니처
  const signature = useMemo(
    () => files.map((f) => `${f.name}:${f.size}:${f.lastModified}`).join("|"),
    [files],
  );

  useEffect(() => {
    const created = files.map((f) => URL.createObjectURL(f));
    setUrls(created);

    return () => {
      for (const u of created) URL.revokeObjectURL(u);
    };
  }, [signature]); // files 대신 signature에 의존하여 불필요한 리렌더링 방지

  return urls;
}

function asArray<T>(v: T | T[] | null | undefined): T[] {
  if (Array.isArray(v)) return v.filter(Boolean) as T[];
  if (v == null || (typeof v === "string" && (v as any as string) === "")) return [];
  return [v as T];
}

// 신규 파일 고유 키 (name/mtime/size가 동일하면 같은 키로 간주)
const pendingKeyOf = (f: File) => `new:${f.name}:${f.lastModified}:${f.size}`;

/** forwardRef로 commit() 노출 */
export function ImageUploaderFrame(props: ImageUploaderFrameProps) {
  const {
    multiple = true,
    maxSize,
    value,
    onChange,
    accept,
    mode,
    uploader,
    preview = true,
    ...divProps
  } = props;

  // value는 내부에서 항상 string[]로 사용
  const urls = useMemo<string[]>(() => asArray<string>(value as any), [value]);

  const [loading, setLoading] = useState<boolean>(false);
  const refInput = useRef<HTMLInputElement | null>(null);

  // lazy 전용: 업로드 전 대기 파일
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const pendingPreviewUrls = useObjectUrls(mode === "lazy" ? pendingFiles : []);

  const emitChange = useCallback(
    (e: AllEvent | {}, next: string[]) => {
      if (multiple) {
        (onChange as OnChange<string[]>)(e as AllEvent, { value: next });
      } else {
        (onChange as OnChange<string>)(e as AllEvent, { value: next[0] ?? "" });
      }
    },
    [multiple, onChange],
  );

  // uploader를 항상 File[] -> UploadedFile[]으로 정규화
  const uploadNormalized = useCallback(
    async (files: File[]): Promise<UploadedFile[]> => {
      if (multiple) {
        const res = await (uploader as (fs: File[]) => Promise<UploadedFile[]>)(files);
        return res;
      }
      const single = await (uploader as (f: File) => Promise<UploadedFile>)(files[0]);
      return [single];
    },
    [uploader, multiple],
  );

  // ----- 통합 리스트 상태 (기존 + 신규) -----
  // 표시 순서(id 배열). 기존/신규를 한 리스트로 통합 표시
  const [order, setOrder] = useState<string[]>([]);

  // 현재 존재하는 아이디 목록 계산
  const existingIds = useMemo(() => urls.map((u) => `exist:${u}`), [urls]);
  const pendingIds = useMemo(
    () => (mode === "lazy" ? pendingFiles.map((f) => pendingKeyOf(f)) : []),
    [mode, pendingFiles],
  );
  const currentIds = useMemo(() => [...existingIds, ...pendingIds], [existingIds, pendingIds]);

  // order를 현재 아이템에 맞게 보정(유지 가능한 건 유지, 새로 생긴 건 뒤에 추가)
  useEffect(() => {
    setOrder((prev) => {
      if (!prev || prev.length === 0) return currentIds;
      const set = new Set(currentIds);
      const kept = prev.filter((id) => set.has(id));
      const missing = currentIds.filter((id) => !prev.includes(id));
      return [...kept, ...missing];
    });
  }, [currentIds]);

  // 화면에 뿌릴 통합 아이템
  type UnifiedItem = {
    id: string;
    kind: "exist" | "new";
    src: string;
    name: string;
  };

  const idToItem = useMemo(() => {
    const map = new Map<string, UnifiedItem>();
    // exist
    urls.forEach((u) => {
      map.set(`exist:${u}`, {
        id: `exist:${u}`,
        kind: "exist",
        src: u,
        name: u.split("/").pop() ?? "",
      });
    });
    // new
    if (mode === "lazy") {
      const previews = pendingPreviewUrls; // same order as pendingFiles
      pendingFiles.forEach((f, i) => {
        const id = pendingKeyOf(f);
        map.set(id, {
          id,
          kind: "new",
          src: previews[i] ?? "",
          name: f.name,
        });
      });
    }
    return map;
  }, [urls, mode, pendingFiles, pendingPreviewUrls]);

  const unifiedItems: UnifiedItem[] = useMemo(
    () => order.map((id) => idToItem.get(id)).filter(Boolean) as UnifiedItem[],
    [order, idToItem],
  );

  const totalCount = urls.length + (mode === "lazy" ? pendingFiles.length : 0);

  const isMaxSizeExceeded = (incomingCount: number) => {
    if (maxSize && totalCount + incomingCount > maxSize) {
      alert(`최대 ${maxSize}개까지 업로드가 가능합니다.`);
      return true;
    }
    return false;
  };

  const handleFilePick = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const fileList = input.files ? Array.from(input.files) : [];
    if (fileList.length === 0) return;

    if (isMaxSizeExceeded(fileList.length)) {
      input.value = "";
      return;
    }

    if (mode === "lazy") {
      // 업로드 전: 내부 pending에만 쌓아둠
      setPendingFiles((prev) => (multiple ? [...prev, ...fileList] : [fileList[0]]));
      input.value = "";
      return;
    }

    // eager: 선택 즉시 업로드 → 외부 urls에 바로 반영
    setLoading(true);
    try {
      const uploaded = await uploadNormalized(fileList);
      const uploadedUrls = uploaded.map((u) => u.url);
      const next = multiple ? [...urls, ...uploadedUrls] : uploadedUrls.slice(0, 1);
      emitChange(e, next);
    } catch (err) {
      console.error("Failed to upload files:", err);
      alert("파일 업로드 실패");
    } finally {
      setLoading(false);
      input.value = "";
    }
  };

  const handlePickButton = () => {
    refInput.current?.click();
  };

  // 삭제
  const handleDeleteExisting = (index: number) => {
    return (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
      e.stopPropagation();
      const next = urls.filter((_u, i) => i !== index);
      emitChange(e, next);
      // order는 currentIds 변경에 따라 effect로 보정됨
    };
  };
  const handleDeleteNewLazy = (index: number) => {
    return (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
      e.stopPropagation();
      setPendingFiles((prev) => prev.filter((_f, i) => i !== index));
    };
  };

  // 드래그: 통합 섹션 정렬
  const [activeId, setActiveId] = useState<string | null>(null);

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(e.active.id as string);
  };

  const handleDragEndUnified = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    if (!over || active.id === over.id) return;

    const oldIndex = order.indexOf(active.id as string);
    const newIndex = order.indexOf(over.id as string);
    if (oldIndex < 0 || newIndex < 0) return;

    const newOrder = arrayMove(order, oldIndex, newIndex);
    setOrder(newOrder);

    // 1) 기존 url의 새로운 순서 계산 → 외부 onChange
    const nextUrls = newOrder
      .filter((id) => id.startsWith("exist:"))
      .map((id) => id.slice("exist:".length));
    onChange(e, { value: nextUrls as any });

    // 2) pendingFiles의 새로운 순서 계산
    if (mode === "lazy") {
      const keyToFile = new Map(pendingFiles.map((f) => [pendingKeyOf(f), f]));
      const nextPending = newOrder
        .filter((id) => id.startsWith("new:"))
        .map((id) => keyToFile.get(id))
        .filter(Boolean) as File[];
      setPendingFiles(nextPending);
    }
  };

  // 커밋: 순서 보존하여 병합
  const handleCommit = useCallback(async () => {
    if (mode !== "lazy") return urls;
    if (pendingFiles.length === 0) return urls;

    setLoading(true);
    try {
      const uploaded = await uploadNormalized(pendingFiles); // UploadedFile[]
      const uploadedUrls = uploaded.map((u) => u.url);

      // order 순서대로 exist/new를 펼쳐서 최종 next 생성
      let upIdx = 0;
      const next: string[] = [];
      for (const id of order) {
        if (id.startsWith("exist:")) next.push(id.slice("exist:".length));
        else if (id.startsWith("new:")) next.push(uploadedUrls[upIdx++] ?? "");
      }
      const cleaned = next.filter(Boolean);

      onChange({} as any, {
        value: (multiple ? cleaned : cleaned.slice(0, 1)) as any,
      });
      setPendingFiles([]);
      return multiple ? cleaned : cleaned.slice(0, 1);
    } catch (err) {
      console.error("Failed to upload files:", err);
      alert("파일 업로드 실패");
      return urls;
    } finally {
      setLoading(false);
    }
  }, [mode, multiple, pendingFiles, urls, order, onChange, uploadNormalized]);

  // 업로드 후 next를 계산해서 onChange 호출 + done(next)로 반환
  useEffect(() => {
    const listener = async (ev: Event) => {
      const { channel, done } =
        (
          ev as CustomEvent<{
            channel: string;
            done: (v: string[]) => void;
          }>
        ).detail || {};

      if (channel !== "image-uploader") return;

      handleCommit().then(done);
    };

    document.addEventListener("app:image-uploader/commit", listener);
    return () => document.removeEventListener("app:image-uploader/commit", listener);
  }, [handleCommit]);

  return (
    <div
      {...divProps}
      className={classnames(
        `image-uploader ${multiple ? "multiple" : "single"}`,
        divProps.className,
      )}
    >
      <input
        type="file"
        onChange={handleFilePick}
        ref={refInput}
        multiple={multiple}
        accept={accept}
        style={{ display: "none" }}
      />
      <Button
        size="tiny"
        style={{ width: 150, height: "36px", marginRight: "1em" }}
        onClick={handlePickButton}
        disabled={
          (maxSize !== undefined && totalCount >= maxSize) ||
          (multiple === false && (urls.length > 0 || pendingFiles.length > 0))
        }
        loading={loading}
      >
        파일 선택{maxSize ? ` (${totalCount} / ${maxSize})` : ""}
      </Button>

      {/* 단일 리스트: 기존+신규 모두 함께 정렬 가능 */}
      <div className="images unified">
        <DndContext
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEndUnified}
        >
          <SortableContext items={unifiedItems.map((x) => x.id)} strategy={rectSortingStrategy}>
            {unifiedItems.map((item) => (
              <UploadedImage
                key={item.id}
                id={item.id}
                src={item.src}
                handle={true}
                onDelButtonClicked={
                  item.kind === "exist"
                    ? (() => {
                        const idx = urls.findIndex((u) => `exist:${u}` === item.id);
                        return idx >= 0 ? handleDeleteExisting(idx) : undefined;
                      })()
                    : (() => {
                        const idx = pendingFiles.findIndex((f) => pendingKeyOf(f) === item.id);
                        return idx >= 0 ? handleDeleteNewLazy(idx) : undefined;
                      })()
                }
                preview={preview}
                name={item.name}
              />
            ))}
            <DragOverlay>
              {activeId ? (
                <div className="uploaded-image active">
                  <img src={idToItem.get(activeId)?.src ?? ""} alt="" />
                </div>
              ) : null}
            </DragOverlay>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}

type UploadedImageProps = {
  id: string;
  src: string;
  onDelButtonClicked?: (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
  handle?: boolean;
  preview: ImageUploaderFrameProps["preview"];
  name?: string;
};
export function UploadedImage({
  id,
  src,
  onDelButtonClicked,
  handle,
  preview,
  name,
}: UploadedImageProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    transition: null,
  });

  const handleImgClick = () => {
    window.open(src);
  };

  const handleCopyClick = async () => {
    try {
      await navigator.clipboard.writeText(src);
      alert("URL 복사됨");
    } catch (err) {
      console.error("Failed to copy:", err);
      alert("URL 복사 실패");
    }
  };

  return (
    <div
      className="uploaded-image"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? "100" : "auto",
        opacity: isDragging ? 0.3 : 1,
      }}
      ref={setNodeRef}
      onClick={handleImgClick}
    >
      {preview ? <img src={src} /> : <span>{name ?? ""}</span>}
      <ButtonGroup size="mini" className="buttons">
        {handle && <Button color="blue" icon="grab" {...listeners} {...attributes}></Button>}
        <Button
          color="grey"
          icon="copy"
          onClick={(e) => {
            e.stopPropagation();
            handleCopyClick();
          }}
        />
        {onDelButtonClicked && (
          <Button
            color="red"
            icon="trash"
            onClick={(e) => {
              e.stopPropagation();
              onDelButtonClicked(e);
            }}
          />
        )}
      </ButtonGroup>
    </div>
  );
}
