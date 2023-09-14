import { SonamuUIService } from "../../services/sonamu-ui.service";
import { Link, Outlet, useParams } from "react-router-dom";
import classnames from "classnames";

type EntitiesPageProps = {};
export default function EntitiesLayout(_props: EntitiesPageProps) {
  const { data, error } = SonamuUIService.useEntities();
  const { entities } = data ?? {};
  const isLoading = !error && !data;

  const params = useParams<{ entityId: string }>();

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
      </div>
      <Outlet />
    </div>
  );
}
