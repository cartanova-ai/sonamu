import { DndContext, useDraggable } from "@dnd-kit/core";
import { type DragEndEvent } from "@dnd-kit/core";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea,
} from "@sonamu-kit/react-components";
import { useState } from "react";
import { type Cone } from "sonamu";
import { z } from "zod";
import ChevronDownIcon from "~icons/lucide/chevron-down";
import ChevronRightIcon from "~icons/lucide/chevron-right";

type ConeModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  cone?: Cone;
  onSave: (cone: Cone) => Promise<void>;
};

function DraggableDialogContent({
  children,
  className,
  style: customStyle,
  dragHandleContent,
  position,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  dragHandleContent: React.ReactNode;
  position: { x: number; y: number };
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: "cone-modal",
  });

  const style = {
    ...customStyle,
    transform: `translate(${position.x + (transform?.x || 0)}px, ${position.y + (transform?.y || 0)}px)`,
  };

  return (
    <DialogContent ref={setNodeRef} style={style} className={className}>
      <div {...listeners} {...attributes} className="cursor-grab active:cursor-grabbing">
        {dragHandleContent}
      </div>
      {children}
    </DialogContent>
  );
}

export function ConeModal({ open, onOpenChange, title, cone, onSave }: ConeModalProps) {
  const [form, setForm] = useState<Cone>({
    note: "",
    tags: [],
    fixtureGenerator: "",
    fixtureDefault: undefined,
    dataSource: undefined,
  });

  const [tagsInput, setTagsInput] = useState("");
  const [dataSourceInput, setDataSourceInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [advancedExpanded, setAdvancedExpanded] = useState(false);

  // 드래그 위치 상태 - 화면 중앙을 기본값으로
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [previousSource, setPreviousSource] = useState({ open, cone });

  if (previousSource.open !== open || previousSource.cone !== cone) {
    setPreviousSource({ open, cone });
    if (open && cone) {
      setForm(cone);
      setTagsInput(cone.tags?.join(", ") || "");
      setDataSourceInput(cone.dataSource ? JSON.stringify(cone.dataSource, null, 2) : "");
    } else if (open && !cone) {
      // Reset form for new cone
      setForm({
        note: "",
        tags: [],
        fixtureGenerator: "",
        fixtureDefault: undefined,
        dataSource: undefined,
      });
      setTagsInput("");
      setDataSourceInput("");
    }
    // 모달이 열릴 때 위치 초기화
    if (open) {
      setPosition({ x: 0, y: 0 });
    }
  }

  // 드래그 종료 시 위치 저장
  const handleDragEnd = (event: DragEndEvent) => {
    const { delta } = event;
    setPosition((prev) => ({
      x: prev.x + delta.x,
      y: prev.y + delta.y,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Parse tags
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      // Parse dataSource
      let dataSource: Cone["dataSource"];
      if (dataSourceInput.trim()) {
        try {
          dataSource = JSON.parse(dataSourceInput);
        } catch {
          alert("Invalid JSON in dataSource field");
          setSaving(false);
          return;
        }
      }

      // Parse fixtureDefault if it's a string that looks like JSON
      let fixtureDefault = form.fixtureDefault;
      const fixtureDefaultString = z.string().safeParse(fixtureDefault);
      if (fixtureDefaultString.success && fixtureDefaultString.data.trim()) {
        try {
          fixtureDefault = JSON.parse(fixtureDefaultString.data);
        } catch {
          // Keep as string if not valid JSON
        }
      }

      const coneToSave: Cone = {};
      if (form.note) coneToSave.note = form.note;
      if (tags.length > 0) coneToSave.tags = tags;
      if (form.fixtureGenerator) coneToSave.fixtureGenerator = form.fixtureGenerator;
      if (fixtureDefault !== undefined) coneToSave.fixtureDefault = fixtureDefault;
      if (dataSource !== undefined) coneToSave.dataSource = dataSource;

      await onSave(coneToSave);
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save cone:", error);
      alert("Failed to save cone");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DndContext onDragEnd={handleDragEnd}>
        <DraggableDialogContent
          className="max-w-md max-h-[80vh] flex flex-col shadow-[4px_4px_12px_rgba(0,0,0,0.2)]"
          style={{ backgroundColor: "var(--color-cone-bg)" }}
          position={position}
          dragHandleContent={
            <DialogHeader className="text-left">
              <DialogTitle className="text-gray-900 flex items-center gap-2 select-none">
                📝 {title}
              </DialogTitle>
              <DialogDescription className="sr-only">Edit cone metadata</DialogDescription>
            </DialogHeader>
          }
        >
          <div className="overflow-y-scroll flex-1 space-y-4">
            {/* Scale - 비즈니스 의미 + fixture 힌트 통합 서술 */}
            <div>
              <Textarea
                value={form.note || ""}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="이 대상이 무엇인지, fixture 생성 시 어떻게 생성할지 자유롭게 적어주세요..."
                rows={8}
                style={{ backgroundColor: "var(--color-cone-input)" }}
                className="text-sm"
              />
            </div>

            {/* Cone JSON Preview - Read-only collapsible section */}
            <div className="border border-gray-300 rounded-md overflow-hidden">
              <button
                type="button"
                onClick={() => setAdvancedExpanded(!advancedExpanded)}
                className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <span className="font-semibold text-gray-700 flex items-center gap-2">
                  {advancedExpanded ? (
                    <ChevronDownIcon className="w-4 h-4" />
                  ) : (
                    <ChevronRightIcon className="w-4 h-4" />
                  )}
                  Cone JSON 미리보기
                </span>
                <span className="text-xs text-gray-500">
                  {advancedExpanded ? "클릭하여 접기" : "entity.json에 저장될 내용"}
                </span>
              </button>

              {advancedExpanded && (
                <div className="p-4 bg-gray-50">
                  <pre className="bg-white text-gray-900 p-4 rounded-lg overflow-x-auto text-xs font-mono leading-relaxed border border-gray-200">
                    <code>
                      {JSON.stringify(
                        {
                          ...(form.note && { note: form.note }),
                          ...(form.tags && form.tags.length > 0 && { tags: form.tags }),
                          ...(form.fixtureGenerator && {
                            fixtureGenerator: form.fixtureGenerator,
                          }),
                          ...(form.fixtureDefault !== undefined && {
                            fixtureDefault: form.fixtureDefault,
                          }),
                          ...(form.dataSource && { dataSource: form.dataSource }),
                        },
                        null,
                        2,
                      )}
                    </code>
                  </pre>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="flex justify-end">
            <Button variant="default" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DraggableDialogContent>
      </DndContext>
    </Dialog>
  );
}
