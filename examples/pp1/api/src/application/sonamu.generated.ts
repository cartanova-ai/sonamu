import { z } from "zod";
import { zArrayable, SQLDateTimeString, SonamuQueryMode } from "sonamu";

// CustomScalar: StringArray
const StringArray = z.array(z.string());
type StringArray = z.infer<typeof StringArray>;

// Enums: Brand
export const BrandOrderBy = z.enum(["id-desc"]).describe("BrandOrderBy");
export type BrandOrderBy = z.infer<typeof BrandOrderBy>;
export const BrandOrderByLabel = { "id-desc": "최신순" };
export const BrandSearchField = z.enum(["id"]).describe("BrandSearchField");
export type BrandSearchField = z.infer<typeof BrandSearchField>;
export const BrandSearchFieldLabel = { id: "ID" };

// Enums: Post
export const PostOrderBy = z.enum(["id-desc"]).describe("PostOrderBy");
export type PostOrderBy = z.infer<typeof PostOrderBy>;
export const PostOrderByLabel = { "id-desc": "최신순" };
export const PostSearchField = z
  .enum(["title", "content"])
  .describe("PostSearchField");
export type PostSearchField = z.infer<typeof PostSearchField>;
export const PostSearchFieldLabel = { title: "제목", content: "내용" };
export const PostRangeBy = z.enum(["created_at"]).describe("PostRangeBy");
export type PostRangeBy = z.infer<typeof PostRangeBy>;
export const PostRangeByLabel = { created_at: "등록일시" };
export const PostType = z.enum(["a-notice", "p-board"]).describe("PostType");
export type PostType = z.infer<typeof PostType>;
export const PostTypeLabel = {
  "a-notice": "공지사항",
  "p-board": "자유게시판",
};
export const PostStatus = z
  .enum(["ready", "active", "held"])
  .describe("PostStatus");
export type PostStatus = z.infer<typeof PostStatus>;
export const PostStatusLabel = { ready: "대기", active: "활성", held: "중지" };
export const PostPublicStatus = z
  .enum(["ready", "active"])
  .describe("PostPublicStatus");
export type PostPublicStatus = z.infer<typeof PostPublicStatus>;
export const PostPublicStatusLabel = { ready: "대기", active: "활성" };
export const PostImageType = z
  .enum(["header", "embed", "footer"])
  .describe("PostImageType");
export type PostImageType = z.infer<typeof PostImageType>;
export const PostImageTypeLabel = {
  header: "헤더",
  embed: "삽입",
  footer: "푸터",
};

// Enums: Product
export const ProductStatus = z
  .enum(["active", "held", "hidden"])
  .describe("ProductStatus");
export type ProductStatus = z.infer<typeof ProductStatus>;
export const ProductStatusLabel = {
  active: "활성",
  held: "홀드",
  hidden: "숨김",
};
export const ProductType = z.enum(["craft", "buy"]).describe("ProductType");
export type ProductType = z.infer<typeof ProductType>;
export const ProductTypeLabel = { craft: "제작", buy: "사입" };
export const ProductOrderBy = z
  .enum(["id-desc", "price-desc", "price-asc"])
  .describe("ProductOrderBy");
export type ProductOrderBy = z.infer<typeof ProductOrderBy>;
export const ProductOrderByLabel = {
  "id-desc": "최신순",
  "price-desc": "가격 높은순",
  "price-asc": "가격 낮은순",
};
export const ProductSearchField = z
  .enum(["title"])
  .describe("ProductSearchField");
export type ProductSearchField = z.infer<typeof ProductSearchField>;
export const ProductSearchFieldLabel = { title: "상품명" };

// Enums: Tag
export const TagOrderBy = z.enum(["id-desc"]).describe("TagOrderBy");
export type TagOrderBy = z.infer<typeof TagOrderBy>;
export const TagOrderByLabel = { "id-desc": "최신순" };
export const TagSearchField = z.enum(["id", "name"]).describe("TagSearchField");
export type TagSearchField = z.infer<typeof TagSearchField>;
export const TagSearchFieldLabel = { id: "ID", name: "태그명" };

// Enums: User
export const UserRole = z
  .enum(["normal", "staff", "supervisor"])
  .describe("UserRole");
export type UserRole = z.infer<typeof UserRole>;
export const UserRoleLabel = {
  normal: "일반",
  staff: "스탭",
  supervisor: "최고관리자",
};
export const UserStatus = z
  .enum(["ready", "active", "held"])
  .describe("UserStatus");
export type UserStatus = z.infer<typeof UserStatus>;
export const UserStatusLabel = { ready: "대기", active: "활성", held: "중지" };
export const UserPublicStatus = z
  .enum(["ready", "active"])
  .describe("UserPublicStatus");
export type UserPublicStatus = z.infer<typeof UserPublicStatus>;
export const UserPublicStatusLabel = { ready: "대기", active: "활성" };
export const UserOrderBy = z.enum(["id-desc"]).describe("UserOrderBy");
export type UserOrderBy = z.infer<typeof UserOrderBy>;
export const UserOrderByLabel = { "id-desc": "최신순" };
export const UserSearchField = z
  .enum(["name", "string_id"])
  .describe("UserSearchField");
export type UserSearchField = z.infer<typeof UserSearchField>;
export const UserSearchFieldLabel = { name: "이름", string_id: "로그인ID" };

// BaseSchema: Brand
export const BrandBaseSchema = z.object({
  id: z.number().int().nonnegative(),
  name: z.string().max(128),
  created_at: SQLDateTimeString,
});
export type BrandBaseSchema = z.infer<typeof BrandBaseSchema>;

// BaseSchema: File
export const FileBaseSchema = z.object({});
export type FileBaseSchema = z.infer<typeof FileBaseSchema>;

// BaseSchema: Post
export const PostBaseSchema = z.object({
  id: z.number().int().nonnegative(),
  type: PostType,
  title: z.string().max(256).nullable(),
  content: z.string().max(65535),
  author_id: z.number().int(),
  status: PostStatus,
  rating: z.string().nullable(),
  source_url: z.string().max(512).nullable(),
  is_public: z.boolean(),
  created_at: SQLDateTimeString,
  images: StringArray,
});
export type PostBaseSchema = z.infer<typeof PostBaseSchema>;

// BaseSchema: Product
export const ProductBaseSchema = z.object({
  id: z.number().int().nonnegative(),
  brand_id: z.number().int(),
  type: ProductType,
  title: z.string().max(128),
  description: z.string().max(16777215),
  price: z.number().int(),
  is_new: z.boolean(),
  visible_until_at: SQLDateTimeString,
  status: ProductStatus,
  created_at: SQLDateTimeString,
  checked_at: SQLDateTimeString.nullable(),
  // tags: ManyToMany Tag
  images: StringArray,
});
export type ProductBaseSchema = z.infer<typeof ProductBaseSchema>;

// BaseSchema: Tag
export const TagBaseSchema = z.object({
  id: z.number().int().nonnegative(),
  name: z.string().max(64),
  created_at: SQLDateTimeString,
});
export type TagBaseSchema = z.infer<typeof TagBaseSchema>;

// BaseSchema: User
export const UserBaseSchema = z.object({
  id: z.number().int().nonnegative(),
  role: UserRole,
  string_id: z.string().max(128),
  pw: z.string().max(256),
  name: z.string().max(64),
  birthyear: z.number().int().nonnegative(),
  status: UserStatus,
  created_at: SQLDateTimeString,
  // posts: HasMany Post
});
export type UserBaseSchema = z.infer<typeof UserBaseSchema>;

// BaseListParams: Brand
export const BrandBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: BrandSearchField,
    keyword: z.string(),
    orderBy: BrandOrderBy,
    queryMode: SonamuQueryMode,
    id: zArrayable(z.number().int().positive()),
  })
  .partial();
export type BrandBaseListParams = z.infer<typeof BrandBaseListParams>;

// BaseListParams: Post
export const PostBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: PostSearchField,
    keyword: z.string(),
    orderBy: PostOrderBy,
    queryMode: SonamuQueryMode,
    id: zArrayable(z.number().int().positive()),
    type: PostType,
    status: PostStatus,
  })
  .partial();
export type PostBaseListParams = z.infer<typeof PostBaseListParams>;

// BaseListParams: Product
export const ProductBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: ProductSearchField,
    keyword: z.string(),
    orderBy: ProductOrderBy,
    queryMode: SonamuQueryMode,
    id: zArrayable(z.number().int().positive()),
  })
  .partial();
export type ProductBaseListParams = z.infer<typeof ProductBaseListParams>;

// BaseListParams: Tag
export const TagBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: TagSearchField,
    keyword: z.string(),
    orderBy: TagOrderBy,
    queryMode: SonamuQueryMode,
    id: zArrayable(z.number().int().positive()),
  })
  .partial();
export type TagBaseListParams = z.infer<typeof TagBaseListParams>;

// BaseListParams: User
export const UserBaseListParams = z
  .object({
    num: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    search: UserSearchField,
    keyword: z.string(),
    orderBy: UserOrderBy,
    queryMode: SonamuQueryMode,
    id: zArrayable(z.number().int().positive()),
  })
  .partial();
export type UserBaseListParams = z.infer<typeof UserBaseListParams>;

// Subsets: Brand
export const BrandSubsetA = z.object({
  id: z.number().int().nonnegative(),
  name: z.string().max(128),
  created_at: SQLDateTimeString,
});
export type BrandSubsetA = z.infer<typeof BrandSubsetA>;
export type BrandSubsetMapping = {
  A: BrandSubsetA;
};
export const BrandSubsetKey = z.enum(["A"]);
export type BrandSubsetKey = z.infer<typeof BrandSubsetKey>;

// Subsets: Post
export const PostSubsetA = z.object({
  id: z.number().int().nonnegative(),
  type: PostType,
  title: z.string().max(256).nullable(),
  content: z.string().max(65535),
  status: PostStatus,
  rating: z.string().nullable(),
  source_url: z.string().max(512).nullable(),
  is_public: z.boolean(),
  created_at: SQLDateTimeString,
  images: StringArray,
  author: z.object({
    id: z.number().int().nonnegative(),
    name: z.string().max(64),
  }),
});
export type PostSubsetA = z.infer<typeof PostSubsetA>;
export const PostSubsetD = z.object({
  id: z.number().int().nonnegative(),
  type: PostType,
  title: z.string().max(256).nullable(),
  content: z.string().max(65535),
  created_at: SQLDateTimeString,
  images: StringArray,
  author_id: z.number().int().nonnegative(),
});
export type PostSubsetD = z.infer<typeof PostSubsetD>;
export type PostSubsetMapping = {
  A: PostSubsetA;
  D: PostSubsetD;
};
export const PostSubsetKey = z.enum(["A", "D"]);
export type PostSubsetKey = z.infer<typeof PostSubsetKey>;

// Subsets: Product
export const ProductSubsetA = z.object({
  id: z.number().int().nonnegative(),
  type: ProductType,
  title: z.string().max(128),
  description: z.string().max(16777215),
  price: z.number().int(),
  is_new: z.boolean(),
  visible_until_at: SQLDateTimeString,
  status: ProductStatus,
  created_at: SQLDateTimeString,
  checked_at: SQLDateTimeString.nullable(),
  images: StringArray,
  brand: z.object({
    id: z.number().int().nonnegative(),
    name: z.string().max(128),
  }),
  tags: z.array(
    z.object({
      id: z.number().int().nonnegative(),
      name: z.string().max(64),
      created_at: SQLDateTimeString,
    })
  ),
});
export type ProductSubsetA = z.infer<typeof ProductSubsetA>;
export type ProductSubsetMapping = {
  A: ProductSubsetA;
};
export const ProductSubsetKey = z.enum(["A"]);
export type ProductSubsetKey = z.infer<typeof ProductSubsetKey>;

// Subsets: Tag
export const TagSubsetA = z.object({
  id: z.number().int().nonnegative(),
  name: z.string().max(64),
  created_at: SQLDateTimeString,
});
export type TagSubsetA = z.infer<typeof TagSubsetA>;
export type TagSubsetMapping = {
  A: TagSubsetA;
};
export const TagSubsetKey = z.enum(["A"]);
export type TagSubsetKey = z.infer<typeof TagSubsetKey>;

// Subsets: User
export const UserSubsetA = z.object({
  id: z.number().int().nonnegative(),
  role: UserRole,
  string_id: z.string().max(128),
  pw: z.string().max(256),
  name: z.string().max(64),
  birthyear: z.number().int().nonnegative(),
  status: UserStatus,
  created_at: SQLDateTimeString,
  posts: z.array(
    z.object({
      id: z.number().int().nonnegative(),
      title: z.string().max(256).nullable(),
    })
  ),
});
export type UserSubsetA = z.infer<typeof UserSubsetA>;
export const UserSubsetD = z.object({
  id: z.number().int().nonnegative(),
  role: UserRole,
  string_id: z.string().max(128),
  name: z.string().max(64),
  birthyear: z.number().int().nonnegative(),
  status: UserStatus,
  created_at: SQLDateTimeString,
});
export type UserSubsetD = z.infer<typeof UserSubsetD>;
export const UserSubsetSS = z.object({
  id: z.number().int().nonnegative(),
  role: UserRole,
  string_id: z.string().max(128),
  name: z.string().max(64),
  birthyear: z.number().int().nonnegative(),
  status: UserStatus,
  created_at: SQLDateTimeString,
});
export type UserSubsetSS = z.infer<typeof UserSubsetSS>;
export type UserSubsetMapping = {
  A: UserSubsetA;
  D: UserSubsetD;
  SS: UserSubsetSS;
};
export const UserSubsetKey = z.enum(["A", "D", "SS"]);
export type UserSubsetKey = z.infer<typeof UserSubsetKey>;
