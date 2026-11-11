import { describe, expect, test } from "bun:test";
import {
  contentChanges,
  draftStorageKey,
  moveSection,
  parseDraft,
  parseEditorContent,
  parseSnapshot,
  replaceCopyField,
} from "../src/client/content-editor-state";
import { safeLink } from "../src/client/RichTextEditor";

const content = {
  join: { title: "Join", fields: { name: { label: "Name" } } },
  sections: [
    { title: "First", body: "<p>One</p>" },
    { title: "Second", body: "<p>Two</p>" },
  ],
};
const revision = "a".repeat(64);
describe("browser draft contract", () => {
  test("restores the original revision rather than replacing it with the latest", () => {
    const draft = parseDraft(JSON.stringify({ content, revision }));
    expect(draft.revision).toBe(revision);
    expect(draft.content.sections).toEqual(content.sections);
    expect(() =>
      parseDraft(JSON.stringify({ content, revision: "invalid" })),
    ).toThrow();
    expect(() =>
      parseEditorContent({ sections: [{ title: "x", body: 42 }] }),
    ).toThrow();
    expect(() =>
      parseEditorContent({ sections: [], join: { title: null } }),
    ).toThrow();
  });
  test("keys drafts by the authenticated destination key", () => {
    const snapshot = parseSnapshot({
      content,
      revision,
      mode: "local",
      pending: false,
      draftKey: "user-site-one",
    });
    expect(draftStorageKey(snapshot)).not.toBe(
      draftStorageKey({ draftKey: "user-site-two" }),
    );
    expect(() => parseSnapshot({ ...snapshot, mode: "unknown" })).toThrow();
  });
  test("preserves saved edits while dropping groups that are now fixed in code", () => {
    const draft = parseDraft(
      JSON.stringify({
        revision,
        content: {
          ...content,
          metadata: { title: "Old title" },
          branding: { label: "Old brand" },
          planLabels: { free: "Old label" },
        },
      }),
    );
    expect(draft.content).toEqual(content);
    expect(draft.revision).toBe(revision);
    const memberDraft = parseDraft(
      JSON.stringify({
        revision,
        content: {
          ...content,
          member: {
            heading: "Unused banner",
            overlayHeading: "Thanks {firstName}!",
          },
        },
      }),
    );
    expect(memberDraft.content["member"]).toEqual({
      overlayHeading: "Thanks {firstName}!",
    });
  });
  test("edits nested display copy without changing sibling fields", () => {
    const updated = replaceCopyField(
      content,
      ["join", "fields", "name", "label"],
      "Your name",
    );
    expect(updated).toEqual({
      ...content,
      join: { title: "Join", fields: { name: { label: "Your name" } } },
    });
    expect(content.join.fields.name.label).toBe("Name");
  });
  test("moves array entries intact and does not mutate existing content", () => {
    expect(
      moveSection(content.sections, 1, 0).map((section) =>
        section.type === "divider" ? "Divider" : section.title,
      ),
    ).toEqual(["Second", "First"]);
    expect(content.sections[0]?.title).toBe("First");
    expect(moveSection(content.sections, 0, -1)).toEqual(content.sections);
  });
});

describe("publication review", () => {
  test("shows only edited text fields with before and after values", () => {
    expect(contentChanges(content, structuredClone(content))).toEqual([]);
    const next = replaceCopyField(content, ["join", "title"], "Welcome");
    expect(contentChanges(content, next)).toEqual([
      { path: ["join", "title"], before: "Join", after: "Welcome" },
    ]);
  });
  test("includes added and removed sections and optional images", () => {
    const next = {
      ...content,
      sections: [
        {
          title: "First",
          body: "<p>One</p>",
          image: { src: "/rock.png", alt: "Rock" },
        },
      ],
    };
    expect(contentChanges(content, next)).toContainEqual({
      path: ["sections", "0", "image", "src"],
      before: undefined,
      after: "/rock.png",
    });
    expect(contentChanges(content, next)).toContainEqual({
      path: ["sections", "1", "title"],
      before: "Second",
      after: undefined,
    });
    expect(contentChanges(next, content)).toContainEqual({
      path: ["sections", "1", "body"],
      before: undefined,
      after: "<p>Two</p>",
    });
  });
  test("shows reordered sections at their new positions and retains empty values", () => {
    const next = {
      ...content,
      sections: moveSection(content.sections, 1, 0),
      join: { ...content.join, title: "" },
    };
    const changes = contentChanges(content, next);
    expect(changes).toContainEqual({
      path: ["sections", "0", "title"],
      before: "First",
      after: "Second",
    });
    expect(changes).toContainEqual({
      path: ["join", "title"],
      before: "Join",
      after: "",
    });
  });
});

test("link controls reject executable and obfuscated destinations", () => {
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,x",
    "//elsewhere.test",
    "/\\elsewhere.test",
    "https:\n//elsewhere.test",
  ])
    expect(safeLink(url)).toBe(false);
  for (const url of [
    "https://example.test",
    "mailto:hello@example.test",
    "/about",
    "#about",
  ])
    expect(safeLink(url)).toBe(true);
});

test("nested page drafts retain ordered charity fields and review changes", () => {
  const pages = {
    ...content,
    subscriptions: {
      title: "Subscriptions",
      body: "<p>Intro</p>",
      sections: content.sections,
    },
    donations: {
      title: "Donate",
      body: "<p>Choose</p>",
      sections: [
        {
          key: "first",
          title: "First Charity",
          url: "https://example.test",
          body: "<p>Work</p>",
        },
        {
          key: "second",
          title: "Second Charity",
          url: "https://example.test/second",
          body: "<p>More</p>",
        },
      ],
    },
    success: { title: "Thanks!", sections: [{ type: "divider" as const }] },
  };
  const restored = parseDraft(JSON.stringify({ revision, content: pages }));
  expect(restored.content).toEqual(pages);
  const updated = replaceCopyField(
    restored.content,
    ["donations", "title"],
    "Give locally",
  );
  expect(updated["subscriptions"]).toEqual(pages.subscriptions);
  const reordered = {
    ...pages,
    donations: {
      ...pages.donations,
      sections: moveSection(pages.donations.sections, 1, 0),
    },
  };
  expect(contentChanges(pages, reordered)).toContainEqual({
    path: ["donations", "sections", "0", "key"],
    before: "first",
    after: "second",
  });
  expect(() =>
    parseEditorContent({
      ...pages,
      donations: { ...pages.donations, sections: [{ title: "Bad", body: 3 }] },
    }),
  ).toThrow();
});

test("drafts retain dividers and reject content attached to divider records", () => {
  const divided = { ...content, sections: [{ type: "divider" as const }] };
  expect(parseEditorContent(divided)).toEqual(divided);
  const parsed = parseEditorContent(divided);
  const reordered = moveSection(
    [...content.sections, ...parsed.sections],
    2,
    0,
  );
  expect(reordered[0]).toEqual({ type: "divider" });
  expect(contentChanges(content, parsed)).toContainEqual({
    path: ["sections", "0", "type"],
    before: undefined,
    after: "divider",
  });
  for (const section of [
    { type: "divider", title: "Unexpected" },
    { type: "divider", image: { src: "/rock.png", alt: "Unexpected" } },
    { type: "unknown" },
  ]) {
    expect(() =>
      parseEditorContent({ ...content, sections: [section] }),
    ).toThrow();
  }
});
