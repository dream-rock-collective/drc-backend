export type CopyFields = { [key: string]: string | CopyFields };
export type ContentSection = {
  title: string;
  body: string;
  image?: { src: string; alt: string };
};
export type EditorContent = {
  sections: ContentSection[];
  [key: string]: CopyFields | ContentSection[];
};
export type ContentSnapshot = {
  content: EditorContent;
  revision: string;
  mode: "local" | "remote";
  pending: boolean;
  draftKey: string;
  commit?: string;
};
export type ContentDraft = { content: EditorContent; revision: string };

const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const textFields = (value: unknown, depth = 0): boolean =>
  record(value) &&
  depth < 8 &&
  Object.values(value).every(
    (item) => typeof item === "string" || textFields(item, depth + 1),
  );
export function parseEditorContent(value: unknown): EditorContent {
  if (
    !record(value) ||
    !Array.isArray(value["sections"]) ||
    value["sections"].length > 100 ||
    Object.entries(value).some(
      ([key, item]) => key !== "sections" && !textFields(item),
    ) ||
    value["sections"].some(
      (section: unknown) =>
        !record(section) ||
        typeof section["title"] !== "string" ||
        typeof section["body"] !== "string" ||
        (section["image"] !== undefined &&
          (!record(section["image"]) ||
            typeof section["image"]["src"] !== "string" ||
            typeof section["image"]["alt"] !== "string")),
    )
  ) {
    throw new Error(
      "The saved page content is invalid. Discard this draft and reload the current page.",
    );
  }
  return value as EditorContent;
}
export function parseSnapshot(value: unknown): ContentSnapshot {
  if (
    !record(value) ||
    typeof value["revision"] !== "string" ||
    !/^[a-f0-9]{64}$/.test(value["revision"]) ||
    (value["mode"] !== "local" && value["mode"] !== "remote") ||
    typeof value["pending"] !== "boolean" ||
    typeof value["draftKey"] !== "string"
  ) {
    throw new Error("Could not read the site content response");
  }
  return {
    content: parseEditorContent(value["content"]),
    revision: value["revision"],
    mode: value["mode"],
    pending: value["pending"],
    draftKey: value["draftKey"],
    ...(typeof value["commit"] === "string" ? { commit: value["commit"] } : {}),
  };
}
export function parseDraft(raw: string): ContentDraft {
  const value: unknown = JSON.parse(raw);
  if (
    !record(value) ||
    typeof value["revision"] !== "string" ||
    !/^[a-f0-9]{64}$/.test(value["revision"])
  )
    throw new Error("The saved draft is invalid");
  const content = parseEditorContent(value["content"]);
  for (const key of ["metadata", "branding", "planLabels"]) delete content[key];
  const member = content["member"];
  if (record(member)) delete member["heading"];
  return { revision: value["revision"], content };
}
export function replaceCopyField(
  content: EditorContent,
  path: string[],
  value: string,
): EditorContent {
  const next = structuredClone(content);
  let current: CopyFields = next[path[0] ?? ""] as CopyFields;
  for (const key of path.slice(1, -1)) current = current[key] as CopyFields;
  const key = path.at(-1);
  if (key) current[key] = value;
  return next;
}
export function moveSection(
  sections: ContentSection[],
  from: number,
  to: number,
): ContentSection[] {
  const next = [...sections];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length)
    return next;
  const [section] = next.splice(from, 1);
  if (section) next.splice(to, 0, section);
  return next;
}
export const draftStorageKey = (
  snapshot: Pick<ContentSnapshot, "draftKey">,
): string => `dreamrock:content-draft:${snapshot.draftKey}`;

export type ContentChange = {
  path: string[];
  before: string | undefined;
  after: string | undefined;
};
export function contentChanges(
  before: EditorContent,
  after: EditorContent,
): ContentChange[] {
  const changes: ContentChange[] = [];
  const visit = (previous: unknown, next: unknown, path: string[]) => {
    if (previous === next) return;
    if (Array.isArray(previous) || Array.isArray(next)) {
      const oldItems: unknown[] = Array.isArray(previous) ? previous : [];
      const newItems: unknown[] = Array.isArray(next) ? next : [];
      for (
        let index = 0;
        index < Math.max(oldItems.length, newItems.length);
        index++
      ) {
        visit(oldItems[index], newItems[index], [...path, String(index)]);
      }
    } else if (record(previous) || record(next)) {
      const oldFields = record(previous) ? previous : {};
      const newFields = record(next) ? next : {};
      for (const key of new Set([
        ...Object.keys(oldFields),
        ...Object.keys(newFields),
      ])) {
        visit(oldFields[key], newFields[key], [...path, key]);
      }
    } else if (typeof previous === "string" || typeof next === "string") {
      changes.push({
        path,
        before: typeof previous === "string" ? previous : undefined,
        after: typeof next === "string" ? next : undefined,
      });
    }
  };
  visit(before, after, []);
  return changes;
}
