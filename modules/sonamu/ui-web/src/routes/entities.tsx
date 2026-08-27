import { Button } from "@sonamu-kit/react-components";
import { createFileRoute, Link, Outlet, useMatches, useNavigate } from "@tanstack/react-router";
import classnames from "classnames";
import { useState } from "react";
import ArrowUpIcon from "~icons/lucide/arrow-up";
import MessageSquareIcon from "~icons/lucide/message-square";
import PlusIcon from "~icons/lucide/plus";

import EntityChatComponent from "../components/EntityChatComponent";
import { useSonamuContext } from "../contexts/sonamu-provider";
import { SonamuUIService } from "../services/sonamu-ui.service";
import { EntityCreateModal } from "./entities/_entity_create_modal";

export const Route = createFileRoute("/entities")({
  component: EntitiesLayout,
});

type EntitiesLayoutProps = {};
function EntitiesLayout(_props: EntitiesLayoutProps) {
  const { SD } = useSonamuContext();
  const { data, error, refetch, isLoading } = SonamuUIService.useEntities();
  const { entities } = data ?? {};

  const matches = useMatches();
  const entityMatch = matches.find((match) => match.routeId === "/entities/$entityId");
  const entityId = entityMatch?.params.entityId;

  const navigate = useNavigate();

  // AI Chat 토글 상태
  const [showAIChat, setShowAIChat] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const handleEntityCreated = (createdEntityId: string) => {
    refetch();
    setTimeout(() => {
      navigate({ to: "/entities/$entityId", params: { entityId: createdEntityId } });
    }, 200);
  };

  const handleEntityUpdated = (_entityId: string, _updatedFields: string[]) => {
    refetch();
  };

  return (
    <div className="flex min-h-[calc(100vh-50px)]" id="scroller">
      <div className="w-sidemenu bg-sidebar-bg text-[0.95em] sticky left-0 top-gnb h-[calc(100vh-var(--spacing-gnb))] flex flex-col border-r border-white/5">
        <div className="flex-1 overflow-y-auto py-4 [&::-webkit-scrollbar]:w-[6px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-[3px] [&::-webkit-scrollbar-thumb:hover]:bg-white/20">
          {isLoading && <div className="loading-state">Loading...</div>}
          {error && <div className="error-state">Error: {error.message}</div>}
          {entities?.map((entity) => (
            <Link
              key={entity.id}
              className={classnames(
                "py-[0.6em] px-[1.2em] cursor-pointer font-normal flex items-center text-text-muted no-underline transition-all duration-200 border-l-[3px] border-transparent",
                "hover:bg-sidebar-hover hover:text-white hover:pl-[1.5em] hover:[&_.parent-prefix]:opacity-80",
                {
                  "bg-sidebar-selected! text-white! border-l-accent font-medium [&_.entity-name]:text-white!":
                    entity.id === entityId,
                },
              )}
              to="/entities/$entityId"
              params={{ entityId: entity.id }}
            >
              {entity.parentId && (
                <span className="parent-prefix text-[0.85em] opacity-60 mr-[0.5em] text-text-muted after:content-['>'] after:ml-[0.3em]">
                  {entity.parentId}
                </span>
              )}
              <span className="entity-name text-text-light">{entity.id}</span>
            </Link>
          ))}
        </div>

        <div className="shrink-0 p-4 bg-black/20 border-t border-white/10 flex flex-col gap-[0.8em]">
          <div className="flex gap-[0.5em]">
            <Button
              size="sm"
              variant="green"
              className="flex-1 shadow-none! hover:bg-white/10!"
              onClick={() => setCreateModalOpen(true)}
            >
              <PlusIcon className="mr-2 h-4 w-4" /> {SD("entity.new")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={classnames("w-[36px] p-0 flex items-center justify-center shadow-none!", {
                "bg-accent! text-white! border-accent!": showAIChat,
              })}
              onClick={() => setShowAIChat(!showAIChat)}
              icon={<MessageSquareIcon />}
            />
          </div>

          {showAIChat && (
            <div className="mt-[0.5em] animate-[slideUp_0.3s_ease-out]">
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
        className="fixed right-[2em] bottom-[2em] z-1000 bg-sidebar-bg text-white shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-transform duration-200 hover:-translate-y-[2px] hover:bg-sidebar-hover rounded-full"
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
