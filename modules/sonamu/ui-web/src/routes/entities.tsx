import { createFileRoute, Link, Outlet, useMatches, useNavigate } from "@tanstack/react-router";
import classnames from "classnames";
import { useState } from "react";
import { Button, Icon } from "semantic-ui-react";
import { useCommonModal } from "../components/core/CommonModal";
import EntityChatComponent from "../components/EntityChatComponent";
import { SonamuUIService } from "../services/sonamu-ui.service";
import { EntityCreateForm } from "./entities/_create_form";

export const Route = createFileRoute("/entities")({
  component: EntitiesLayout,
});

type EntitiesLayoutProps = {};
function EntitiesLayout(_props: EntitiesLayoutProps) {
  const { data, error, refetch, isLoading } = SonamuUIService.useEntities();
  const { entities } = data ?? {};

  const matches = useMatches();
  const entityMatch = matches.find((match) => match.routeId === "/entities/$entityId");
  const entityId = entityMatch?.params.entityId;

  const navigate = useNavigate();

  // AI Chat 토글 상태
  const [showAIChat, setShowAIChat] = useState(false);

  // useCommonModal
  const { openModal } = useCommonModal();

  const createEntity = () => {
    openModal(<EntityCreateForm />, {
      onControlledOpen: () => {
        const focusInput = document.querySelector(
          ".entity-create-form .focus-0 input",
        ) as HTMLInputElement;
        if (focusInput) {
          focusInput.focus();
        }
      },
      onCompleted: (newEntityId) => {
        refetch();
        setTimeout(() => {
          navigate({ to: "/entities/$entityId", params: { entityId: newEntityId as string } });
        }, 200);
      },
    });
  };

  const handleEntityCreated = (entityId: string) => {
    refetch();
    setTimeout(() => {
      navigate({ to: "/entities/$entityId", params: { entityId } });
    }, 200);
  };

  const handleEntityUpdated = (_entityId: string, _updatedFields: string[]) => {
    refetch();
  };

  return (
    <div className="entities-layout" id="scroller">
      <div className="sidemenu">
        <div className="entity-list-container">
          {isLoading && <div className="loading-state">Loading...</div>}
          {error && <div className="error-state">Error: {error.message}</div>}
          {entities?.map((entity) => (
            <Link
              key={entity.id}
              className={classnames("entity-list-item", {
                selected: entity.id === entityId,
              })}
              to="/entities/$entityId"
              params={{ entityId: entity.id }}
            >
              {entity.parentId && <span className="parent-prefix">{entity.parentId}</span>}
              <span className="entity-name">{entity.id}</span>
            </Link>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="action-buttons-row">
            <Button
              fluid
              basic
              inverted
              size="small"
              className="footer-btn"
              onClick={() => createEntity()}
            >
              <Icon name="plus" /> New Entity
            </Button>
            <Button
              icon
              basic
              inverted
              size="small"
              className={`ai-toggle-btn ${showAIChat ? "active" : ""}`}
              onClick={() => setShowAIChat(!showAIChat)}
            >
              <Icon name="comment alternate outline" />
            </Button>
          </div>

          {showAIChat && (
            <div className="ai-chat-container">
              <EntityChatComponent
                onEntityCreated={handleEntityCreated}
                onEntityUpdated={handleEntityUpdated}
              />
            </div>
          )}
        </div>
      </div>
      <Outlet />
      <Button
        icon="arrow up"
        circular
        className="move-to-top"
        onClick={() => document.getElementById("scroller")?.scrollIntoView({ behavior: "smooth" })}
      />
    </div>
  );
}
