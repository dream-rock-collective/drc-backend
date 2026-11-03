import { describe, expect, test } from "bun:test";
import { draftStorageKey, moveSection, parseDraft, parseEditorContent, parseSnapshot, replaceCopyField } from "../src/client/content-editor-state";
import { safeLink } from "../src/client/RichTextEditor";

const content = { join: { title: "Join", fields: { name: { label: "Name" } } }, sections: [{ title: "First", body: "<p>One</p>" }, { title: "Second", body: "<p>Two</p>" }] };
const revision = "a".repeat(64);
describe("browser draft contract", () => {
  test("restores the original revision rather than replacing it with the latest", () => {
    const draft = parseDraft(JSON.stringify({ content, revision }));
    expect(draft.revision).toBe(revision);
    expect(draft.content.sections).toEqual(content.sections);
    expect(() => parseDraft(JSON.stringify({ content, revision: "invalid" }))).toThrow();
    expect(() => parseEditorContent({ sections: [{ title: "x", body: 42 }] })).toThrow();
    expect(() => parseEditorContent({ sections: [], join: { title: null } })).toThrow();
  });
  test("keys drafts by the authenticated destination key", () => {
    const snapshot = parseSnapshot({ content, revision, mode: "local", pending: false, draftKey: "user-site-one" });
    expect(draftStorageKey(snapshot)).not.toBe(draftStorageKey({ draftKey: "user-site-two" }));
    expect(() => parseSnapshot({ ...snapshot, mode: "unknown" })).toThrow();
  });
  test("edits nested display copy without changing sibling fields", () => {
    const updated = replaceCopyField(content, ["join", "fields", "name", "label"], "Your name");
    expect(updated).toEqual({ ...content, join: { title: "Join", fields: { name: { label: "Your name" } } } });
    expect(content.join.fields.name.label).toBe("Name");
  });
  test("moves array entries intact and does not mutate existing content", () => {
    expect(moveSection(content.sections, 1, 0).map((section) => section.title)).toEqual(["Second", "First"]);
    expect(content.sections[0]?.title).toBe("First");
    expect(moveSection(content.sections, 0, -1)).toEqual(content.sections);
  });
});

test("link controls reject executable and obfuscated destinations", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,x", "//elsewhere.test", "/\\elsewhere.test", "https:\n//elsewhere.test"]) expect(safeLink(url)).toBe(false);
  for (const url of ["https://example.test", "mailto:hello@example.test", "/about", "#about"]) expect(safeLink(url)).toBe(true);
});
