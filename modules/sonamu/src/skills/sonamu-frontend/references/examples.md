# Full Component Implementation Examples

## Full Component Implementation Examples

### List Page

```typescript
function ConsultationListPage() {
  const [params, setParams] = useState({ num: 20, page: 1 });
  const { data, isLoading } = ConsultationService.useConsultations("P", params);

  return (
    <div>
      {/* Manage selection with useSelection */}
      {data?.rows.map((row) => (
        <div key={row.id}>{row.title} - {row.status}</div>
      ))}
      {/* Pagination: manipulate params.page */}
    </div>
  );
}
```

### Edit Page

```typescript
function ConsultationFormPage() {
  const { id } = useParams();
  const { form, setForm, register, submit } = useTypeForm(ConsultationSaveParams, {
    title: "", content: "", status: "pending", user_id: 0,
  });

  // Edit mode: load data
  useEffect(() => {
    if (id) ConsultationService.getConsultation("A", Number(id)).then((row) => setForm((prev) => ({ ...prev, ...row })));
  }, [id]);

  const saveMutation = ConsultationService.useSaveMutation();
  const handleSubmit = submit(async (form) => {
    const [cId] = await saveMutation.mutateAsync({ spa: [form] });
    navigate(`/consultations/${cId}`);
  });

  return (
    <form>
      <Input {...register("title")} />
      <Textarea {...register("content")} />
      <Select {...register("status")} items={[{value:"pending",label:"Pending"},{value:"completed",label:"Completed"}]} />
      <button onClick={handleSubmit} disabled={saveMutation.isPending}>Save</button>
    </form>
  );
}
```

### Cache Invalidation

```typescript
const queryClient = useQueryClient();
await ConsultationService.changeStatus(id, newStatus, "Status change");
queryClient.invalidateQueries({
  queryKey: ["Consultation", "findById", "A", id],
});
queryClient.invalidateQueries({ queryKey: ["Consultation", "findMany"] });
```
