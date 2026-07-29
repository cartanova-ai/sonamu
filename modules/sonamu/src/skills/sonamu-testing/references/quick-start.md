# Quick Start — Getting Started with Tests Quickly


**Prerequisites**: scaffolding completed, nullable field handling in types.ts completed

### Step 1: Extend test-helpers.ts

```typescript
// packages/api/src/application/__tests__/test-helpers.ts

import { User, UserSaveParams } from "../user/user.types";
import { Post, PostSaveParams } from "../post/post.types";
import { Comment, CommentSaveParams } from "../comment/comment.types";
import UserModel from "../user/user.model";
import PostModel from "../post/post.model";
import CommentModel from "../comment/comment.model";

// User helper
export async function createTestUser(params?: Partial<UserSaveParams>): Promise<number> {
  const user: UserSaveParams = {
    email: `test-${Date.now()}@example.com`,
    name: "Test User",
    ...params,
  };
  const [id] = await UserModel.save([user]);
  return id;
}

// User with dependencies (dependency chain)
export async function createTestUserWithDeps() {
  const userId = await createTestUser();
  return { userId };
}

// Post helper
export async function createTestPost(
  authorId: number,
  params?: Partial<PostSaveParams>,
): Promise<number> {
  const post: PostSaveParams = {
    author_id: authorId,
    title: "Test Post",
    content: "Test content",
    ...params,
  };
  const [id] = await PostModel.save([post]);
  return id;
}

// Post with dependencies
export async function createTestPostWithDeps() {
  const { userId } = await createTestUserWithDeps();
  const postId = await createTestPost(userId);
  return { userId, postId };
}

// Comment helper
export async function createTestComment(
  postId: number,
  authorId: number,
  params?: Partial<CommentSaveParams>,
): Promise<number> {
  const comment: CommentSaveParams = {
    post_id: postId,
    author_id: authorId,
    content: "Test comment",
    ...params,
  };
  const [id] = await CommentModel.save([comment]);
  return id;
}

// Comment with dependencies
export async function createTestCommentWithDeps() {
  const { userId, postId } = await createTestPostWithDeps();
  const commentId = await createTestComment(postId, userId);
  return { userId, postId, commentId };
}
```

**CRITICAL patterns**:

- `createTestX()`: basic creation helper (overridable via params)
- `createTestXWithDeps()`: helper that automatically handles dependencies (creates all required data together)
- FK fields use the `_id` suffix (`author_id`, `post_id`)
- Returns: primarily returns ID; WithDeps returns an object with multiple IDs

**CRITICAL: All required fields must be included!**

Sonamu's `ubUpsert` uses PostgreSQL's `ON CONFLICT ... DO UPDATE` query.
Even for updates, **all required fields (fields with NOT NULL constraints)** must be included.

When required fields are missing:

```typescript
// BAD - missing required field content
const post: PostSaveParams = {
  author_id: authorId,
  title: "Test",
  // content missing! → ubUpsert ON CONFLICT UPDATE attempts to set NULL → DB error
};
// Error: null value in column "content" violates not-null constraint
```

### Distinguishing Required vs Optional Fields

**1. Check entity.json**

```json
// post.entity.json
{
  "props": [
    { "name": "id", "type": "integer" }, // auto-generated - exclude
    { "name": "title", "type": "string", "length": 255 }, // required! (no nullable)
    { "name": "content", "type": "string" }, // required! (no nullable)
    { "name": "category", "type": "string", "nullable": true }, // optional (nullable)
    { "name": "author_id", "type": "integer" }, // required! (FK, no nullable)
    { "name": "view_count", "type": "integer", "dbDefault": "0" }, // required but has DB default
    { "name": "created_at", "type": "date", "dbDefault": "CURRENT_TIMESTAMP" } // automatic
  ]
}
```

**Required fields**: Fields **without** `nullable: true`

- `title`, `content`, `author_id`
- **Must** provide default values in test-helpers.ts

**Optional fields**: Fields **with** `nullable: true`

- `category`
- Can be omitted in test-helpers.ts

**Excluded fields**:

- `id`: auto-increment (auto-generated on save)
- `created_at`: automatically set by dbDefault
- `view_count`: automatically set by dbDefault="0"

**2. Write test-helpers.ts**

```typescript
export async function createTestPost(
  authorId: number,
  params?: Partial<PostSaveParams>,
): Promise<number> {
  const post: PostSaveParams = {
    // Required fields must be included (fields without nullable)
    author_id: authorId,
    title: "Test Post", // required!
    content: "Test content", // required!

    // Optional fields can be omitted (fields with nullable: true)
    // category: null,  // can be omitted

    // Fields with dbDefault can also be omitted
    // view_count: 0,  // can be omitted since dbDefault="0"

    ...params, // allow override
  };
  const saved = await PostModel.save(post);
  return saved.id;
}
```

**Rule summary**:

1. Fields without `nullable: true` in entity.json = required fields
2. Required fields **must** have default values in test-helpers.ts
3. `id`, `created_at`, fields with `dbDefault` can be excluded
4. Required fields are also needed for ubUpsert's ON CONFLICT UPDATE

### Step 2: Write the test file

```typescript
// packages/api/src/application/post/__tests__/post.test.ts

import { bootstrap } from "sonamu";
import { describe, test, expect, vi } from "vitest";
import PostModel from "../post.model";
import { createTestPostWithDeps } from "../../__tests__/test-helpers";

bootstrap(vi); // CRITICAL: required!

describe("PostModel", () => {
  describe("A. Create", () => {
    test("create post", async () => {
      const { userId, postId } = await createTestPostWithDeps();

      const post = await PostModel.findById(postId, ["A"]);
      expect(post.id).toBe(postId);
      expect(post.author_id).toBe(userId);
    });
  });

  describe("B. Read", () => {
    test("findById - Subset A", async () => {
      const { postId } = await createTestPostWithDeps();

      const post = await PostModel.findById(postId, ["A"]);
      expect(post.id).toBe(postId);
      expect(post).toHaveProperty("title");
      expect(post).toHaveProperty("content");
    });

    test("findMany - list query", async () => {
      await createTestPostWithDeps();
      await createTestPostWithDeps();

      const { rows } = await PostModel.findMany({ num: 10 });
      expect(rows.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("C. Update", () => {
    test("update post", async () => {
      const { postId } = await createTestPostWithDeps();

      await PostModel.save([
        {
          id: postId,
          title: "Updated Title",
        },
      ]);

      const updated = await PostModel.findById("A", postId);
      expect(updated.title).toBe("Updated Title");
    });
  });

  describe("D. Delete", () => {
    test("delete post", async () => {
      const { postId } = await createTestPostWithDeps();

      await PostModel.del(postId);

      const post = await PostModel.findById(postId, ["A"]);
      expect(post).toBeNull();
    });
  });

  describe("E. Business Logic", () => {
    test("full process from post creation to adding a comment", async () => {
      // 1. create post
      const { userId, postId } = await createTestPostWithDeps({
        title: "New Post",
        content: "Content",
      });

      // 2. another user writes a comment
      const commenterId = await createTestUser();
      const commentId = await createTestComment(postId, commenterId, {
        content: "Great post!",
      });

      // 3. fetch post (with comments)
      const post = await PostModel.findById(postId, ["A"]);
      expect(post.comments).toHaveLength(1);
      expect(post.comments[0].id).toBe(commentId);
    });
  });
});
```

**Pattern summary**:

- `bootstrap(vi)` call is required
- `describe` + `test` pattern (order: A. Create, B. Read, C. Update, D. Delete, E. Business Logic)
- Use `createTestXWithDeps()` helper to automatically resolve dependencies
- The Business Logic section is the most important! (implements real business scenarios)

### Step 3: Run tests

```bash
# Start dev server if it's down
pnpm sonamu dev

# Tests during development (default)
pnpm sonamu test
pnpm sonamu test user.model
```

**Done!** See the sections below for detailed information.

---
