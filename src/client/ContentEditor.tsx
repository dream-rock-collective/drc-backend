import { useEffect, useRef, useState } from "react";
import { signOut } from "./api";
import { RichTextEditor } from "./RichTextEditor";
import { ContentPreview } from "./ContentPreview";
import { PublishReview } from "./PublishReview";
import {
  draftStorageKey,
  moveSection,
  parseDraft,
  parseSnapshot,
  replaceCopyField,
  type ContentSnapshot,
  type CopyFields,
  type EditorContent,
} from "./content-editor-state";

class ContentRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
async function request(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, { ...init, credentials: "include" });
  if (response.status === 401)
    throw new ContentRequestError("AUTH_REQUIRED", 401);
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : "Could not load or publish site content";
    throw new ContentRequestError(message, response.status);
  }
  return body;
}
const label = (path: string[]) =>
  path
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
const same = (first: EditorContent, second: EditorContent) =>
  JSON.stringify(first) === JSON.stringify(second);

export function ContentEditor({
  onUnauthenticated,
}: {
  onUnauthenticated: () => void;
}) {
  const [snapshot, setSnapshot] = useState<ContentSnapshot | null>(null);
  const [content, setContent] = useState<EditorContent | null>(null);
  const [revision, setRevision] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [invalidDraft, setInvalidDraft] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [reviewingPublish, setReviewingPublish] = useState(false);
  const skipLeavePrompt = useRef(false);
  const changed = Boolean(
    snapshot && content && !same(snapshot.content, content),
  );
  const stale = Boolean(
    snapshot && !snapshot.pending && revision !== snapshot.revision,
  );

  useEffect(() => {
    let active = true;
    Promise.all([
      request("/api/site-content"),
      request("/api/site-content/images"),
    ])
      .then(([result, assets]) => {
        if (!active) return;
        const fresh = parseSnapshot(result);
        setSnapshot(fresh);
        setContent(fresh.content);
        setRevision(fresh.revision);
        if (
          assets &&
          typeof assets === "object" &&
          "images" in assets &&
          Array.isArray(assets.images) &&
          assets.images.every((item: unknown) => typeof item === "string")
        )
          setImages(assets.images);
        try {
          const raw = localStorage.getItem(draftStorageKey(fresh));
          if (raw) {
            const draft = parseDraft(raw);
            setContent(draft.content);
            setRevision(draft.revision);
            setNotice("Restored your unpublished browser draft.");
          }
        } catch {
          setInvalidDraft(true);
          setStorageError(
            "The browser draft could not be read. Discard it to start from the current page.",
          );
        }
      })
      .catch((reason: unknown) => {
        if (!active) return;
        if (reason instanceof ContentRequestError && reason.status === 401)
          onUnauthenticated();
        else
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load site content",
          );
      });
    return () => {
      active = false;
    };
  }, [onUnauthenticated]);

  useEffect(() => {
    if (!snapshot || !content || invalidDraft) return;
    try {
      if (changed)
        localStorage.setItem(
          draftStorageKey(snapshot),
          JSON.stringify({ content, revision }),
        );
      else localStorage.removeItem(draftStorageKey(snapshot));
      setStorageError("");
    } catch {
      setStorageError(
        "This browser could not save your draft. Keep this page open until you publish it.",
      );
    }
  }, [content, revision, snapshot, changed, invalidDraft]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (changed && !skipLeavePrompt.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changed]);

  const failure = (reason: unknown) => {
    if (reason instanceof ContentRequestError && reason.status === 401)
      onUnauthenticated();
    else
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not publish site content",
      );
  };
  const refresh = async () => {
    setBusy(true);
    try {
      setSnapshot(parseSnapshot(await request("/api/site-content")));
      setReviewed(false);
      setNotice("Loaded the current page. Your browser draft is preserved.");
    } catch (reason) {
      failure(reason);
    } finally {
      setBusy(false);
    }
  };
  const discard = () => {
    if (
      !snapshot ||
      !window.confirm(
        "Discard this browser draft and use the current page content?",
      )
    )
      return;
    setContent(structuredClone(snapshot.content));
    setRevision(snapshot.revision);
    setInvalidDraft(false);
    setError("");
    setNotice("Draft discarded.");
    setReviewed(false);
  };
  const publish = async () => {
    if (!snapshot || !content || stale || invalidDraft) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const fresh = parseSnapshot(
        await request("/api/site-content/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, revision }),
        }),
      );
      setSnapshot(fresh);
      setContent(fresh.content);
      setRevision(fresh.revision);
      setNotice(
        fresh.mode === "local"
          ? "Published to the local site checkout."
          : "Changes pushed to Git. Website deployment runs separately.",
      );
    } catch (reason) {
      failure(reason);
      if (
        reason instanceof ContentRequestError &&
        (reason.status === 409 || reason.status === 502)
      ) {
        try {
          setSnapshot(parseSnapshot(await request("/api/site-content")));
          setReviewed(false);
        } catch {
          /* Keep the draft when the destination is unavailable. */
        }
      }
    } finally {
      setBusy(false);
    }
  };
  const leave = async (logout = false) => {
    if (
      changed &&
      !window.confirm(
        "Leave with unpublished changes? Your draft will stay in this browser.",
      )
    )
      return;
    if (logout) {
      try {
        await signOut();
      } catch (reason) {
        failure(reason);
        return;
      }
    }
    skipLeavePrompt.current = true;
    window.location.assign(logout ? "/login" : "/");
  };
  const copyFields = (fields: CopyFields, path: string[]): React.ReactNode =>
    Object.entries(fields).map(([key, value]) => {
      const nextPath = [...path, key];
      if (typeof value !== "string")
        return (
          <fieldset className="copy-group" key={key}>
            <legend>{label([key])}</legend>
            {copyFields(value, nextPath)}
          </fieldset>
        );
      if (nextPath.join(".") === "member.helpBody")
        return (
          <RichTextEditor
            key={key}
            label={label(nextPath)}
            value={value}
            disabled={busy || invalidDraft || Boolean(snapshot?.pending)}
            onChange={(next) => {
              if (content)
                setContent(replaceCopyField(content, nextPath, next));
            }}
          />
        );
      return (
        <label key={key}>
          {label(nextPath)}
          <textarea
            rows={value.length > 100 ? 3 : 1}
            disabled={busy || invalidDraft || Boolean(snapshot?.pending)}
            value={value}
            onChange={(event) => {
              if (content)
                setContent(
                  replaceCopyField(content, nextPath, event.target.value),
                );
            }}
          />
          {nextPath[0] === "member" &&
            ["heading", "overlayHeading", "overlayPlan"].includes(key) && (
              <small className="muted">
                Allowed variable:{" "}
                {key === "overlayPlan" ? "{plan}" : "{firstName}"}
              </small>
            )}
        </label>
      );
    });

  const copyPanel = ([key, fields]: [string, EditorContent[string]]) => (
    <details className="content-panel" key={key}>
      <summary>{label([key])}</summary>
      <div className="content-copy-fields">
        {!Array.isArray(fields) && copyFields(fields, [key])}
      </div>
    </details>
  );

  return (
    <main className="page-shell content-editor-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Dream Rock Collective</p>
          <h1>Website editor</h1>
          <p>
            Edit the initial registration page. Drafts stay in this browser
            until published.
          </p>
        </div>
        <div className="toolbar content-toolbar">
          <button
            type="button"
            className="secondary"
            onClick={() => void leave()}
          >
            Registrations
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => void leave(true)}
          >
            Sign out
          </button>
        </div>
      </header>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {storageError && (
        <p className="form-error" role="alert">
          {storageError}
        </p>
      )}
      {notice && (
        <p className="content-notice" role="status">
          {notice}
        </p>
      )}
      {!snapshot || !content ? (
        <p role="status">
          {error
            ? "Site content is unavailable. Check the publishing configuration and reload."
            : "Loading site content…"}
        </p>
      ) : (
        <>
          <section className="content-publish" aria-label="Publishing">
            <div>
              <strong>
                {snapshot.mode === "local"
                  ? "Local checkout"
                  : "Remote Git publishing"}
              </strong>
              <p aria-live="polite">
                {changed ? "Unpublished changes" : "No unpublished changes"}
                {!storageError && changed
                  ? " · Draft saved in this browser"
                  : ""}
              </p>
            </div>
            <div className="content-actions">
              <button
                type="button"
                disabled={
                  busy ||
                  stale ||
                  invalidDraft ||
                  (!changed && !snapshot.pending)
                }
                onClick={() => setReviewingPublish(true)}
              >
                {busy
                  ? "Working…"
                  : snapshot.pending
                    ? "Retry push"
                    : "Publish"}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy || (!changed && !invalidDraft)}
                onClick={discard}
              >
                Discard draft
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void refresh()}
              >
                Check for updates
              </button>
            </div>
          </section>
          {snapshot.pending && (
            <p className="content-notice" role="status">
              A previous Git push did not finish. Retry the pending content
              before making further changes.
            </p>
          )}
          {stale && (
            <section
              className="content-conflict"
              aria-label="Review newer content"
            >
              <h2>The site content changed</h2>
              <p>
                Your draft is preserved. Compare it with the current content
                below before applying your draft to the newer revision.
              </p>
              <div className="content-compare">
                <details>
                  <summary>Current site content</summary>
                  <pre>{JSON.stringify(snapshot.content, null, 2)}</pre>
                </details>
                <details>
                  <summary>Your browser draft</summary>
                  <pre>{JSON.stringify(content, null, 2)}</pre>
                </details>
              </div>
              <label className="review-check">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(event) => setReviewed(event.target.checked)}
                />
                I reviewed the newer content and my draft.
              </label>
              <button
                type="button"
                disabled={!reviewed || busy || snapshot.pending}
                onClick={() => {
                  setRevision(snapshot.revision);
                  setReviewed(false);
                  setError("");
                  setNotice(
                    "Your reviewed draft is ready to publish against the current revision.",
                  );
                }}
              >
                Use reviewed draft
              </button>
            </section>
          )}
          <div className="content-editor-layout">
            <div className="content-fields">
              {Object.entries(content)
                .filter(([key]) => key !== "sections" && key !== "footer")
                .map(copyPanel)}
              <section
                className="content-panel"
                aria-labelledby="sections-heading"
              >
                <div className="section-editor-heading">
                  <h2 id="sections-heading">Page sections</h2>
                  <button
                    type="button"
                    disabled={
                      busy ||
                      invalidDraft ||
                      snapshot.pending ||
                      content.sections.length >= 100
                    }
                    onClick={() =>
                      setContent({
                        ...content,
                        sections: [
                          ...content.sections,
                          { title: "New section", body: "<p></p>" },
                        ],
                      })
                    }
                  >
                    Add section
                  </button>
                </div>
                {content.sections.map((section, index) => (
                  <fieldset
                    className="section-editor"
                    key={index}
                    disabled={busy || invalidDraft || snapshot.pending}
                  >
                    <legend>Section {index + 1}</legend>
                    <div className="content-actions">
                      <button
                        type="button"
                        className="secondary"
                        disabled={index === 0}
                        aria-label={`Move section ${index + 1} up`}
                        onClick={() =>
                          setContent({
                            ...content,
                            sections: moveSection(
                              content.sections,
                              index,
                              index - 1,
                            ),
                          })
                        }
                      >
                        Move up
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        disabled={index === content.sections.length - 1}
                        aria-label={`Move section ${index + 1} down`}
                        onClick={() =>
                          setContent({
                            ...content,
                            sections: moveSection(
                              content.sections,
                              index,
                              index + 1,
                            ),
                          })
                        }
                      >
                        Move down
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        aria-label={`Remove section ${index + 1}`}
                        onClick={() => {
                          if (window.confirm(`Remove section ${index + 1}?`))
                            setContent({
                              ...content,
                              sections: content.sections.filter(
                                (_, position) => position !== index,
                              ),
                            });
                        }}
                      >
                        Remove
                      </button>
                    </div>
                    <label>
                      Section {index + 1} title
                      <input
                        value={section.title}
                        maxLength={500}
                        onChange={(event) =>
                          setContent({
                            ...content,
                            sections: content.sections.map((item, position) =>
                              position === index
                                ? { ...item, title: event.target.value }
                                : item,
                            ),
                          })
                        }
                      />
                    </label>
                    <RichTextEditor
                      label={`Section ${index + 1} body`}
                      value={section.body}
                      disabled={busy || invalidDraft || snapshot.pending}
                      onChange={(body) =>
                        setContent({
                          ...content,
                          sections: content.sections.map((item, position) =>
                            position === index ? { ...item, body } : item,
                          ),
                        })
                      }
                    />
                    <label>
                      Section {index + 1} image
                      <select
                        value={section.image?.src ?? ""}
                        onChange={(event) =>
                          setContent({
                            ...content,
                            sections: content.sections.map((item, position) => {
                              if (position !== index) return item;
                              if (event.target.value)
                                return {
                                  ...item,
                                  image: {
                                    src: event.target.value,
                                    alt: item.image?.alt ?? "",
                                  },
                                };
                              const { image: _image, ...withoutImage } = item;
                              return withoutImage;
                            }),
                          })
                        }
                      >
                        <option value="">No image</option>
                        {images.map((src) => (
                          <option key={src} value={src}>
                            {src}
                          </option>
                        ))}
                      </select>
                    </label>
                    {section.image && (
                      <label>
                        Section {index + 1} image alt text
                        <input
                          value={section.image.alt}
                          onChange={(event) =>
                            setContent({
                              ...content,
                              sections: content.sections.map(
                                (item, position) =>
                                  position === index && item.image
                                    ? {
                                        ...item,
                                        image: {
                                          ...item.image,
                                          alt: event.target.value,
                                        },
                                      }
                                    : item,
                              ),
                            })
                          }
                        />
                      </label>
                    )}
                  </fieldset>
                ))}
              </section>
              {Object.entries(content)
                .filter(([key]) => key === "footer")
                .map(copyPanel)}
            </div>
            <ContentPreview
              content={content}
              onUnauthenticated={onUnauthenticated}
            />
          </div>
          {reviewingPublish && (
            <PublishReview
              before={snapshot.content}
              after={content}
              mode={snapshot.mode}
              pending={snapshot.pending}
              onCancel={() => setReviewingPublish(false)}
              onConfirm={() => {
                setReviewingPublish(false);
                void publish();
              }}
            />
          )}
        </>
      )}
    </main>
  );
}
