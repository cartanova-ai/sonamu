import { z } from "zod";
import { NumberInput, useTypeForm } from ".";
import { Form, Header, Segment } from "semantic-ui-react";
import "semantic-ui-css/semantic.min.css";

export default function App() {
  // Form
  const { form, register } = useTypeForm(
    z.object({
      n1: z.number(),
      n2: z.number().nullable(),
      n3: z.number().optional(),
    }),
    {
      n1: 300,
      n2: null,
      n3: undefined,
    }
  );

  return (
    <div style={{ padding: "2em 3em" }}>
      <Header>@sonamu-kit/react-sui - Sonamu with semantic-ui-react</Header>
      <Segment>
        <Header>Components</Header>
        <code
          style={{
            padding: "1em",
            margin: ".5em",
            backgroundColor: "#eee",
            width: "100%",
            display: "block",
          }}
        >
          {JSON.stringify(form, null, 2)}
        </code>
        <Form>
          <Form.Group widths="equal">
            <Form.Field>
              <label>NumberInput1: Mandatory</label>
              <NumberInput {...register("n1")} />
            </Form.Field>
            <Form.Field>
              <label>NumberInput2: Nullable</label>
              <NumberInput {...register("n2")} />
            </Form.Field>
            <Form.Field>
              <label>NumberInput3: Optional</label>
              <NumberInput {...register("n3")} />
            </Form.Field>
          </Form.Group>
        </Form>
      </Segment>
    </div>
  );
}

// BaseListParams: Product
export const ProductBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    keyword: z.string(),
    hs_code_id: z.number().int().nullable(),
  })
  .partial();
export type ProductBaseListParams = z.infer<typeof ProductBaseListParams>;

// Product - ListParams
export const ProductListParams = ProductBaseListParams.extend({
  exclude_id: zArrayable(z.number()).optional(),
  sku: zArrayable(z.string()).optional(),
  category_id: zArrayable(z.number()).optional(),
  brand_id: zArrayable(z.number()).optional(),
  tag_id: zArrayable(z.number()).optional(),
  perfume_mainnote_id: zArrayable(z.number()).optional(),
  perfume_grade_id: zArrayable(z.number()).optional(),
  picked_user_id: z.number().optional(),
  deal_id: z.number().optional(),
  max_price: z.number().optional(),
  max_volume_ml: z.number().optional(),
});
export type ProductListParams = z.infer<typeof ProductListParams>;

export function zArrayable<T extends z.ZodTypeAny>(
  shape: T
): z.ZodUnion<[T, z.ZodArray<T, "many">]> {
  return z.union([shape, shape.array()]);
}
