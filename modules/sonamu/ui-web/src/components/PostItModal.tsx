import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Textarea,
} from "@sonamu-kit/react-components";
import { DndContext, useDraggable } from "@dnd-kit/core";
import { useEffect, useState } from "react";
import type { PostIt } from "sonamu";
import CodeIcon from "~icons/lucide/code";

type PostItModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  postIt?: PostIt;
  onSave: (postIt: PostIt) => Promise<void>;
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
    id: "postit-modal",
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

export function PostItModal({ open, onOpenChange, title, postIt, onSave }: PostItModalProps) {
  const [form, setForm] = useState<PostIt>({
    desc: "",
    note: "",
    tags: [],
    fixtureHint: "",
    fixtureGenerator: "",
    fixtureDefault: undefined,
    dataSource: undefined,
  });

  const [tagsInput, setTagsInput] = useState("");
  const [dataSourceInput, setDataSourceInput] = useState("");
  const [saving, setSaving] = useState(false);

  // 드래그 위치 상태 - 화면 중앙을 기본값으로
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (open && postIt) {
      setForm(postIt);
      setTagsInput(postIt.tags?.join(", ") || "");
      setDataSourceInput(postIt.dataSource ? JSON.stringify(postIt.dataSource, null, 2) : "");
    } else if (open && !postIt) {
      // Reset form for new postIt
      setForm({
        desc: "",
        note: "",
        tags: [],
        fixtureHint: "",
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
  }, [open, postIt]);

  // 드래그 종료 시 위치 저장
  const handleDragEnd = (event: any) => {
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
      let dataSource: PostIt["dataSource"];
      if (dataSourceInput.trim()) {
        try {
          dataSource = JSON.parse(dataSourceInput);
        } catch (e) {
          alert("Invalid JSON in dataSource field");
          setSaving(false);
          return;
        }
      }

      // Parse fixtureDefault if it's a string that looks like JSON
      let fixtureDefault = form.fixtureDefault;
      if (typeof fixtureDefault === "string" && fixtureDefault.trim()) {
        try {
          fixtureDefault = JSON.parse(fixtureDefault);
        } catch {
          // Keep as string if not valid JSON
        }
      }

      const postItToSave: PostIt = {
        ...form,
        tags: tags.length > 0 ? tags : undefined,
        dataSource,
        fixtureDefault,
        // Remove undefined fields
        desc: form.desc || undefined,
        note: form.note || undefined,
        fixtureHint: form.fixtureHint || undefined,
        fixtureGenerator: form.fixtureGenerator || undefined,
      };

      // Remove undefined keys
      Object.keys(postItToSave).forEach((key) => {
        if (postItToSave[key as keyof PostIt] === undefined) {
          delete postItToSave[key as keyof PostIt];
        }
      });

      await onSave(postItToSave);
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save postIt:", error);
      alert("Failed to save postIt");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DndContext onDragEnd={handleDragEnd}>
        <DraggableDialogContent
          className="max-w-md max-h-[80vh] flex flex-col shadow-[4px_4px_12px_rgba(0,0,0,0.2)]"
          style={{ backgroundColor: "var(--color-postit-bg)" }}
          position={position}
          dragHandleContent={
            <DialogHeader className="text-left">
              <DialogTitle className="text-gray-900 flex items-center gap-2 select-none">
                📝 {title}
              </DialogTitle>
              <DialogDescription className="sr-only">Edit post-it metadata</DialogDescription>
            </DialogHeader>
          }
        >

        <div className="overflow-y-scroll flex-1 space-y-4">
          {/* Description */}
          <div>
            <label className="block mb-1 font-bold text-gray-900">Description</label>
            <Input
              value={form.desc || ""}
              onChange={(e) => setForm({ ...form, desc: e.target.value })}
              placeholder="짧은 설명 (UI 라벨용)"
              style={{ backgroundColor: "var(--color-postit-input)" }}
            />
          </div>

          {/* Note */}
          <div>
            <label className="block mb-1 font-bold text-gray-900">Note</label>
            <Textarea
              value={form.note || ""}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="자유로운 메모 (무제한 길이)"
              rows={3}
              style={{ backgroundColor: "var(--color-postit-input)" }}
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block mb-1 font-bold text-gray-900">Tags</label>
            <Input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="쉼표로 구분 (예: core, auth, test)"
              style={{ backgroundColor: "var(--color-postit-input)" }}
            />
          </div>

          {/* Fixture Hint */}
          <div>
            <label className="block mb-1 font-bold text-gray-900">Fixture Hint</label>
            <Textarea
              value={form.fixtureHint || ""}
              onChange={(e) => setForm({ ...form, fixtureHint: e.target.value })}
              placeholder="Fixture 생성 시 힌트 (무제한 길이)"
              rows={4}
              style={{ backgroundColor: "var(--color-postit-input)" }}
            />
          </div>

          {/* Fixture Generator */}
          <div>
            <label className="block mb-1 font-bold text-gray-900 flex items-center gap-1">
              <CodeIcon className="w-4 h-4" />
              Fixture Generator
            </label>
            <Input
              value={form.fixtureGenerator || ""}
              onChange={(e) => setForm({ ...form, fixtureGenerator: e.target.value })}
              placeholder="예: faker.internet.email()"
              className="font-mono text-sm" style={{ backgroundColor: "var(--color-postit-input)" }}
            />
          </div>

          {/* Fixture Default */}
          <div>
            <label className="block mb-1 font-bold text-gray-900">Fixture Default</label>
            <Input
              value={
                form.fixtureDefault !== undefined
                  ? typeof form.fixtureDefault === "string"
                    ? form.fixtureDefault
                    : JSON.stringify(form.fixtureDefault)
                  : ""
              }
              onChange={(e) => setForm({ ...form, fixtureDefault: e.target.value })}
              placeholder="기본값 (JSON 또는 문자열)"
              style={{ backgroundColor: "var(--color-postit-input)" }}
            />
          </div>

          {/* Data Source */}
          <div>
            <label className="block mb-1 font-bold text-gray-900">Data Source</label>
            <Textarea
              value={dataSourceInput}
              onChange={(e) => setDataSourceInput(e.target.value)}
              placeholder={`JSON 형식:\n{\n  "strategy": "sample",\n  "limit": 10\n}`}
              rows={6}
              className="font-mono text-sm" style={{ backgroundColor: "var(--color-postit-input)" }}
            />
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
