import React, {
  ChangeEvent,
  HTMLAttributes,
  useEffect,
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
type OnChangeSingle = (e: AllEvent, data: { value: string | null }) => void;
type OnChangeMultiple = (e: AllEvent, data: { value: string[] }) => void;
export type ImageUploaderFrameProps = ({
  uploader: (domFiles: File[]) => Promise<string[]>;
  maxSize?: number;
} & (
  | {
      multiple: true;
      value: string[];
      onChange: OnChangeMultiple;
    }
  | {
      multiple: false;
      value: string | null;
      onChange: OnChangeSingle;
    }
)) &
  HTMLAttributes<HTMLDivElement>;
export function ImageUploaderFrame({
  uploader,
  multiple,
  maxSize,
  value,
  onChange,
  ...divProps
}: ImageUploaderFrameProps) {
  const [images, setImages] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (value === null || value === undefined) {
      setImages([]);
    } else if (value === "") {
      setImages([]);
    } else if (typeof value === "string") {
      setImages([value]);
    } else {
      setImages(value);
    }
  }, [value]);

  const setImagesWithOnChange = (
    e: AllEvent,
    callback: (images: string[]) => string[]
  ): void => {
    const res = callback(images);
    if (multiple) {
      (onChange as OnChangeMultiple)(e, {
        value: res,
      });
    } else {
      (onChange as OnChangeSingle)(e, {
        value: res.length > 0 ? res[0] : null,
      });
    }
  };

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
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
        const fileUrls = await Promise.all(
          Array.from(fileInput.files).map((domFile) =>
            uploadSingleFile(domFile)
          )
        );
        setImagesWithOnChange(e, (images) => {
          return [...images, ...fileUrls];
        });
      } else {
        const fileUrl = await uploadSingleFile(fileInput.files[0]);
        setImagesWithOnChange(e, (images) => {
          return [...images, fileUrl];
        });
      }
      setLoading(false);
    }
  };

  const handleButtonClick = (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>
  ) => {
    ref.current?.click();
  };

  const getHandlerImageDelButtonClicked = (index: number) => {
    return (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
      setImagesWithOnChange(e, (images) =>
        images.filter((image, _index) => _index !== index)
      );
    };
  };

  const uploadSingleFile = async (domFile: File): Promise<string> => {
    return new Promise((resolve) => {
      uploader([domFile]).then((result) => resolve(result[0]));
    });
  };

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(e.active.id);
  };
  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      setImagesWithOnChange(e, (images) => {
        const oldIndex = images.indexOf(active.id);
        const newIndex = images.indexOf(over.id);
        return arrayMove(images, oldIndex, newIndex);
      });
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
        style={{ display: "none" }}
      />
      {(multiple === true || images.length === 0) && (
        <Button
          size="tiny"
          style={{ width: 150, height: "36px", marginRight: "1em" }}
          onClick={handleButtonClick}
          disabled={maxSize !== undefined && images.length >= maxSize}
          loading={loading}
        >
          파일 선택{maxSize ? ` (${images.length} / ${maxSize})` : ""}
        </Button>
      )}
      {images.length > 0 && (
        <div className="images">
          <DndContext
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            onDragStart={handleDragStart}
          >
            <SortableContext items={images} strategy={rectSortingStrategy}>
              {images.map((image, index) => (
                <UploadedImage
                  key={index}
                  id={image}
                  src={image}
                  handle={multiple}
                  onDelButtonClicked={getHandlerImageDelButtonClicked(index)}
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
};
export function UploadedImage({
  id,
  src,
  onDelButtonClicked,
  handle,
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
  const handleCopyClick = () => {
    copyToClipboard(src);
    alert("URL 복사됨");
  };

  function copyToClipboard(val: string) {
    const element = document.createElement("textarea");
    element.value = val;
    element.setAttribute("readonly", "");
    element.style.position = "absolute";
    element.style.left = "-9999px";
    document.body.appendChild(element);
    element.select();
    var returnValue = document.execCommand("copy");
    document.body.removeChild(element);
    if (!returnValue) {
      throw new Error("copied nothing");
    }
  }

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
    >
      <img src={src} onClick={handleImgClick} />
      <ButtonGroup size="mini" className="buttons">
        {handle && (
          <Button
            color="blue"
            icon="grab"
            {...listeners}
            {...attributes}
          ></Button>
        )}
        <Button color="grey" icon="copy" onClick={handleCopyClick} />
        {onDelButtonClicked && (
          <Button color="red" icon="trash" onClick={onDelButtonClicked} />
        )}
      </ButtonGroup>
    </div>
  );
}
