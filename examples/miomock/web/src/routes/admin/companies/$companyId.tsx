import { datetimeF } from "@sonamu-kit/react-components";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { SD } from "@/i18n/sd.generated";
import { CompanyService } from "@/services/services.generated";

export const Route = createFileRoute("/admin/companies/$companyId")({
  loader: async ({ params, context }) => {
    const { companyId } = params;
    const company = await context.queryClient.ensureQueryData(
      CompanyService.getCompanyQueryOptions("A", companyId),
    );

    return { company };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.company?.name ?? "몰라"} - Miomock` },
      { name: "description", content: "회사 상세 정보" },
    ],
  }),
  component: CompanyDetail,
  params: z.object({
    companyId: z.coerce.number(),
  }),
});

function CompanyDetail() {
  const { companyId } = Route.useParams();
  const { data: row } = CompanyService.useCompany("A", companyId, {
    enabled: !!companyId,
  });

  return (
    <div>
      <h1>{SD("entity.Company")}</h1>
      <p>ID: {companyId}</p>
      {row && (
        <>
          <p>
            {SD("entity.Company.name")}: {row.name}
          </p>
          <p>
            {SD("common.createdAt")}: {datetimeF(row.created_at)}
          </p>
        </>
      )}
    </div>
  );
}
