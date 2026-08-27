/* oxlint-disable react/no-children-prop */ // 여기는 다 허용
/* oxlint-disable @typescript-eslint/no-explicit-any */ // 여기는 다 허용
/* oxlint-disable jsx-a11y/click-events-have-key-events */ // 여기는 다 허용
/* oxlint-disable jsx-a11y/no-static-element-interactions */ // 여기는 다 허용

import { Button, Checkbox, Select } from "@sonamu-kit/react-components";
import { camelize } from "inflection";
import { useState } from "react";
// 진짜 얼탱이없는 이슈: https://github.com/react-syntax-highlighter/react-syntax-highlighter/issues/539#issuecomment-1869182939
// 울며 겨자먹기 workaround입니다. 누가 고쳐주세요 ㅠㅡㅠ
import { Prism } from "react-syntax-highlighter";
import * as markdownTheme from "react-syntax-highlighter/dist/esm/styles/prism";
import { type FixtureImportResult } from "sonamu";
import { z } from "zod";
import CheckCircleIcon from "~icons/lucide/check-circle";
import ClipboardIcon from "~icons/lucide/clipboard";

import { type ExtendedEntity } from "../../services/sonamu-ui.service";

const markdownThemes = { ...markdownTheme };

type ThemeKey = keyof typeof markdownThemes;
type FixtureJsonValue = null | boolean | number | string | FixtureJsonValue[] | FixtureJsonObject;
type FixtureJsonObject = { [key: string]: FixtureJsonValue };

const fixtureJsonValueSchema: z.ZodType<FixtureJsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(fixtureJsonValueSchema),
    z.record(z.string(), fixtureJsonValueSchema),
  ]),
);
const fixtureJsonObjectSchema: z.ZodType<FixtureJsonObject> = z.record(
  z.string(),
  fixtureJsonValueSchema,
);

function isThemeKey(value: string): value is ThemeKey {
  return value in markdownThemes;
}

function getFixtureLoaderCode(entityId: string, id: number, subset: string): string {
  return `${camelize(entityId, true)}${id
    .toString()
    .padStart(2, "0")}: async () => ${entityId}Model.findById("${subset}", ${id}),`;
}

type FixtureCodeViewerProps = {
  fixtureResults: FixtureImportResult[];
  entities: ExtendedEntity[];
  targetDB: string;
};
export default function FixtureCodeViewer({
  fixtureResults,
  entities,
  targetDB,
}: FixtureCodeViewerProps) {
  const storedTheme = localStorage.getItem("markdown-theme");
  const [theme, setTheme] = useState<ThemeKey>(() => {
    if (storedTheme && isThemeKey(storedTheme)) return storedTheme;
    return "oneDark";
  });

  const setMarkdownTheme = (value: string | undefined) => {
    if (!value || !isThemeKey(value)) return;
    setTheme(value);
    localStorage.setItem("markdown-theme", value);
  };

  return (
    <div className="block p-4 bg-white border border-gray-200 rounded-md shadow-sm fixture-code-viewer-container">
      <div className="top-controls">
        <Select
          value={theme}
          onValueChange={setMarkdownTheme}
          items={Object.keys(markdownThemes)}
          placeholder="Theme"
          className="theme-dropdown"
        />
      </div>

      {entities.map((entity) => {
        const results = fixtureResults.filter((result) => result.entityId === entity.id);
        if (results.length === 0) return null;
        return (
          <div key={entity.id} className="fixture-entity-group">
            <h3>Entity: {entity.id}</h3>
            {results.map((result) => (
              <div key={String(result.data.id)} className="fixture-code-item">
                <FixtureCode fixture={result} entity={entity} targetDB={targetDB} theme={theme} />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

const FixtureCode = ({
  fixture,
  entity,
  targetDB: _targetDB,
  theme,
}: {
  fixture: FixtureImportResult;
  entity: ExtendedEntity;
  targetDB: string;
  theme?: ThemeKey;
}) => {
  const subsetKeys = Object.keys(entity.subsets);
  const [selectedSubset, setSelectedSubset] = useState(subsetKeys[0]);

  const getFixtureTestCode = (entityId: string, id: number, res: FixtureImportResult["data"]) => {
    const fixtureName = camelize(entityId, true) + id.toString().padStart(2, "0");
    const parsed = fixtureJsonObjectSchema.safeParse(res);
    if (!parsed.success) {
      return Object.entries(res)
        .map(([key, value]) => `expect(${fixtureName}.${key}).toBe(${JSON.stringify(value)});`)
        .join("\n");
    }

    const generateExpects = (obj: FixtureJsonObject, path = ""): string =>
      Object.entries(obj)
        .flatMap(([key, value]) => {
          const currentPath = path ? `${path}.${key}` : key;
          if (Array.isArray(value)) {
            return value.flatMap((item, index) => {
              const itemPath = `${currentPath}[${index}]`;
              const nestedItem = fixtureJsonObjectSchema.safeParse(item);
              return nestedItem.success
                ? generateExpects(nestedItem.data, itemPath)
                : `expect(${fixtureName}.${itemPath}).toBe(${JSON.stringify(item)});`;
            });
          }

          const nestedValue = fixtureJsonObjectSchema.safeParse(value);
          return nestedValue.success
            ? generateExpects(nestedValue.data, currentPath)
            : `expect(${fixtureName}.${currentPath}).toBe(${JSON.stringify(value)});`;
        })
        .join("\n");

    return generateExpects(parsed.data);
  };

  // FIXME: fixture.data를 서브셋 쿼리 조회하는 방식 변경 필요
  const codes = selectedSubset
    ? {
        fixture: getFixtureLoaderCode(fixture.entityId, Number(fixture.data.id), selectedSubset),
        test: getFixtureTestCode(fixture.entityId, Number(fixture.data.id), fixture.data),
      }
    : undefined;

  return (
    <div>
      <div className="fixture-code-header">
        <strong>
          Fixture ID: {fixture.entityId}#{String(fixture.data.id)}
        </strong>
        <div style={{ display: "flex", alignItems: "center" }}>
          <Select
            value={selectedSubset}
            onValueChange={(value) => value && setSelectedSubset(value)}
            items={subsetKeys}
            placeholder="Subset"
          />
        </div>
      </div>

      <div className="fixture-code-body">
        {/* 1. Raw Data JSON */}
        <CodeBlock
          code={JSON.stringify(fixture.data, null, 2)}
          language="json"
          theme={theme}
          filename="fixture-raw-data.json"
        />

        {/* 2. Generated Code Blocks */}
        <div style={{ margin: "15px 0" }}>
          {codes && (
            <>
              <CodeBlock
                code={codes.fixture}
                language="javascript"
                theme={theme}
                filename="fixture-loader.ts"
              />
              <CodeBlock
                code={codes.test}
                language="javascript"
                theme={theme}
                filename="fixture-test-expects.ts"
                lineSelection={true}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const CodeBlock = ({
  code,
  language,
  filename,
  theme,
  lineSelection,
}: {
  code: string;
  language: string;
  filename?: string;
  theme?: ThemeKey;
  lineSelection?: boolean;
}) => {
  const createEmptySelection = () => Array.from({ length: code.split("\n").length }, () => false);
  const [selectedLinesState, setSelectedLinesState] = useState(() => ({
    code,
    lines: createEmptySelection(),
  }));
  const selectedLines =
    selectedLinesState.code === code ? selectedLinesState.lines : createEmptySelection();
  const [hoveredLine, setHoveredLine] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const handleLineToggle = (index: number) => {
    setSelectedLinesState(() => {
      const newLines = [...selectedLines];
      newLines[index] = !newLines[index];
      return { code, lines: newLines };
    });
  };

  const codeContent = code.trimEnd();

  const handleCopy = (content: string) => {
    const lines = content.split("\n");
    const textToCopy = lineSelection
      ? lines.filter((_, index) => selectedLines[index]).join("\n")
      : content;

    // Use execCommand for broader compatibility in iFrames
    try {
      const tempElement = document.createElement("textarea");
      tempElement.value = textToCopy;
      document.body.appendChild(tempElement);
      tempElement.select();
      document.execCommand("copy");
      document.body.removeChild(tempElement);

      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  return (
    <div className="code">
      <div className="code-header">
        <span>{filename ?? language}</span>
        <div>
          {lineSelection && (
            <Checkbox
              checked={selectedLines.every((line) => line)}
              label={selectedLines.every((line) => line) ? "전체 해제" : "전체 선택"}
              onCheckedChange={() => {
                const allSelected = selectedLines.every((line) => line);
                setSelectedLinesState({
                  code,
                  lines: selectedLines.map(() => !allSelected),
                });
              }}
            />
          )}
          <Button
            size="xs"
            variant="outline"
            onClick={() => handleCopy(codeContent)}
            icon={copied ? <CheckCircleIcon /> : <ClipboardIcon />}
          >
            {copied ? "복사 완료" : "복사"}
          </Button>
        </div>
      </div>

      <Prism
        children={codeContent}
        language={language}
        style={markdownThemes[theme ?? "materialDark"]}
        renderer={({ rows, stylesheet }) => (
          <div style={{ position: "relative" }}>
            {rows.map((row, i) => {
              const isSelected = selectedLines[i] ?? false;
              const isHovered = hoveredLine === i;

              return (
                <div
                  key={i}
                  className={`code-line ${isHovered ? "hovered" : ""}`}
                  style={isSelected ? { backgroundColor: "rgba(0, 123, 255, 0.1)" } : {}}
                  onMouseEnter={() => setHoveredLine(i)}
                  onMouseLeave={() => setHoveredLine(null)}
                  onClick={() => lineSelection && handleLineToggle(i)}
                >
                  {lineSelection && (
                    <Checkbox
                      checked={isSelected}
                      // Prevent click on checkbox from triggering the parent div's onClick
                      onClick={(e) => e.stopPropagation()}
                      onCheckedChange={() => handleLineToggle(i)}
                    />
                  )}
                  <span>
                    {row.children?.map((child: any, j: number) => {
                      if (child.type === "element") {
                        return (
                          <span
                            key={j}
                            className={child.properties.className.join(" ")}
                            // SyntaxHighlighter 스타일 적용
                            style={{
                              ...child.properties.className.reduce(
                                (acc: any, className: string) => {
                                  if (stylesheet[className]) {
                                    return {
                                      ...acc,
                                      ...stylesheet[className],
                                    };
                                  }
                                  return acc;
                                },
                                {},
                              ),
                              // Line-specific style adjustment (optional, but good practice)
                              fontWeight: isHovered ? "normal" : "normal",
                            }}
                          >
                            {child.children.map((grandChild: any, k: number) => (
                              <span key={k}>{grandChild.value}</span>
                            ))}
                          </span>
                        );
                      }
                      return <span key={j}>{child.value}</span>;
                    })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      />
    </div>
  );
};
