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
import { useRef, useState } from "react";
import DownloadIcon from "~icons/lucide/download";
import RefreshCwIcon from "~icons/lucide/refresh-cw";
import UploadIcon from "~icons/lucide/upload";
import { defaultCatch } from "../services/sonamu.shared";
import { SonamuUIService } from "../services/sonamu-ui.service";

export const Route = createFileRoute("/i18n")({
  component: I18nIndex,
});

function I18nIndex() {
  const { data, error, refetch } = SonamuUIService.useI18nDictionary();
  const { rows, locales, defaultLocale } = data ?? {};

  const isLoading = !error && !data;
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
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

          {isLoading && <div className="text-gray-500">Loading...</div>}
          {error && <div className="text-red-500">Error: {String(error)}</div>}

          {rows && locales && (
            <Table containerClassName="border rounded-lg overflow-auto max-h-[calc(100vh-200px)]">
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
                    <TableCell className="font-mono text-sm">{row.key}</TableCell>
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
                    {locales.map((locale) => (
                      <TableCell key={locale} className="text-sm">
                        {row[locale] ?? <span className="text-gray-400 italic">-</span>}
                      </TableCell>
                    ))}
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
