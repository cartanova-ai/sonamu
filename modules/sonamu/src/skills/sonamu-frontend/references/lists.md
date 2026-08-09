# Lists and Selection

## `useListParams`

`useListParams` reads and writes TanStack Router search state. It must run under a TanStack Router
context because it calls `useSearch` and `useNavigate`.

```tsx
const { listParams, setListParams, register } = useListParams(ProjectListParams, {
  page: 1,
  num: 20,
});

const projectsQuery = ProjectService.useProjects("P", listParams);

<Input {...register("keyword")} />;
<Pagination {...register("page")} total={projectsQuery.data?.total ?? 0} itemsPerPage={20} />;
```

The hook parses the current search object with the supplied Zod schema. On success it overlays the
parsed values on `defaultValue`; if parsing fails, it returns `defaultValue` rather than a partial
parse.

`register(name)` returns `value` and `onValueChange`. A change to `page` preserves the other values.
A change to any other registered field resets `page` to 1, and an empty string is written as
`undefined`.

`setListParams(next)` replaces the router search object and skips navigation when `next` is deeply
equal to the current value.

The third argument accepts `{ disableSearchParams: true }`. This makes the read side always return
`defaultValue`; it does not disable navigation performed by `setListParams` or `register`.

## `useSelection`

Pass the keys that belong to the current list page. The hook retains selected entries while they
remain in that array and removes entries whose keys disappear:

```tsx
const rowIds = projectsQuery.data?.rows?.map((row) => row.id) ?? [];
const selection = useSelection(rowIds);

<Checkbox
  value={rowIds.length > 0 && selection.isAllSelected}
  onValueChange={selection.isAllSelected ? selection.deselectAll : selection.selectAll}
  label="Select all"
/>

{projectsQuery.data?.rows?.map((row) => (
  <Checkbox
    key={row.id}
    value={selection.getSelected(row.id)}
    onValueChange={() => selection.toggle(row.id)}
  />
))}
```

The returned operations are `getSelected`, `toggle`, `selectedKeys`, `selectAll`, `deselectAll`,
`isAllSelected`, and `handleCheckboxClick`. `isAllSelected` compares selected and available counts,
so it is also true when both arrays are empty; gate an all-selected indicator with `allKeys.length >
0` as in the example.

Use `handleCheckboxClick(event, index)` on a row click target that contains the checkbox input, and
keep `toggle(key)` on the checkbox value change. A normal click records `index` as the range anchor.
On Shift-click while that descendant input is unchecked, the helper replaces selection with the
union of the current selected keys and the `allKeys` slice between the anchor and `index`; it does
not toggle the clicked key itself.

`defaultSelectedKeys` initializes the map only on the first render. Later changes to that argument do
not replace the current selection.
