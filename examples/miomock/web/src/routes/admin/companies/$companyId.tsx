import { datetimeF } from "@sonamu-kit/react-sui";
import { createFileRoute } from "@tanstack/react-router";
import z from "zod";
import { CompanyService } from "@/services/services.generated";

export const Route = createFileRoute("/admin/companies/$companyId")({
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
      <h1>Company Detail</h1>
      <p>Company ID: {companyId}</p>
      {row && (
        <>
          <p>Company Name: {row.name}</p>
          <p>Company Created At: {datetimeF(row.created_at)}</p>
        </>
      )}
    </div>
  );
}
