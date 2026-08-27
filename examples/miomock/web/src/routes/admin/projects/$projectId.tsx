import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DateInput,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@sonamu-kit/react-components/components";
import { type TableCol } from "@sonamu-kit/react-components/components";
import { dateF, datetimeF, useTypeForm } from "@sonamu-kit/react-components/lib";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { z } from "zod";
import ArrowLeftIcon from "~icons/lucide/arrow-left";
import CheckCircleIcon from "~icons/lucide/check-circle";
import CircleIcon from "~icons/lucide/circle";
import FolderIcon from "~icons/lucide/folder";
import PlusIcon from "~icons/lucide/plus";
import SaveIcon from "~icons/lucide/save";
import EditIcon from "~icons/lucide/square-pen";
import TrashIcon from "~icons/lucide/trash-2";

import { SD } from "@/i18n/sd.generated";
import { MilestoneSaveParams } from "@/services/milestone/milestone.types";
import { MilestoneService, ProjectService } from "@/services/services.generated";
import { type MilestoneSubsetA, ProjectStatusLabel } from "@/services/sonamu.generated";
import { defaultCatch, isSonamuError } from "@/services/sonamu.shared";

export const Route = createFileRoute("/admin/projects/$projectId")({
  loader: async ({ params, context }) => {
    const { projectId } = params;
    const project = await context.queryClient.ensureQueryData(
      ProjectService.getProjectQueryOptions("A", projectId),
    );
    return { project };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.project?.name ?? "Project"} - Miomock` },
      { name: "description", content: "프로젝트 상세" },
    ],
  }),
  component: ProjectDetailPage,
  params: z.object({
    projectId: z.coerce.number(),
  }),
});

function createMilestoneColumns(
  onToggleComplete: (id: number, isCompleted: boolean) => void,
  onEdit: (id: number) => void,
  onDelete: (id: number) => void,
): TableCol<MilestoneSubsetA>[] {
  return [
    {
      label: SD("entity.Milestone.name"),
      tc: (row) => (
        <span className={row.completed_at ? "line-through text-muted-foreground" : ""}>
          {row.name}
        </span>
      ),
    },
    {
      label: SD("entity.Milestone.due_date"),
      tc: (row) => <span>{dateF(row.due_date)}</span>,
      fit: true,
    },
    {
      label: SD("entity.Milestone.description"),
      tc: (row) => <span className="text-muted-foreground">{row.description ?? "-"}</span>,
    },
    {
      label: SD("entity.Milestone.completed_at"),
      fit: true,
      align: "center",
      tc: (row) =>
        row.completed_at ? (
          <Badge variant="secondary" className="gap-1">
            <CheckCircleIcon className="h-3 w-3" />
            {datetimeF(row.completed_at)}
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 text-muted-foreground">
            <CircleIcon className="h-3 w-3" />
            미완료
          </Badge>
        ),
    },
    {
      label: SD("common.manage"),
      fit: true,
      align: "center",
      tc: (row) => (
        <div className="flex items-center justify-center gap-1">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => onToggleComplete(row.id, !!row.completed_at)}
            icon={row.completed_at ? <CircleIcon /> : <CheckCircleIcon />}
          />
          <Button variant="yellow" size="xs" icon={<EditIcon />} onClick={() => onEdit(row.id)} />
          <Button variant="red" size="xs" icon={<TrashIcon />} onClick={() => onDelete(row.id)} />
        </div>
      ),
    },
  ];
}

function ProjectDetailPage() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: project } = ProjectService.useProject("A", projectId, {
    enabled: !!projectId,
  });

  const { data: milestoneData, refetch: refetchMilestones } = MilestoneService.useMilestones(
    "A",
    { project_id: projectId, orderBy: "due_date-asc", num: 100 },
    { enabled: !!projectId },
  );
  const milestones = milestoneData?.rows;

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | undefined>(undefined);

  const completeMutation = MilestoneService.useCompleteMutation();
  const uncompleteMutation = MilestoneService.useUncompleteMutation();

  const isProjectClosed = project?.status === "completed" || project?.status === "cancelled";

  const handleToggleComplete = (id: number, isCompleted: boolean) => {
    const mutation = isCompleted ? uncompleteMutation : completeMutation;
    mutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["Milestone"] });
        },
        onError: defaultCatch,
      },
    );
  };

  const handleDeleteClick = (id: number) => {
    setItemToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (itemToDelete) {
      MilestoneService.del([itemToDelete]).then(() => {
        refetchMilestones();
      });
    }
    setDeleteDialogOpen(false);
    setItemToDelete(null);
  };

  const handleEditClick = (id: number) => {
    setEditingId(id);
    setFormOpen(true);
  };

  const handleAddClick = () => {
    setEditingId(undefined);
    setFormOpen(true);
  };

  const handleFormClose = () => {
    setFormOpen(false);
    setEditingId(undefined);
  };

  const handleFormSaved = () => {
    handleFormClose();
    queryClient.invalidateQueries({ queryKey: ["Milestone"] });
  };

  const columns = createMilestoneColumns(handleToggleComplete, handleEditClick, handleDeleteClick);

  if (!project) return null;

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-[1800px] mx-auto p-8">
        <div className="space-y-6 mb-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderIcon className="h-5 w-5" />
              <span className="text-lg font-semibold h-5">{project.name}</span>
              <Badge>{ProjectStatusLabel[project.status]}</Badge>
            </div>
            <Button
              variant="outline"
              onClick={() => navigate({ to: "/admin/projects" })}
              icon={<ArrowLeftIcon />}
            >
              {SD("common.backToList")}
            </Button>
          </div>

          {/* Project Info Card */}
          <Card className="border-border/40 bg-gray-50 shadow-sm">
            <CardHeader className="px-4 border-b border-gray-200 flex items-center">
              <CardTitle className="text-sm font-medium leading-none m-0">
                {SD("entity.Project")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-xs text-gray-500">{SD("entity.Project.name")}</span>
                  <p>{project.name}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-500">{SD("entity.Project.status")}</span>
                  <p>{ProjectStatusLabel[project.status]}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-500">{SD("entity.Project.description")}</span>
                  <p>{project.description ?? "-"}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-500">{SD("entity.Project.budget")}</span>
                  <p>{project.budget ?? "-"}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-500">{SD("entity.Project.deadline")}</span>
                  <p>{project.deadline ? dateF(project.deadline) : "-"}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-500">{SD("common.createdAt")}</span>
                  <p>{datetimeF(project.created_at)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Milestones Card */}
          <Card className="border-border/40 shadow-sm">
            <CardHeader className="px-4 border-b border-gray-200 flex items-center justify-between">
              <CardTitle className="text-sm font-medium leading-none m-0">
                {SD("entity.Milestone")}
                {milestones && (
                  <Badge variant="secondary" className="ml-2">
                    {milestones.length}
                  </Badge>
                )}
              </CardTitle>
              <Button
                size="sm"
                onClick={handleAddClick}
                icon={<PlusIcon />}
                disabled={isProjectClosed}
              >
                {SD("common.create")}
              </Button>
            </CardHeader>
            <CardContent className="p-6">
              {milestones && milestones.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent bg-gray-100">
                      {columns.map((col, idx) => (
                        <TableHead key={idx} fit={col.fit} align={col.align}>
                          {col.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {milestones.map((row) => (
                      <Fragment key={row.id}>
                        <TableRow>
                          {columns.map((col, idx) => (
                            <TableCell key={idx} fit={col.fit} align={col.align} className="py-3">
                              {col.tc(row)}
                            </TableCell>
                          ))}
                        </TableRow>
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  마일스톤이 없습니다.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Milestone Form Dialog */}
      {formOpen && (
        <MilestoneFormDialog
          projectId={projectId}
          projectDeadline={project.deadline}
          milestoneId={editingId}
          onClose={handleFormClose}
          onSaved={handleFormSaved}
        />
      )}

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{SD("delete.confirm.title")}</AlertDialogTitle>
            <AlertDialogDescription>{SD("delete.confirm.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{SD("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>
              {SD("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

type MilestoneFormDialogProps = {
  projectId: number;
  projectDeadline: Date | null;
  milestoneId?: number;
  onClose: () => void;
  onSaved: () => void;
};

function MilestoneFormDialog({
  projectId,
  projectDeadline,
  milestoneId,
  onClose,
  onSaved,
}: MilestoneFormDialogProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const defaultDueDate = new Date();
  defaultDueDate.setMonth(defaultDueDate.getMonth() + 1);

  const { form, setForm, register, submit } = useTypeForm(MilestoneSaveParams, {
    project_id: projectId,
    name: "",
    due_date: defaultDueDate,
    description: null,
  });

  const { data: existing } = MilestoneService.useMilestone("A", milestoneId ?? 0, {
    enabled: !!milestoneId,
  });

  if (milestoneId && existing && !form.id) {
    setForm((prev) => ({
      ...prev,
      id: existing.id,
      name: existing.name,
      due_date: existing.due_date,
      description: existing.description,
    }));
  }

  const saveMutation = MilestoneService.useSaveMutation();
  const handleSubmit = submit(async (formData) => {
    setErrorMessage(null);
    saveMutation.mutate(
      { spa: [formData] },
      {
        onSuccess: () => onSaved(),
        onError: (e) => {
          if (isSonamuError(e)) {
            setErrorMessage(e.message);
          } else {
            setErrorMessage("에러가 발생했습니다.");
          }
        },
      },
    );
  });

  const title = milestoneId
    ? SD("entity.edit")(SD("entity.Milestone"), milestoneId)
    : SD("entity.create")(SD("entity.Milestone"));

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
        </AlertDialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="block text-xs mb-1 text-gray-600">
              {SD("entity.Milestone.name")}
            </label>
            <Input
              className="h-8 text-xs bg-white"
              placeholder={SD("entity.Milestone.name")}
              {...register("name")}
            />
          </div>
          <div className="space-y-2">
            <label className="block text-xs mb-1 text-gray-600">
              {SD("entity.Milestone.due_date")}
            </label>
            <DateInput className="h-8 text-xs bg-white" {...register("due_date")} />
            {projectDeadline && (
              <p className="text-xs text-muted-foreground">
                프로젝트 마감일: {dateF(projectDeadline)}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <label className="block text-xs mb-1 text-gray-600">
              {SD("entity.Milestone.description")}
            </label>
            <Input
              className="h-8 text-xs bg-white"
              placeholder={SD("entity.Milestone.description")}
              {...register("description")}
            />
          </div>
        </div>
        {errorMessage && (
          <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2">
            <p className="text-xs text-red-700">{errorMessage}</p>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>{SD("common.cancel")}</AlertDialogCancel>
          <Button onClick={handleSubmit} disabled={saveMutation.isPending} icon={<SaveIcon />}>
            {SD("common.save")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
