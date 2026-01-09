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
import RefreshCwIcon from "~icons/lucide/refresh-cw";
import UploadIcon from "~icons/lucide/upload";
import { defaultCatch } from "../services/sonamu.shared";
import { SonamuUIService } from "../services/sonamu-ui.service";

type I18nDictionaryRow = SonamuUIService.I18nDictionaryRow;

export const Route = createFileRoute("/i18n")({
  component: I18nIndex,
});

function I18nIndex() {
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

  // 편집 모드 진입 시 input에 포커스
  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  const handleExport = async () => {
    setLoading(true);
    try {
      const blob = await SonamuUIService.exportI18n();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `i18n-${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      defaultCatch(e);
    } finally {
      setLoading(false);
    }
  };

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

    const currentValue = field === "key" ? row.key : ((row[field] as string) ?? "");
    setEditingCell({ key: row.key, field });
    setEditValue(currentValue);
  };

  // 편집 저장
  const saveEdit = async (row: I18nDictionaryRow) => {
    if (!editingCell || !locales) return;

    const { field } = editingCell;
    const oldKey = row.key;

    // 값이 변경되지 않았으면 취소
    const originalValue = field === "key" ? row.key : ((row[field] as string) ?? "");
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
            values[locale] = row[locale] as string;
          }
        }
        await SonamuUIService.updateI18n({
          oldKey,
          newKey: editValue,
          source: row.source as "entity" | "project",
          values,
        });
      } else {
        // value 변경: 해당 locale만 전송
        await SonamuUIService.updateI18n({
          oldKey,
          newKey: oldKey,
          source: row.source as "entity" | "project",
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
            <h3>i18n Dictionary</h3>
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
              onClick={handleExport}
              disabled={loading}
              icon={<DownloadIcon className="w-4 h-4" />}
            >
              Export Excel
            </Button>
            <Button
              onClick={handleImportClick}
              disabled={loading}
              icon={<UploadIcon className="w-4 h-4" />}
            >
              Import Excel
            </Button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".xlsx,.xls"
              className="hidden"
            />
          </div>

          <p className="text-sm text-gray-500 mb-4">
            Double-click on a cell to edit. Press Enter to save, Escape to cancel.
          </p>

          {isLoading && <div className="text-gray-500">Loading...</div>}
          {error && <div className="text-red-500">Error: {String(error)}</div>}

          {rows && locales && (
            <Table containerClassName="border rounded-lg overflow-auto max-h-[calc(100vh-250px)]">
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky top-0 z-10 min-w-[300px] bg-gray-100">Key</TableHead>
                  <TableHead className="sticky top-0 z-10 min-w-[100px] bg-gray-100">
                    Source
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.key}
                    className={row.source === "sonamu" ? "bg-gray-50 text-gray-500" : undefined}
                  >
                    {renderEditableCell(row, "key", row.key, "font-mono text-sm")}
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
                    {locales.map((locale) =>
                      renderEditableCell(
                        row,
                        locale,
                        row[locale] ?? <span className="text-gray-400 italic">-</span>,
                        "text-sm",
                      ),
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="mt-4 text-sm text-gray-500">
            {rows && <span>Total: {rows.length} keys</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
