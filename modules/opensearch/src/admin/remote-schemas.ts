import { z } from "zod";

import { type NativeTypeMapping } from "../client/sdk-types";

export const acknowledgedSchema = z.looseObject({
  acknowledged: z.boolean(),
  shards_acknowledged: z.boolean().optional(),
  index: z.string().optional(),
});

const typeMappingSchema = z.custom<NativeTypeMapping>(
  (value) => z.looseObject({}).safeParse(value).success,
);

export const indexMetaSchema = z.record(z.string(), z.looseObject({ mappings: typeMappingSchema }));

export const aliasStateSchema = z.record(
  z.string(),
  z.looseObject({
    aliases: z.record(z.string(), z.looseObject({ is_write_index: z.boolean().optional() })),
  }),
);

export const catPluginsSchema = z.array(
  z.looseObject({ name: z.string().min(1), component: z.string().min(1) }),
);

export const catNodesSchema = z.array(z.looseObject({ name: z.string().min(1) }));
