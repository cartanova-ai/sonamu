import { useState } from "react";
import PlusIcon from "~icons/lucide/plus";

import { useSonamuBaseContext } from "../../../contexts/sonamu-context";
import { Button } from "../button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../dialog";
import { RuleRowInput } from "./rule-row-input";
import { type FilterQuery, type Rule, type SonamuFilterModalProps } from "./types";
import { extractFieldMetaFromSchema } from "./utils";

const EMPTY_INITIAL_RULES: Rule[] = [];

/**
 * SonamuFilterModal
 *
 * Zod 스키마 기반 필터 UI 생성
 */
export function SonamuFilterModal({
  baseSchema,
  open,
  onOpenChange,
  initialRules = EMPTY_INITIAL_RULES,
  onApply,
}: SonamuFilterModalProps) {
  const { SD } = useSonamuBaseContext();

  // Apply된 최종 상태
  const [appliedRules, setAppliedRules] = useState(initialRules);
  // 작업 중 상태
  const [rules, setRules] = useState<Rule[]>([]);
  const [previousInitialRules, setPreviousInitialRules] = useState(initialRules);
  const [wasOpen, setWasOpen] = useState(open);

  // 외부 규칙 또는 열림 상태가 바뀐 렌더에서 임시 규칙을 즉시 맞춥니다.
  if (previousInitialRules !== initialRules) {
    setPreviousInitialRules(initialRules);
    setAppliedRules(initialRules);
    if (open) {
      setRules(initialRules.map((rule) => ({ ...rule })));
    }
  } else if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setRules(appliedRules.map((rule) => ({ ...rule })));
    }
  }

  // baseSchema에서 동적으로 FieldMeta 추출
  const fieldMeta = extractFieldMetaFromSchema(baseSchema, SD);

  // Rule 추가
  const addRule = () => {
    setRules([
      ...rules,
      {
        id: crypto.randomUUID(),
        field: null,
        operator: null,
        value: undefined,
      },
    ]);
  };

  // Rule 삭제
  const removeRule = (id: string) => {
    setRules(rules.filter((rule) => rule.id !== id));
  };

  // Rule 업데이트
  const updateRule = (id: string, updates: Partial<Rule>) => {
    setRules(rules.map((rule) => (rule.id === id ? { ...rule, ...updates } : rule)));
  };

  // FilterQuery로 변환
  const buildFilterQuery = (): FilterQuery => {
    const filters: FilterQuery = {};

    for (const rule of rules) {
      if (!rule.field || !rule.operator) continue;

      // isNull/isNotNull은 객체 형태로
      if (rule.operator === "isNull" || rule.operator === "isNotNull") {
        filters[rule.field] = { [rule.operator]: rule.value };
      } else {
        // 다른 연산자들
        filters[rule.field] = { [rule.operator]: rule.value };
      }
    }

    return filters;
  };

  // Apply 버튼 클릭
  const handleApply = () => {
    const filters = buildFilterQuery();
    const confirmedRules = rules.map((rule) => ({ ...rule }));
    // 현재 rules를 확정 상태로 저장
    setAppliedRules(confirmedRules);
    onApply?.(filters, confirmedRules);
    onOpenChange(false);
  };

  // Reset 버튼 클릭 (모든 rule 제거)
  const handleReset = () => {
    setRules([]);
  };

  // Cancel 버튼 클릭 (작업 내용 버림)
  const handleCancel = () => {
    // rules 변경사항을 버리고 appliedRules로 복원
    setRules(appliedRules.map((rule) => ({ ...rule })));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{SD("rc.sonamuFilter.title")}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4 py-4">
          {/* Rules */}
          {rules.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">{SD("rc.sonamuFilter.noRulesYet")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rules.map((rule) => (
                <RuleRowInput
                  key={rule.id}
                  rule={rule}
                  fieldMeta={fieldMeta}
                  onUpdate={(updates) => updateRule(rule.id, updates)}
                  onRemove={() => removeRule(rule.id)}
                />
              ))}
            </div>
          )}

          {/* Add Rule Button */}
          <div className="flex gap-2">
            <Button variant="outline" onClick={addRule} className="flex-1">
              <PlusIcon />
              {SD("rc.sonamuFilter.addRule")}
            </Button>
            {rules.length > 0 && (
              <Button variant="outline" onClick={handleReset} className="flex-1">
                {SD("rc.sonamuFilter.reset")}
              </Button>
            )}
          </div>

          {/* Preview JSON */}
          {rules.length > 0 && (
            <div className="border rounded-lg p-4 bg-muted/50">
              <h4 className="text-sm font-semibold mb-2">Preview (JSON)</h4>
              <pre className="text-xs overflow-auto max-h-[200px] bg-background p-3 rounded border">
                {JSON.stringify(buildFilterQuery(), null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Footer Buttons */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={handleCancel}>
            {SD("rc.common.cancel")}
          </Button>
          <Button onClick={handleApply}>{SD("rc.sonamuFilter.apply")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
