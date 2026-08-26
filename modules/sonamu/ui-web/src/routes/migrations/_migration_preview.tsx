import {
  Badge,
  Button,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@sonamu-kit/react-components";
import classNames from "classnames";
import { useState } from "react";
import { type GenMigrationCode, type MigrationConnectionMeta, type MigrationTarget } from "sonamu";
import CodeIcon from "~icons/lucide/code";
import PlayIcon from "~icons/lucide/play";

type MigrationPreviewProps = {
  connections: MigrationConnectionMeta[];
  compareConnKey?: MigrationTarget;
  preparedCodes?: GenMigrationCode[];
  loading: boolean;
  generating: boolean;
  onCompareConnKeyChange: (connKey: MigrationTarget) => void;
  onGenerate: () => void;
};

export function MigrationPreview({
  connections,
  compareConnKey,
  preparedCodes,
  loading,
  generating,
  onCompareConnKeyChange,
  onGenerate,
}: MigrationPreviewProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h3 className="my-0! flex h-10 shrink-0 items-center">비교·생성</h3>
        <span className="flex h-10 min-w-0 basis-full items-center gap-2 text-sm font-normal sm:ml-4 sm:basis-auto">
          <span className="shrink-0">기준 DB:</span>
          {connections.length > 0 && compareConnKey !== undefined ? (
            <Select
              className="min-w-0 flex-1 border-border sm:w-[180px] sm:flex-none"
              items={connections.map(({ connKey, name }) => ({ value: connKey, label: name }))}
              value={compareConnKey}
              onValueChange={(value) => {
                if (value !== undefined) onCompareConnKeyChange(value as MigrationTarget);
              }}
            />
          ) : (
            <span className="text-muted-foreground">비교 가능한 최신 DB가 없습니다.</span>
          )}
        </span>
        <span className="flex min-w-0 basis-full flex-wrap items-center gap-2 sm:ml-auto sm:basis-auto sm:flex-nowrap">
          <Button
            size="sm"
            variant="secondary"
            icon={<CodeIcon />}
            disabled={(preparedCodes?.length ?? 0) === 0}
            aria-expanded={expanded}
            aria-controls="proposed-code-previews"
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? "모두 접기" : "모두 펼치기"}
          </Button>
          <Button
            size="sm"
            icon={<PlayIcon />}
            disabled={compareConnKey === undefined || loading || generating}
            onClick={onGenerate}
          >
            마이그레이션 생성 ({preparedCodes?.length ?? 0})
          </Button>
        </span>
      </div>
      <Table className="text-[0.9em]">
        <TableHeader>
          <TableRow className="hover:bg-transparent bg-gray-100">
            <TableHead style={{ width: "90px" }}>유형</TableHead>
            <TableHead style={{ width: "160px" }}>테이블</TableHead>
            <TableHead>생성될 파일</TableHead>
            <TableHead style={{ width: "50%" }}>코드</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody id="proposed-code-previews">
          {(preparedCodes?.length ?? 0) === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                생성할 변경사항이 없습니다.
              </TableCell>
            </TableRow>
          ) : null}
          {preparedCodes?.map((change, index) => (
            <TableRow key={`${change.title}-${index}`}>
              <TableCell className="align-top py-3">
                <Badge
                  variant="outline"
                  className={classNames("w-16 justify-center", {
                    "border-green-300 bg-green-100/60 text-green-800": change.type === "normal",
                    "border-gray-300 bg-gray-100 text-gray-600": change.type === "foreign",
                  })}
                >
                  {change.type.toUpperCase()}
                </Badge>
              </TableCell>
              <TableCell className="font-mono align-top py-3">{change.table}</TableCell>
              <TableCell className="font-mono align-top py-3">{change.title}</TableCell>
              <TableCell className="py-2">
                {expanded ? (
                  <pre className="max-w-full overflow-x-auto whitespace-pre rounded-lg bg-green-50 p-4 font-mono text-sm leading-relaxed text-gray-900">
                    <code>{change.formatted ?? ""}</code>
                  </pre>
                ) : (
                  <span className="text-muted-foreground/40">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
