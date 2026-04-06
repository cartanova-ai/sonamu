/* oxlint-disable react/no-children-prop */ // 여기는 다 허용
/* oxlint-disable @typescript-eslint/no-explicit-any */ // 여기는 다 허용
/* oxlint-disable jsx-a11y/click-events-have-key-events */ // 여기는 다 허용
/* oxlint-disable jsx-a11y/no-static-element-interactions */ // 여기는 다 허용

import { Button, Checkbox, Select } from "@sonamu-kit/react-components";
import { camelize } from "inflection";
import { useEffect, useState } from "react";
import Markdown from "react-markdown";
// 진짜 얼탱이없는 이슈: https://github.com/react-syntax-highlighter/react-syntax-highlighter/issues/539#issuecomment-1869182939
// 울며 겨자먹기 workaround입니다. 누가 고쳐주세요 ㅠㅡㅠ
import { Prism, type SyntaxHighlighterProps } from "react-syntax-highlighter";
import * as markdownTheme from "react-syntax-highlighter/dist/esm/styles/prism";
import type { FixtureImportResult } from "sonamu";
import CheckCircleIcon from "~icons/lucide/check-circle";
import ClipboardIcon from "~icons/lucide/clipboard";

import type { ExtendedEntity } from "../../services/sonamu-ui.service";

const SyntaxHighlighter = Prism as any as React.FC<SyntaxHighlighterProps>;

type ThemeKey = keyof typeof markdownTheme;

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
  const [theme, setTheme] = useState(
    (localStorage.getItem("markdown-theme") as ThemeKey) ?? "oneDark",
  );

  const getThemeOptions = () => Object.keys(markdownTheme);

  const setMarkdownTheme = (value: ThemeKey | undefined) => {
    if (!value) return;
    setTheme(value);
    localStorage.setItem("markdown-theme", value);
  };

  return (
    <div className="block p-4 bg-white border border-gray-200 rounded-md shadow-sm fixture-code-viewer-container">
      <div className="top-controls">
        <Select
          value={theme}
          onValueChange={(value) => setMarkdownTheme(value as ThemeKey)}
          items={getThemeOptions()}
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
  targetDB,
  theme,
}: {
  fixture: FixtureImportResult;
  entity: ExtendedEntity;
  targetDB: string;
  theme?: ThemeKey;
}) => {
  const subsetKeys = Object.keys(entity.subsets);
  const [selectedSubset, setSelectedSubset] = useState<string>(subsetKeys[0]);
  const [codes, setCodes] = useState<Map<string, { fixture: string; test: string }>>(new Map());

  const getFixtureLoaderCode = (entityId: string, id: number, subset: string) => {
    return `${camelize(entityId, true)}${id
      .toString()
      .padStart(2, "0")}: async () => ${entityId}Model.findById("${subset}", ${id}),`;
  };

  const getFixtureTestCode = (entityId: string, id: number, res: { [key: string]: any }) => {
    const fixtureName = camelize(entityId, true) + id.toString().padStart(2, "0");

    const generateExpects = (obj: { [key: string]: any }, path = "") => {
      let expects = "";
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;
        if (typeof value === "object" && value !== null && !Array.isArray(value)) {
          expects += generateExpects(value, currentPath);
        } else if (Array.isArray(value)) {
          value.forEach((item, index) => {
            if (typeof item === "object" && item !== null) {
              expects += generateExpects(item, `${currentPath}[${index}]`);
            } else {
              expects += `expect(${fixtureName}${
                currentPath ? `.${currentPath}` : ""
              }[${index}]).toBe(${JSON.stringify(item)});\n`;
            }
          });
        } else {
          expects += `expect(${fixtureName}${
            currentPath ? `.${currentPath}` : ""
          }).toBe(${JSON.stringify(value)});\n`;
        }
      }
      return expects;
    };

    return generateExpects(res);
  };

  useEffect(() => {
    if (selectedSubset) {
      // FIXME: fixture.data를 서브셋 쿼리 조회하는 방식 변경 필요
      setCodes(
        new Map([
          [
            selectedSubset,
            {
              fixture: getFixtureLoaderCode(
                fixture.entityId,
                Number(fixture.data.id),
                selectedSubset,
              ),
              test: getFixtureTestCode(fixture.entityId, Number(fixture.data.id), fixture.data),
            },
          ],
        ]),
      );
    }
  }, [fixture, selectedSubset, targetDB]);

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
          {codes.get(selectedSubset) && (
            <>
              <CodeBlock
                code={codes.get(selectedSubset)?.fixture ?? ""}
                language="javascript"
                theme={theme}
                filename="fixture-loader.ts"
              />
              <CodeBlock
                code={codes.get(selectedSubset)?.test ?? ""}
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
  const [selectedLines, setSelectedLines] = useState<boolean[]>([]);
  const [hoveredLine, setHoveredLine] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const handleLineToggle = (index: number) => {
    setSelectedLines((prev) => {
      const newLines = [...prev];
      newLines[index] = !newLines[index];
      return newLines;
    });
  };

  const handleCopy = (code: string) => {
    const lines = String(code).split("\n");
    const textToCopy = lineSelection
      ? lines.filter((_, index) => selectedLines[index]).join("\n")
      : String(code);

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

  useEffect(() => {
    setSelectedLines(new Array(code.split("\n").length).fill(false));
  }, [code]);

  return (
    <Markdown
      children={`\`\`\`${language} ${filename ? `title="${filename}"` : ""}\n${code}\n\`\`\``}
      components={{
        code({ children, className, node, ref, ...rest }) {
          // Remove leading/trailing newlines which might be added by the markdown parser
          const codeContent = String(children).trimEnd();

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
                        setSelectedLines(selectedLines.map(() => !allSelected));
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

              <SyntaxHighlighter
                {...rest}
                children={codeContent}
                language={language}
                style={markdownTheme[theme ?? "materialDark"]}
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
        },
      }}
    />
  );
};
