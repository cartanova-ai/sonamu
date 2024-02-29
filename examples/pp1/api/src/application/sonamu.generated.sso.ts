import { SubsetQuery } from "sonamu";
import {
  BrandSubsetKey,
  PostSubsetKey,
  ProductSubsetKey,
  TagSubsetKey,
  UserSubsetKey,
} from "./sonamu.generated";

// SubsetQuery: Brand
export const brandSubsetQueries: { [key in BrandSubsetKey]: SubsetQuery } = {
  A: {
    select: ["brands.id", "brands.name", "brands.created_at"],
    virtual: [],
    joins: [],
    loaders: [],
  },
};

// SubsetQuery: Post
export const postSubsetQueries: { [key in PostSubsetKey]: SubsetQuery } = {
  A: {
    select: [
      "posts.id",
      "posts.type",
      "posts.title",
      "posts.content",
      "posts.status",
      "posts.rating",
      "posts.source_url",
      "posts.is_public",
      "posts.created_at",
      "posts.images",
      "author.id as author__id",
      "author.name as author__name",
    ],
    virtual: [],
    joins: [
      {
        as: "author",
        join: "inner",
        table: "users",
        from: "posts.author_id",
        to: "author.id",
      },
    ],
    loaders: [],
  },
  D: {
    select: [
      "posts.id",
      "posts.type",
      "posts.title",
      "posts.content",
      "posts.created_at",
      "posts.images",
      "posts.author_id",
    ],
    virtual: [],
    joins: [],
    loaders: [],
  },
};

// SubsetQuery: Product
export const productSubsetQueries: { [key in ProductSubsetKey]: SubsetQuery } =
  {
    A: {
      select: [
        "products.id",
        "products.type",
        "products.title",
        "products.description",
        "products.price",
        "products.is_new",
        "products.visible_until_at",
        "products.status",
        "products.created_at",
        "products.checked_at",
        "products.images",
        "brand.id as brand__id",
        "brand.name as brand__name",
      ],
      virtual: [],
      joins: [
        {
          as: "brand",
          join: "inner",
          table: "brands",
          from: "products.brand_id",
          to: "brand.id",
        },
      ],
      loaders: [
        {
          as: "tags",
          table: "tags",
          manyJoin: {
            fromTable: "products",
            fromCol: "id",
            idField: "id",
            through: {
              table: "products__tags",
              fromCol: "product_id",
              toCol: "tag_id",
            },
            toTable: "tags",
            toCol: "id",
          },
          oneJoins: [],
          select: ["tags.id", "tags.name", "tags.created_at"],
          loaders: [],
        },
      ],
    },
  };

// SubsetQuery: Tag
export const tagSubsetQueries: { [key in TagSubsetKey]: SubsetQuery } = {
  A: {
    select: ["tags.id", "tags.name", "tags.created_at"],
    virtual: [],
    joins: [],
    loaders: [],
  },
};

// SubsetQuery: User
export const userSubsetQueries: { [key in UserSubsetKey]: SubsetQuery } = {
  A: {
    select: [
      "users.id",
      "users.role",
      "users.string_id",
      "users.pw",
      "users.name",
      "users.birthyear",
      "users.status",
      "users.created_at",
    ],
    virtual: [],
    joins: [],
    loaders: [
      {
        as: "posts",
        table: "posts",
        manyJoin: {
          fromTable: "users",
          fromCol: "id",
          idField: "id",
          toTable: "posts",
          toCol: "author_id",
        },
        oneJoins: [],
        select: ["posts.id", "posts.title"],
        loaders: [],
      },
    ],
  },
  D: {
    select: [
      "users.id",
      "users.role",
      "users.string_id",
      "users.name",
      "users.birthyear",
      "users.status",
      "users.created_at",
    ],
    virtual: [],
    joins: [],
    loaders: [],
  },
  SS: {
    select: [
      "users.id",
      "users.role",
      "users.string_id",
      "users.name",
      "users.birthyear",
      "users.status",
      "users.created_at",
    ],
    virtual: [],
    joins: [],
    loaders: [],
  },
};
