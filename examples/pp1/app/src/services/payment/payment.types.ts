import { z } from "zod";
import { PaymentBaseSchema, PaymentBaseListParams } from "./payment.generated";

// Payment - ListParams
export const PaymentListParams = PaymentBaseListParams;
export type PaymentListParams = z.infer<typeof PaymentListParams>;

// Payment - SaveParams
export const PaymentSaveParams = PaymentBaseSchema.partial({ id: true });
export type PaymentSaveParams = z.infer<typeof PaymentSaveParams>;
