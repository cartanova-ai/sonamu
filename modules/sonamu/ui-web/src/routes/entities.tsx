import { Button } from "@sonamu-kit/react-components";
import { createFileRoute, Link, Outlet, useMatches, useNavigate } from "@tanstack/react-router";
import classnames from "classnames";
import { useState } from "react";
import ArrowUpIcon from "~icons/lucide/arrow-up";
import MessageSquareIcon from "~icons/lucide/message-square";
import PlusIcon from "~icons/lucide/plus";
import EntityChatComponent from "../components/EntityChatComponent";
import { SonamuUIService } from "../services/sonamu-ui.service";
import { EntityCreateModal } from "./entities/_entity_create_modal";

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
  const [createModalOpen, setCreateModalOpen] = useState(false);

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
              size="sm"
              variant="green"
              className="footer-btn w-full"
              onClick={() => setCreateModalOpen(true)}
            >
              <PlusIcon className="mr-2 h-4 w-4" /> New Entity
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={`ai-toggle-btn ${showAIChat ? "active" : ""}`}
              onClick={() => setShowAIChat(!showAIChat)}
              icon={<MessageSquareIcon />}
            />
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
        variant="outline"
        className="move-to-top rounded-full"
        onClick={() => document.getElementById("scroller")?.scrollIntoView({ behavior: "smooth" })}
        icon={<ArrowUpIcon />}
      />
      <EntityCreateModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onCompleted={handleEntityCreated}
      />
    </div>
  );
}
