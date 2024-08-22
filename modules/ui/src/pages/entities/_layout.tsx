import { SonamuUIService } from "../../services/sonamu-ui.service";
import {
  Link,
  Outlet,
  useNavigate,
  useOutletContext,
  useParams,
} from "react-router-dom";
import classnames from "classnames";
import { Button, Divider } from "semantic-ui-react";
import { useCommonModal } from "../../components/core/CommonModal";
import { EntityCreateForm } from "./_create_form";
import { AICreateEntityForm } from "./_ai_create_entity_form";

type EntitiesLayoutProps = {};
export default function EntitiesLayout(_props: EntitiesLayoutProps) {
  const context = useOutletContext<{ showSearch: boolean }>();

  const { data, error, mutate } = SonamuUIService.useEntities();
  const { entities } = data ?? {};
  const isLoading = !error && !data;

  const params = useParams<{ entityId: string }>();

  const navigate = useNavigate();

  // useCommonModal
  const { openModal } = useCommonModal();

  const createEntity = () => {
    openModal(<EntityCreateForm />, {
      onControlledOpen: () => {
        const focusInput = document.querySelector(
          ".entity-create-form .focus-0 input"
        ) as HTMLInputElement;
        if (focusInput) {
          focusInput.focus();
        }
      },
      onCompleted: (newEntityId) => {
        mutate();
        setTimeout(() => {
          navigate(`/entities/${newEntityId}`);
        }, 200);
      },
    });
  };

  const createEntityWithAI = () => {
    openModal(<AICreateEntityForm />, {
      onControlledOpen: () => {
        const focusInput = document.querySelector(
          ".create-ai-form textarea"
        ) as HTMLInputElement;
        if (focusInput) {
          focusInput.focus();
        }
      },
      onCompleted: (newEntityId) => {
        mutate();
        setTimeout(() => {
          navigate(`/entities/${newEntityId}`);
        }, 200);
      },
    });
  };

  return (
    <div className="entities-layout" id="scroller">
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
              {entity.parentId && (
                <span style={{ color: "silver" }}>
                  {entity.parentId} {"> "}
                </span>
              )}
              {entity.id}
            </Link>
          ))}
        <Divider />
        <div className="text-center footer-buttons">
          <Button
            icon="plus"
            size="mini"
            content="Entity"
            color="green"
            onClick={() => createEntity()}
          />
          <Button
            icon="comment alternate outline"
            size="mini"
            content="Create Entity With AI"
            color="blue"
            onClick={() => createEntityWithAI()}
          />
        </div>
      </div>
      <Outlet context={context} />
      <Button
        icon="arrow up"
        circular
        className="move-to-top"
        onClick={() =>
          document
            .getElementById("scroller")
            ?.scrollIntoView({ behavior: "smooth" })
        }
      />
    </div>
  );
}
