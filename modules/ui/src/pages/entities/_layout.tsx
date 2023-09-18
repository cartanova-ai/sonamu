import { SonamuUIService } from "../../services/sonamu-ui.service";
import { Link, Outlet, useParams } from "react-router-dom";
import classnames from "classnames";
import { Button, Divider } from "semantic-ui-react";

type EntitiesLayoutProps = {};
export default function EntitiesLayout(_props: EntitiesLayoutProps) {
  const { data, error } = SonamuUIService.useEntities();
  const { entities } = data ?? {};
  const isLoading = !error && !data;

  const params = useParams<{ entityId: string }>();

  const addEntity = () => {};

  return (
    <div className="entities-layout">
      <div className="sidemenu">
        {isLoading && <div>Loading...</div>}
        {error && <div>Error: {error.message}</div>}
        {entities &&
          entities.map((entity) => (
            <Link
              key={entity.id}
              className={classnames("entity-list-item", {
                selected: entity.id === params.entityId,
              })}
              to={`/entities/${entity.id}`}
            >
              {entity.id}
            </Link>
          ))}
        <Divider />
        <div className="text-center">
          <Button
            icon="plus"
            size="mini"
            content="Entity"
            color="green"
            onClick={() => addEntity()}
          />
        </div>
      </div>
      <Outlet />
    </div>
  );
}
