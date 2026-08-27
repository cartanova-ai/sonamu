import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@sonamu-kit/react-components";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import DownloadIcon from "~icons/lucide/download";
import PlusIcon from "~icons/lucide/plus";
import RefreshCwIcon from "~icons/lucide/refresh-cw";
import TrashIcon from "~icons/lucide/trash-2";
import UploadIcon from "~icons/lucide/upload";

import { useSonamuContext } from "../contexts/sonamu-provider";
import { SonamuUIService } from "../services/sonamu-ui.service";
import { defaultCatch } from "../services/sonamu.shared";

type I18nDictionaryRow = SonamuUIService.I18nDictionaryRow;

export const Route = createFileRoute("/i18n")({
  component: I18nIndex,
});

function handleExport(): void {
  window.location.href = "/sonamu-ui/api/i18n/export";
}

function I18nIndex() {
  const { SD } = useSonamuContext();
  const { data, error, refetch } = SonamuUIService.useI18nDictionary();
  const { rows, locales, defaultLocale, stats } = data ?? {};

  const isLoading = !error && !data;
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 편집 상태
  const [editingCell, setEditingCell] = useState<{
    key: string;
    field: "key" | string; // "key" 또는 locale명
  } | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // 미사용 키 상태
  const [unusedKeys, setUnusedKeys] = useState(new Set());
  const [usageCheckError, setUsageCheckError] = useState<string | null>(null);

  // 키 추가 모달 상태
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValues, setNewValues] = useState<Record<string, string>>({});

  // 편집 모드 진입 시 input에 포커스
  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  // 데이터 로드 시 자동으로 미사용 키 검사
  useEffect(() => {
    if (!rows || rows.length === 0) return;

    const checkUsage = async () => {
      const projectKeys = rows.filter((row) => row.source === "project").map((row) => row.key);
      if (projectKeys.length === 0) return;

      try {
        const result = await SonamuUIService.checkI18nUsage(projectKeys);
        if (result.error) {
          setUsageCheckError(result.error);
          return;
        }
        setUnusedKeys(new Set(result.unusedKeys));
        setUsageCheckError(null);
      } catch {
        // 네트워크 오류 등은 무시
      }
    };

    checkUsage();
  }, [rows]);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      await SonamuUIService.importI18n(file);
      await refetch();
      alert("Import completed successfully!");
    } catch (err) {
      defaultCatch(err);
    } finally {
      setLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // 편집 시작
  const startEdit = (row: I18nDictionaryRow, field: "key" | string) => {
    if (row.source === "sonamu") return; // sonamu source는 편집 불가

    const currentValue = field === "key" ? row.key : String(row[field] ?? "");
    setEditingCell({ key: row.key, field });
    setEditValue(currentValue);
  };

  // 편집 저장
  const saveEdit = async (row: I18nDictionaryRow) => {
    if (!editingCell || !locales) return;

    const { field } = editingCell;
    const oldKey = row.key;

    // 값이 변경되지 않았으면 취소
    const originalValue = field === "key" ? row.key : String(row[field] ?? "");
    if (editValue === originalValue) {
      setEditingCell(null);
      return;
    }

    setLoading(true);
    try {
      if (field === "key") {
        // key 변경: 모든 locale 값을 함께 전송
        const values: Record<string, string> = {};
        for (const locale of locales) {
          if (row[locale]) {
            values[locale] = String(row[locale]);
          }
        }
        await SonamuUIService.updateI18n({
          oldKey,
          newKey: editValue,
          source: row.source,
          values,
        });
      } else {
        // value 변경: 해당 locale만 전송
        await SonamuUIService.updateI18n({
          oldKey,
          newKey: oldKey,
          source: row.source,
          values: { [field]: editValue },
        });
      }
      await refetch();
    } catch (err) {
      defaultCatch(err);
    } finally {
      setLoading(false);
      setEditingCell(null);
    }
  };

  // 편집 취소
  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue("");
  };

  // 키 추가 모달 열기
  const openCreateModal = () => {
    setNewKey("");
    setNewValues({});
    setShowCreateModal(true);
  };

  // 키 추가
  const handleCreate = async () => {
    if (!newKey.trim()) {
      alert("키를 입력해주세요");
      return;
    }

    setLoading(true);
    try {
      await SonamuUIService.createI18n({
        key: newKey.trim(),
        values: newValues,
      });
      setShowCreateModal(false);
      await refetch();
    } catch (err) {
      defaultCatch(err);
    } finally {
      setLoading(false);
    }
  };

  // 키 삭제
  const handleDelete = async (key: string) => {
    if (!confirm(SD("i18n.confirm.delete").replace("{key}", key))) {
      return;
    }

    setLoading(true);
    try {
      await SonamuUIService.deleteI18n(key);
      await refetch();
    } catch (err) {
      defaultCatch(err);
    } finally {
      setLoading(false);
    }
  };

  // 키보드 이벤트 핸들러
  const handleKeyDown = (e: React.KeyboardEvent, row: I18nDictionaryRow) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveEdit(row);
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  };

  // 편집 가능한 셀 렌더링
  const renderEditableCell = (
    row: I18nDictionaryRow,
    field: "key" | string,
    content: React.ReactNode,
    className?: string,
  ) => {
    const isEditing = editingCell?.key === row.key && editingCell?.field === field;
    const isEditable = row.source !== "sonamu";

    if (isEditing) {
      return (
        <TableCell className={className}>
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => saveEdit(row)}
            onKeyDown={(e) => handleKeyDown(e, row)}
            className="w-full px-2 py-1 text-sm border border-blue-400 rounded outline-none focus:ring-2 focus:ring-blue-200"
          />
        </TableCell>
      );
    }

    return (
      <TableCell
        className={`${className} ${isEditable ? "cursor-pointer hover:bg-blue-50" : ""}`}
        onDoubleClick={() => isEditable && startEdit(row, field)}
      >
        {content}
      </TableCell>
    );
  };

  return (
    <div className="p-8">
      <div
        className={`block p-4 bg-white border border-gray-200 rounded-md shadow-sm ${loading || isLoading ? "opacity-50 pointer-events-none" : ""}`}
      >
        <div className="p-4">
          <div
            className="flex items-center gap-2 mb-4"
            style={{ display: "flex", alignItems: "baseline" }}
          >
            <h3>{SD("i18n.title")}</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={loading}
              icon={<RefreshCwIcon className="w-4 h-4" />}
            ></Button>
          </div>

          <div className="flex gap-2 mb-4">
            <Button
              onClick={openCreateModal}
              disabled={loading}
              icon={<PlusIcon className="w-4 h-4" />}
            >
              {SD("i18n.addKey")}
            </Button>
            <Button
              onClick={handleExport}
              disabled={loading}
              icon={<UploadIcon className="w-4 h-4" />}
            >
              {SD("i18n.exportExcel")}
            </Button>
            <Button
              onClick={handleImportClick}
              disabled={loading}
              icon={<DownloadIcon className="w-4 h-4" />}
            >
              {SD("i18n.importExcel")}
            </Button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".xlsx,.xls"
              className="hidden"
            />
          </div>

          <p className="text-sm text-gray-500 mb-4">{SD("i18n.editHint")}</p>

          {usageCheckError && (
            <p className="text-sm text-yellow-600 mb-4 p-2 bg-yellow-50 rounded">
              &#x26A0; {usageCheckError}
            </p>
          )}

          {isLoading && <div className="text-gray-500">{SD("common.loading")}</div>}
          {error && (
            <div className="text-red-500">
              {SD("common.error")}: {String(error)}
            </div>
          )}

          {rows && locales && (
            <Table containerClassName="border rounded-lg overflow-auto max-h-[calc(100vh-250px)]">
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky top-0 z-10 min-w-[300px] bg-gray-100">
                    {SD("i18n.key")}
                  </TableHead>
                  <TableHead className="sticky top-0 z-10 min-w-[100px] bg-gray-100">
                    {SD("i18n.source")}
                  </TableHead>
                  {locales.map((locale) => (
                    <TableHead key={locale} className="sticky top-0 z-10 min-w-[200px] bg-gray-100">
                      {locale}
                      {locale === defaultLocale && " (default)"}
                      {stats?.[locale] && (
                        <span
                          className={`ml-2 text-xs ${
                            stats[locale].percent === 100
                              ? "text-green-600"
                              : stats[locale].percent >= 80
                                ? "text-yellow-600"
                                : "text-red-600"
                          }`}
                        >
                          {stats[locale].percent}%
                        </span>
                      )}
                    </TableHead>
                  ))}
                  <TableHead className="sticky top-0 z-10 w-[60px] bg-gray-100"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.key}
                    className={row.source === "sonamu" ? "bg-gray-50 text-gray-500" : undefined}
                  >
                    {renderEditableCell(
                      row,
                      "key",
                      <>
                        {!usageCheckError && unusedKeys.has(row.key) && (
                          <span className="text-red-500 mr-1" title="미사용 키">
                            &#x2757;
                          </span>
                        )}
                        {row.key}
                      </>,
                      "font-mono text-sm",
                    )}
                    <TableCell>
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          row.source === "entity"
                            ? "bg-blue-100 text-blue-700"
                            : row.source === "sonamu"
                              ? "bg-gray-200 text-gray-600"
                              : "bg-green-100 text-green-700"
                        }`}
                      >
                        {row.source}
                      </span>
                    </TableCell>
                    {locales.map((locale) => {
                      const isEmpty = !row[locale];
                      return renderEditableCell(
                        row,
                        locale,
                        isEmpty ? <span className="text-yellow-600">&#x26A0; -</span> : row[locale],
                        `text-sm ${isEmpty ? "bg-yellow-50" : ""}`,
                      );
                    })}
                    <TableCell>
                      {row.source === "project" && (
                        <button
                          type="button"
                          onClick={() => handleDelete(row.key)}
                          className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                          title="Delete key"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="mt-4 text-sm text-gray-500">
            {rows && <span>{SD("i18n.totalKeys").replace("{count}", String(rows.length))}</span>}
          </div>
        </div>
      </div>

      {/* 키 추가 모달 */}
      {showCreateModal && locales && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4">{SD("i18n.modal.addNewKey")}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {SD("i18n.key")}
                </label>
                <input
                  type="text"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="e.g. common.myNewKey"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {locales.map((locale) => (
                <div key={locale}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {locale}
                    {locale === defaultLocale && " (default)"}
                  </label>
                  <input
                    type="text"
                    value={newValues[locale] ?? ""}
                    onChange={(e) =>
                      setNewValues((prev) => ({ ...prev, [locale]: e.target.value }))
                    }
                    placeholder={SD("i18n.modal.valueFor").replace("{locale}", locale)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button
                variant="outline"
                onClick={() => setShowCreateModal(false)}
                disabled={loading}
              >
                {SD("common.cancel")}
              </Button>
              <Button onClick={handleCreate} disabled={loading}>
                {loading ? SD("i18n.creating") : SD("common.create")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
