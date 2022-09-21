import { pick } from "lodash";
import { z } from "zod";
import { EnumsLabelKo } from "sonamu";

export const PostOrderBy = z.enum(["id-desc"]);
export type PostOrderBy = z.infer<typeof PostOrderBy>;

export const PostSearchField = z.enum(["title", "content"]);
export type PostSearchField = z.infer<typeof PostSearchField>;

export const PostRangeBy = z.enum(["created_at"]);
export type PostRangeBy = z.infer<typeof PostRangeBy>;

export const PostType = z.enum(["a-notice", "p-board"]);
export type PostType = z.infer<typeof PostType>;

export const PostStatus = z.enum(["ready", "active", "held"]);
export type PostStatus = z.infer<typeof PostStatus>;

export const PostImageType = z.enum(["header", "embed", "footer"]);
export type PostImageType = z.infer<typeof PostImageType>;

export namespace POST {
  // ORDER_BY
  export const ORDER_BY: EnumsLabelKo<PostOrderBy> = {
    "id-desc": { ko: "최신순" },
  };

  // SEARCH_FIELD
  export const SEARCH_FIELD: EnumsLabelKo<PostSearchField> = {
    title: { ko: "제목" },
    content: { ko: "내용" },
  };

  // RANGE_BY
  export const RANGE_BY: EnumsLabelKo<PostRangeBy> = {
    created_at: { ko: "등록일시" },
  };

  // TYPE
  export const TYPE: EnumsLabelKo<PostType> = {
    "a-notice": { ko: "공지사항" },
    "p-board": { ko: "자유게시판" },
  };

  // STATUS
  export const STATUS: EnumsLabelKo<PostStatus> = {
    ready: { ko: "대기" },
    active: { ko: "활성" },
    held: { ko: "중지" },
  };
  export const PUBLIC_STATUS = pick(STATUS, ["ready", "active"]);

  // IMAGE_TYPE
  export const IMAGE_TYPE: EnumsLabelKo<PostImageType> = {
    header: { ko: "헤더" },
    embed: { ko: "삽입" },
    footer: { ko: "푸터" },
  };
}
