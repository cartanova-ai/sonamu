import React, {
  ChangeEvent,
  HTMLAttributes,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button, ButtonGroup } from "semantic-ui-react";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable";
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import classnames from "classnames";

type AllEvent =
  | ChangeEvent<HTMLInputElement>
  | DragEndEvent
  | React.MouseEvent<HTMLButtonElement, MouseEvent>;

type OnChange<T> = (e: AllEvent, data: { value: T }) => void;
type CommonProps<T> = Omit<HTMLAttributes<HTMLDivElement>, "onChange"> & {
  maxSize?: number;
  accept?: string;
  preview?: boolean;
} & (
    | {
        multiple: true;
        value: T[];
        onChange: OnChange<T[]>;
      }
    | {
        multiple: false;
        value: T | null;
        onChange: OnChange<T | null>;
      }
  );

export type UploadedFile = { url: string; name: string };

type EagerModeProps = { mode: "eager" } & CommonProps<UploadedFile> & {
    uploader: (domFiles: File[]) => Promise<UploadedFile[]>;
  };
type LazyModeProps = { mode: "lazy" } & CommonProps<File>;
export type ImageUploaderFrameProps = EagerModeProps | LazyModeProps;

function asArray<T>(v: T | T[] | null | undefined): T[] {
  if (v == null) return [];
  return (Array.isArray(v) ? v : [v]).filter(
    (item) => item != null && item !== ""
  );
}

// TODO: 임시로 주석처리
function useObjectUrls(files: File[]) {
  const [map, _setMap] = useState<Map<File, string>>(new Map());

  // useEffect(() => {
  //   const next = new Map<File, string>();
  //   for (const f of files) {
  //     const kept = map.get(f);
  //     next.set(f, kept ?? URL.createObjectURL(f));
  //   }

  //   for (const [f, url] of map.entries()) {
  //     if (!files.includes(f)) URL.revokeObjectURL(url);
  //   }

  //   setMap(next);
  // }, [files]);

  // useEffect(
  //   () => () => {
  //     for (const url of map.values()) URL.revokeObjectURL(url);
  //   },
  //   [map]
  // );

  const urls = useMemo(() => files.map((f) => map.get(f) ?? ""), [files, map]);

  return urls;
}

export function ImageUploaderFrame(props: ImageUploaderFrameProps) {
  const mode = props.mode ?? "eager";
  const uploader =
    mode === "eager" ? (props as EagerModeProps).uploader : undefined;

  const { multiple, maxSize, value, onChange, accept, ...divProps } = props;
  const [loading, setLoading] = useState<boolean>(false);
  const ref = useRef<HTMLInputElement | null>(null);

  // Eager mode: value는 string[]
  const images = useMemo(
    () => (mode === "eager" ? asArray<UploadedFile>(value as any) : []),
    [mode, value]
  );
  // Lazy mode: value는 File[]
  const files = useMemo(
    () => (mode === "lazy" ? asArray<File>(value as any) : []),
    [mode, value]
  );
  const previewUrls = useObjectUrls(mode === "lazy" ? files : []);

  const items: string[] = useMemo(
    () => (mode === "eager" ? images.map((image) => image.url) : previewUrls),
    [mode, images, previewUrls]
  );

  const setImagesWithOnChange = (
    e: AllEvent,
    callback: (images: UploadedFile[]) => UploadedFile[]
  ): void => {
    const res = callback(images);
    if (multiple) {
      (onChange as OnChange<UploadedFile[]>)(e, {
        value: res,
      });
    } else {
      (onChange as OnChange<UploadedFile | null>)(e, {
        value: res.length > 0 ? res[0] : null,
      });
    }
  };

  const setFilesWithOnChange = (
    e: AllEvent,
    callback: (files: File[]) => File[]
  ): void => {
    const res = callback(files);
    if (multiple) {
      (onChange as OnChange<File[]>)(e, {
        value: res,
      });
    } else {
      (onChange as OnChange<File | null>)(e, {
        value: res.length > 0 ? res[0] : null,
      });
    }
  };

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (mode === "eager") {
      handleEagerChange(e);
    } else {
      handleLazyChange(e);
    }
  };

  const handleLazyChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const fileInput = e.target;
    if (fileInput.files && fileInput.files.length > 0) {
      if (multiple === true) {
        // maxSize 갯수 제한에 따른 메세지 처리
        if (maxSize && files.length + fileInput.files.length > maxSize) {
          if (files.length > 0) {
            alert(
              `최대 ${maxSize}개까지 업로드가 가능하므로, 추가로 ${
                maxSize - files.length
              }개 선택이 가능합니다.`
            );
          } else {
            alert(`최대 ${maxSize}개까지 업로드가 가능합니다.`);
          }
          fileInput.value = "";
          return;
        }
        const newFiles = Array.from(fileInput.files);
        setFilesWithOnChange(e, (files) => {
          return [...files, ...newFiles];
        });
      } else {
        setFilesWithOnChange(e, () => {
          return [fileInput.files![0]];
        });
      }
      fileInput.value = "";
    }
  };

  const handleEagerChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const fileInput = e.target;
    if (fileInput.files && fileInput.files.length > 0) {
      setLoading(true);
      if (multiple === true) {
        // maxSize 갯수 제한에 따른 메세지 처리
        if (maxSize && images.length + fileInput.files.length > maxSize) {
          if (images.length > 0) {
            alert(
              `최대 ${maxSize}개까지 업로드가 가능하므로, 추가로 ${
                maxSize - images.length
              }개 선택이 가능합니다.`
            );
          } else {
            alert(`최대 ${maxSize}개까지 업로드가 가능합니다.`);
          }
          setLoading(false);
          fileInput.value = "";
        }
        const uploadedFiles = await Promise.all(
          Array.from(fileInput.files).map((domFile) =>
            uploadSingleFile(domFile)
          )
        );
        setImagesWithOnChange(e, (images) => {
          return [...images, ...uploadedFiles];
        });
      } else {
        const uploadedFile = await uploadSingleFile(fileInput.files[0]);
        setImagesWithOnChange(e, (images) => {
          return [...images, uploadedFile];
        });
      }
      setLoading(false);
    }
  };

  const handleButtonClick = (
    _e: React.MouseEvent<HTMLButtonElement, MouseEvent>
  ) => {
    ref.current?.click();
  };

  const getHandlerImageDelButtonClicked = (index: number) => {
    return (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
      if (mode === "eager") {
        setImagesWithOnChange(e, (images) =>
          images.filter((_image, _index) => _index !== index)
        );
      } else {
        setFilesWithOnChange(e, (files) =>
          files.filter((_file, _index) => _index !== index)
        );
      }
    };
  };

  const uploadSingleFile = async (domFile: File): Promise<UploadedFile> => {
    if (!uploader) {
      throw new Error("uploader is required for eager mode");
    }
    const result = await uploader([domFile]);
    return result[0];
  };

  const [activeId, setActiveId] = useState<string | null>(null);
  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(e.active.id as string);
  };
  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      if (mode === "eager") {
        // eager 모드인 경우, images 순서 변경
        setImagesWithOnChange(e, (images) => {
          const oldIndex = items.indexOf(active.id as string);
          const newIndex = items.indexOf(over.id as string);
          return arrayMove(images, oldIndex, newIndex);
        });
      } else {
        // lazy 모드인 경우, files 순서 변경
        setFilesWithOnChange(e, (files) => {
          const oldIndex = items.findIndex((item) => item === active.id);
          const newIndex = items.findIndex((item) => item === over.id);
          return arrayMove(files, oldIndex, newIndex);
        });
      }
    }
    setActiveId(null);
  };

  return (
    <div
      {...divProps}
      className={classnames(
        `image-uploader ${multiple ? "multiple" : "single"}`,
        divProps.className
      )}
    >
      <input
        type="file"
        onChange={handleChange}
        ref={ref}
        multiple={multiple}
        accept={accept}
        style={{ display: "none" }}
      />
      {(multiple === true || items.length === 0) && (
        <Button
          size="tiny"
          style={{ width: 150, height: "36px", marginRight: "1em" }}
          onClick={handleButtonClick}
          disabled={maxSize !== undefined && items.length >= maxSize}
          loading={loading}
        >
          파일 선택{maxSize ? ` (${items.length} / ${maxSize})` : ""}
        </Button>
      )}
      {items.length > 0 && (
        <div className="images">
          <DndContext
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            onDragStart={handleDragStart}
          >
            <SortableContext items={items} strategy={rectSortingStrategy}>
              {items.map((item, index) => (
                <UploadedImage
                  key={index}
                  id={item}
                  src={item}
                  handle={multiple}
                  onDelButtonClicked={getHandlerImageDelButtonClicked(index)}
                  preview={props.preview ?? true}
                  name={
                    mode === "eager" ? images[index]?.name : files[index]?.name
                  }
                />
              ))}
              <DragOverlay>
                {activeId !== null ? (
                  <div className="uploaded-image active">
                    <img src={activeId} />
                  </div>
                ) : null}
              </DragOverlay>
            </SortableContext>
          </DndContext>
        </div>
      )}
    </div>
  );
}

type UploadedImageProps = {
  id: string;
  src: string;
  onDelButtonClicked?: (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>
  ) => void;
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
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
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
        {handle && (
          <Button
            color="blue"
            icon="grab"
            {...listeners}
            {...attributes}
          ></Button>
        )}
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
