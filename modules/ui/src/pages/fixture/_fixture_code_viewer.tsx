import { useEffect, useState } from "react";
import { Button, Checkbox, Dropdown, Segment } from "semantic-ui-react";
import { FixtureImportResult } from "sonamu";
import inflection from "inflection";
import Markdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import * as markdownTheme from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  ExtendedEntity,
  SonamuUIService,
} from "../../services/sonamu-ui.service";
import { defaultCatch } from "../../services/sonamu.shared";

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
    (localStorage.getItem("markdown-theme") as ThemeKey) ?? "oneDark"
  );

  const getThemeOptions = () =>
    Object.keys(markdownTheme).map((key) => ({
      key,
      value: key,
      text: key,
    }));

  const setMarkdownTheme = (value: ThemeKey) => {
    setTheme(value);
    localStorage.setItem("markdown-theme", value);
  };

  return (
    <Segment className="fixture-code-viewer">
      <Dropdown
        placeholder="Theme"
        selection
        options={getThemeOptions()}
        onChange={(_, { value }) => setMarkdownTheme(value as ThemeKey)}
        value={theme}
        className="theme-dropdown"
      />
      {entities.map((entity) => {
        const results = fixtureResults.filter(
          (result) => result.entityId === entity.id
        );
        if (results.length === 0) return null;
        return (
          <div key={entity.id} className="fixture-code">
            <h3 style={{ margin: "1em" }}>Entity: {entity.id}</h3>
            {results.map((result) => (
              <FixtureCode
                key={result.data.id}
                fixture={result}
                entity={entity}
                targetDB={targetDB}
                theme={theme}
              />
            ))}
          </div>
        );
      })}
    </Segment>
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
  const [codes, setCodes] = useState<
    Map<string, { fixture: string; test: string }>
  >(new Map());

  const getFixtureLoaderCode = (
    entityId: string,
    id: number,
    subset: string
  ) => {
    return `${inflection.camelize(entityId, true)}${id
      .toString()
      .padStart(
        2,
        "0"
      )}: async () => ${entityId}Model.findById("${subset}", ${id}),`;
  };

  const getFixtureTestCode = (
    entityId: string,
    id: number,
    res: { [key: string]: any }
  ) => {
    const fixtureName =
      inflection.camelize(entityId, true) + id.toString().padStart(2, "0");

    const generateExpects = (obj: { [key: string]: any }, path = "") => {
      let expects = "";
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;
        if (
          typeof value === "object" &&
          value !== null &&
          !Array.isArray(value)
        ) {
          expects += generateExpects(value, currentPath);
        } else if (Array.isArray(value)) {
          value.forEach((item, index) => {
            if (typeof item === "object" && item !== null) {
              expects += generateExpects(item, `${currentPath}[${index}]`);
            } else {
              expects += `expect(${fixtureName}${
                currentPath ? "." + currentPath : ""
              }[${index}]).toBe(${JSON.stringify(item)});\n`;
            }
          });
        } else {
          expects += `expect(${fixtureName}${
            currentPath ? "." + currentPath : ""
          }).toBe(${JSON.stringify(value)});\n`;
        }
      }
      return expects;
    };

    return generateExpects(res);
  };

  useEffect(() => {
    if (selectedSubset) {
      SonamuUIService.getEntityById(
        targetDB,
        fixture.entityId,
        fixture.data.id,
        selectedSubset
      )
        .then((res) => {
          setCodes((prev) => {
            const newCodes = new Map(prev);
            newCodes.set(selectedSubset, {
              fixture: getFixtureLoaderCode(
                fixture.entityId,
                fixture.data.id,
                selectedSubset
              ),
              test: getFixtureTestCode(fixture.entityId, fixture.data.id, res),
            });
            return newCodes;
          });
        })
        .catch(defaultCatch);
    }
  }, [fixture, selectedSubset, targetDB]);

  return (
    <div
      key={`${fixture.entityId}#${fixture.data.id}`}
      className="fixture-code"
    >
      <div className="header">
        <Dropdown
          placeholder="Subset"
          selection
          options={subsetKeys.map((key) => ({
            key,
            value: key,
            text: key,
          }))}
          onChange={(_, { value }) => setSelectedSubset(value as string)}
          value={selectedSubset}
        />
      </div>

      <div className="description">
        <CodeBlock
          code={JSON.stringify(fixture.data, null, 2)}
          language="json"
          theme={theme}
        />
        <div style={{ margin: 0 }}>
          {codes.get(selectedSubset) && (
            <>
              <CodeBlock
                code={codes.get(selectedSubset)?.fixture ?? ""}
                language="javascript"
                theme={theme}
                filename="fixture.ts"
              />
              <CodeBlock
                code={codes.get(selectedSubset)?.test ?? ""}
                language="javascript"
                theme={theme}
                filename="fixture.test.ts"
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

  const handleLineToggle = (index: number) => {
    setSelectedLines((prev) => {
      const newLines = [...prev];
      newLines[index] = !newLines[index];
      return newLines;
    });
  };

  const handleCopy = (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
    code: string
  ) => {
    const lines = String(code).split("\n");
    const textToCopy = lineSelection
      ? lines.filter((_, index) => selectedLines[index]).join("\n")
      : String(code);
    navigator.clipboard.writeText(textToCopy);
    const target = e.currentTarget.querySelector("i");
    if (target) {
      target.className = "check circle outline icon";
      setTimeout(() => {
        target.className = "clipboard outline icon";
      }, 1000);
    }
  };

  useEffect(() => {
    setSelectedLines(new Array(code.split("\n").length).fill(false));
  }, [code]);

  return (
    <Markdown
      children={`\`\`\`${language} ${
        filename ? `title="${filename}"` : ""
      }\n${code}\n\`\`\``}
      components={{
        code({ children, className, node, ref, ...rest }) {
          return (
            <div className="code">
              <div className="code-header">
                <span>{filename}</span>
                <div>
                  {lineSelection && (
                    <Checkbox
                      label={
                        selectedLines.every((line) => line)
                          ? "전체 해제"
                          : "전체 선택"
                      }
                      checked={selectedLines.every((line) => line)}
                      onChange={() => {
                        const allSelected = selectedLines.every((line) => line);
                        setSelectedLines(selectedLines.map(() => !allSelected));
                      }}
                    />
                  )}
                  <Button
                    icon="clipboard outline"
                    onClick={(e) => handleCopy(e, String(children))}
                  />
                </div>
              </div>

              <SyntaxHighlighter
                {...rest}
                children={String(children).trimEnd()}
                language={language}
                style={markdownTheme[theme ?? "oneDark"]}
                renderer={({ rows, stylesheet }) => (
                  <>
                    {rows.map((row, i) => (
                      <div
                        key={i}
                        className={`code-line ${
                          hoveredLine === i ? "hovered" : ""
                        }`}
                      >
                        {lineSelection && (
                          <Checkbox
                            checked={selectedLines[i] ?? false}
                            onChange={() => handleLineToggle(i)}
                            onMouseEnter={() => setHoveredLine(i)}
                            onMouseLeave={() => setHoveredLine(null)}
                          />
                        )}
                        <span>
                          {row.children?.map((child: any, j: number) => {
                            if (child.type === "element") {
                              return (
                                <span
                                  key={j}
                                  className={child.properties.className.join(
                                    " "
                                  )}
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
                                      {}
                                    ),
                                    fontWeight:
                                      hoveredLine === i ? "bold" : "normal",
                                  }}
                                >
                                  {child.children.map(
                                    (grandChild: any, k: number) => (
                                      <span key={k}>{grandChild.value}</span>
                                    )
                                  )}
                                </span>
                              );
                            }
                            return <span key={j}>{child.value}</span>;
                          })}
                        </span>
                      </div>
                    ))}
                  </>
                )}
              />
            </div>
          );
        },
      }}
    />
  );
};
