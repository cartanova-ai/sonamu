import { camelize } from "inflection";
import {
  BelongsToOneRelationProp,
  BigIntegerProp,
  BooleanProp,
  DateProp,
  DateTimeProp,
  DecimalProp,
  DistributiveOmit,
  DoubleProp,
  EnumProp,
  FloatProp,
  HasManyRelationProp,
  IntegerProp,
  JsonProp,
  ManyToManyRelationProp,
  OneToOneRelationProp,
  StringProp,
  TextProp,
  TimeProp,
  TimestampProp,
  UuidProp,
  VirtualProp,
} from "../types/types";

export const p = {
  integer,
  bigInteger,
  text,
  string,
  float,
  double,
  decimal,
  boolean,
  date,
  dateTime,
  time,
  timestamp,
  json,
  uuid,
  enums,
  virtual,
  relationOneToOne,
  relationBelongsToOne,
  relationHasMany,
  relationManyToMany,
};

function integer(
  name: string,
  option?: Omit<IntegerProp, "name" | "type">
): IntegerProp {
  return {
    name,
    type: "integer",
    ...option,
  };
}
function bigInteger(
  name: string,
  option?: Omit<BigIntegerProp, "name" | "type">
): BigIntegerProp {
  return {
    name,
    type: "bigInteger",
    ...option,
  };
}
function text(name: string, option: Omit<TextProp, "name" | "type">): TextProp {
  return {
    name,
    type: "text",
    ...option,
  };
}
function string(
  name: string,
  option: Omit<StringProp, "name" | "type">
): StringProp {
  return {
    name,
    type: "string",
    ...option,
  };
}
function float(
  name: string,
  option?: Omit<FloatProp, "name" | "type">
): FloatProp {
  return {
    name,
    type: "float",
    ...option,
  };
}
function double(
  name: string,
  option?: Omit<DoubleProp, "name" | "type">
): DoubleProp {
  return {
    name,
    type: "double",
    ...option,
  };
}
function decimal(
  name: string,
  option?: Omit<DecimalProp, "name" | "type">
): DecimalProp {
  return {
    name,
    type: "decimal",
    ...option,
  };
}
function boolean(
  name: string,
  option?: Omit<BooleanProp, "name" | "type">
): BooleanProp {
  return {
    name,
    type: "boolean",
    ...option,
  };
}
function date(
  name: string,
  option?: Omit<DateProp, "name" | "type"> & { now?: true }
): DateProp {
  if (option?.now === true) {
    delete option.now;
    option.dbDefault = "CURRENT_TIMESTAMP";
  }
  return {
    name,
    type: "date",
    ...option,
  };
}
function dateTime(
  name: string,
  option?: Omit<DateTimeProp, "name" | "type"> & { now?: true }
): DateTimeProp {
  if (option?.now === true) {
    delete option.now;
    option.dbDefault = "CURRENT_TIMESTAMP";
  }
  return {
    name,
    type: "dateTime",
    ...option,
  };
}
function time(
  name: string,
  option?: Omit<TimeProp, "name" | "type"> & { now?: true }
): TimeProp {
  if (option?.now === true) {
    delete option.now;
    option.dbDefault = "CURRENT_TIMESTAMP";
  }
  return {
    name,
    type: "time",
    ...option,
  };
}
function timestamp(
  name: string,
  option?: Omit<TimestampProp, "name" | "type"> & { now?: true }
): TimestampProp {
  if (option?.now === true) {
    delete option.now;
    option.dbDefault = "CURRENT_TIMESTAMP";
  }
  return {
    name,
    type: "timestamp",
    ...option,
  };
}
function json(name: string, option: Omit<JsonProp, "name" | "type">): JsonProp {
  return {
    name,
    type: "json",
    ...option,
  };
}
function uuid(name: string, option: Omit<UuidProp, "name" | "type">): UuidProp {
  return {
    name,
    type: "uuid",
    ...option,
  };
}
function enums(
  name: string,
  option: Omit<EnumProp, "name" | "type" | "id"> & { id?: string }
): EnumProp {
  return {
    name,
    type: "enum",
    id: option.id ?? `$Model${camelize(name)}`,
    ...option,
  };
}
function virtual(
  name: string,
  option: Omit<
    VirtualProp,
    "name" | "type" | "index" | "unique" | "dbDefault" | "toFilter"
  >
): VirtualProp {
  return {
    name,
    type: "virtual",
    ...option,
  };
}
function relationOneToOne(
  name: string,
  option: DistributiveOmit<
    OneToOneRelationProp,
    "name" | "type" | "relationType"
  >
): OneToOneRelationProp {
  return {
    name,
    type: "relation",
    relationType: "OneToOne",
    ...option,
  };
}
function relationBelongsToOne(
  name: string,
  option: Omit<BelongsToOneRelationProp, "name" | "type" | "relationType">
): BelongsToOneRelationProp {
  return {
    name,
    type: "relation",
    relationType: "BelongsToOne",
    ...option,
  };
}
function relationHasMany(
  name: string,
  option: Omit<HasManyRelationProp, "name" | "type" | "relationType">
): HasManyRelationProp {
  return {
    name,
    type: "relation",
    relationType: "HasMany",
    ...option,
  };
}
function relationManyToMany(
  name: string,
  option: Omit<ManyToManyRelationProp, "name" | "type" | "relationType">
): ManyToManyRelationProp {
  return {
    name,
    type: "relation",
    relationType: "ManyToMany",
    ...option,
  };
}
