import { useEffect, useState } from "react";
import { Button, Dropdown, Segment } from "semantic-ui-react";
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

const CodeBlock = ({
  code,
  language,
  filename,
  theme,
}: {
  code: string;
  language: string;
  filename?: string;
  theme?: keyof typeof markdownTheme;
}) => {
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
                <Button
                  icon="clipboard outline"
                  onClick={(e) => {
                    navigator.clipboard.writeText(String(children));
                    // 하위 i태그를 찾아서 className 변경
                    const target = e.currentTarget.querySelector("i");
                    if (target) {
                      target.className = "check circle outline icon";
                      setTimeout(() => {
                        target.className = "clipboard outline icon";
                      }, 1000);
                    }
                  }}
                />
              </div>
              <SyntaxHighlighter
                {...rest}
                children={String(children).replace(/\n$/, "")}
                language={language}
                style={markdownTheme[theme ?? "oneDark"]}
              />
            </div>
          );
        },
      }}
    />
  );
};

const FixtureCode = ({
  fixture,
  entity,
  targetDB,
}: {
  fixture: FixtureImportResult;
  entity: ExtendedEntity;
  targetDB: string;
}) => {
  const subsetKeys = Object.keys(entity.subsets);
  const [selectedSubset, setSelectedSubset] = useState<string>(subsetKeys[0]);
  const [codes, setCodes] = useState<
    Map<string, { fixture: string; test: string }>
  >(new Map());
  const [theme, setTheme] = useState<keyof typeof markdownTheme>("oneDark");

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
        <h3>{fixture.entityId}</h3>
        <Dropdown
          placeholder="Subset"
          selection
          options={subsetKeys.map((key) => ({
            key,
            value: key,
            text: key,
          }))}
          onChange={(_, { value }) => setSelectedSubset(value as string)}
          value={selectedSubset ?? ""}
        />
        <Dropdown
          placeholder="Theme"
          selection
          options={Object.keys(markdownTheme).map((key) => ({
            key,
            value: key,
            text: key,
          }))}
          onChange={(_, { value }) =>
            setTheme(value as keyof typeof markdownTheme)
          }
          value={selectedSubset ?? ""}
        />
      </div>

      <div className="description">
        <CodeBlock
          code={JSON.stringify(fixture.data, null, 2)}
          language="json"
          theme={theme}
        />
        {selectedSubset && (
          <div>
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
            />
          </div>
        )}
      </div>
    </div>
  );
};

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
  return (
    <Segment className="fixture-code-viewer">
      {fixtureResults.map((result) => {
        const entity = entities.find((e) => e.id === result.entityId);
        if (!entity) return null;

        return (
          <FixtureCode fixture={result} entity={entity} targetDB={targetDB} />
        );
      })}
    </Segment>
  );
}
