import { Dropdown, Segment } from "semantic-ui-react";
import { FixtureImportResult } from "sonamu";
import { ExtendedEntity } from "../../services/sonamu-ui.service";

const FixtureCode = ({
  fixture,
  entity,
}: {
  fixture: FixtureImportResult;
  entity: ExtendedEntity;
}) => {
  return (
    <div key={`${fixture.entityId}#${fixture.data.id}`}>
      <div className="header">
        <h3>{fixture.entityId}</h3>
      </div>
      <pre>{JSON.stringify(fixture.data, null, 2)}</pre>
    </div>
  );
};

type FixtureCodeViewerProps = {
  fixtureResults: FixtureImportResult[];
  entities: ExtendedEntity[];
};
export default function FixtureCodeViewer({
  fixtureResults,
  entities,
}: FixtureCodeViewerProps) {
  return (
    <Segment className="fixture-code-viewer">
      {fixtureResults.map((result) => {
        const entity = entities.find((e) => e.id === result.entityId);
        if (!entity) return null;

        return <FixtureCode fixture={result} entity={entity} />;
      })}
    </Segment>
  );
}
