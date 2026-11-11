import { useEffect, useRef } from "react";
import { contentChanges, type EditorContent } from "./content-editor-state";
import { normalizeRichText } from "./RichTextEditor";

function changeLabel(path: string[]): string {
  const parts = path.flatMap((part, index) =>
    part === "sections" && path[index + 1] !== undefined
      ? [`Section ${Number(path[index + 1]) + 1}`]
      : index > 0 && path[index - 1] === "sections"
        ? []
        : [part],
  );
  return parts
    .map((part) =>
      part === "join"
        ? "Join Pane"
        : part === "member"
          ? "Member Pane"
          : part
              .replace(/([a-z])([A-Z])/g, "$1 $2")
              .replace(/^./, (letter) => letter.toUpperCase()),
    )
    .join(" / ");
}

function ChangeValue({
  value,
  rich,
}: {
  value: string | undefined;
  rich: boolean;
}) {
  if (value === undefined) return <span className="muted">Not present</span>;
  if (!value) return <span className="muted">Empty</span>;
  if (rich)
    return (
      <div dangerouslySetInnerHTML={{ __html: normalizeRichText(value) }} />
    );
  return <p className="change-text">{value}</p>;
}

export function PublishReview({
  before,
  after,
  mode,
  pending,
  onCancel,
  onConfirm,
}: {
  before: EditorContent;
  after: EditorContent;
  mode: "local" | "remote";
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const changes = contentChanges(before, after);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    cancelButton.current?.focus();
    return () => element?.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="publish-review"
      aria-labelledby="publish-review-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <header>
        <h2 id="publish-review-title">
          {pending ? "Review pending push" : "Review changes"}
        </h2>
        <p>
          {pending
            ? "Retry the previously committed content. No additional edits will be committed."
            : mode === "local"
              ? "Confirm these changes to update the local site checkout."
              : "Confirm these changes to commit and push the website content."}
        </p>
      </header>
      <div className="publish-review-changes">
        {changes.map((change) => {
          const rich =
            change.path.at(-1) === "body" ||
            change.path.join(".") === "member.helpBody";
          return (
            <section className="publish-change" key={change.path.join(".")}>
              <h3>{changeLabel(change.path)}</h3>
              <div className="change-values">
                <div>
                  <h4>Before</h4>
                  <ChangeValue value={change.before} rich={rich} />
                </div>
                <div>
                  <h4>After</h4>
                  <ChangeValue value={change.after} rich={rich} />
                </div>
              </div>
            </section>
          );
        })}
        {!changes.length && (
          <p>
            {pending
              ? "The saved publication is ready to retry."
              : "No content changes."}
          </p>
        )}
      </div>
      <footer className="content-actions">
        <button type="button" onClick={onConfirm}>
          {pending ? "Confirm retry" : "Confirm publish"}
        </button>
        <button
          type="button"
          className="secondary"
          ref={cancelButton}
          onClick={onCancel}
        >
          Keep editing
        </button>
      </footer>
    </dialog>
  );
}
