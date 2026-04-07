import { useCallback, useState } from "react";
import PlusIcon from "~icons/lucide/plus";
import TrashIcon from "~icons/lucide/trash-2";
import XIcon from "~icons/lucide/x";

import { defaultCatch } from "../../../services/sonamu.shared";
import { CddService } from "../service";

export function CddAddRuleModal({
  ruleKey,
  onClose,
  onSuccess,
}: {
  ruleKey: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [when, setWhen] = useState("");
  const [instruction, setInstruction] = useState("");
  const [examples, setExamples] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const canSubmit = when.trim() !== "" && instruction.trim() !== "";

  const handleAddExample = useCallback(() => {
    setExamples((prev) => [...prev, ""]);
  }, []);

  const handleRemoveExample = useCallback((index: number) => {
    setExamples((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleExampleChange = useCallback((index: number, value: string) => {
    setExamples((prev) => prev.map((v, i) => (i === index ? value : v)));
  }, []);

  const handleSubmit = () => {
    if (!canSubmit) return;
    setSaving(true);

    const filteredExamples = examples.filter((e) => e.trim() !== "");

    CddService.addCddRule({
      ruleKey,
      when: when.trim(),
      instruction: instruction.trim(),
      examples: filteredExamples.length > 0 ? filteredExamples : undefined,
    })
      .then(() => {
        onSuccess();
        onClose();
      })
      .catch(defaultCatch)
      .finally(() => setSaving(false));
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={handleBackdropClick}
      onKeyDown={undefined}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <div className="text-sm font-bold text-slate-900">Add Rule</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{ruleKey}.rules.json</div>
          </div>
          <button
            type="button"
            className="p-1 hover:bg-slate-100 rounded-md text-slate-400 cursor-pointer"
            onClick={onClose}
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">When</label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
              placeholder="이 규칙이 적용되는 상황"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Instruction</label>
            <textarea
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all resize-none"
              placeholder="따라야 할 규칙 내용"
              rows={4}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-600">
                Examples <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <button
                type="button"
                className="flex items-center gap-1 text-[10px] font-medium text-blue-600 hover:text-blue-700 cursor-pointer"
                onClick={handleAddExample}
              >
                <PlusIcon className="w-3 h-3" />
                Add
              </button>
            </div>
            {examples.length === 0 && <p className="text-xs text-slate-400">No examples added</p>}
            <div className="space-y-2">
              {examples.map((ex, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                    placeholder={`Example ${i + 1}`}
                    value={ex}
                    onChange={(e) => handleExampleChange(i, e.target.value)}
                  />
                  <button
                    type="button"
                    className="p-1.5 text-slate-400 hover:text-red-500 cursor-pointer"
                    onClick={() => handleRemoveExample(i)}
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2 shrink-0">
          <button
            type="button"
            className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleSubmit}
            disabled={!canSubmit || saving}
          >
            {saving ? "Adding..." : "Add Rule"}
          </button>
        </div>
      </div>
    </div>
  );
}
