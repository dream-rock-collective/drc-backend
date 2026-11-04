import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { EditorContent } from "./content-editor-state";

type PreviewDestination = { url: string; token: string };
export function parsePreviewDestination(
  value: unknown,
  origin: string,
): PreviewDestination {
  if (
    !value ||
    typeof value !== "object" ||
    !("url" in value) ||
    typeof value.url !== "string" ||
    !("token" in value) ||
    typeof value.token !== "string" ||
    !value.token
  )
    throw new Error("Invalid preview response");
  const url = new URL(value.url, origin);
  if (url.origin !== origin)
    throw new Error("Preview must be served by this backend");
  return { url: url.href, token: value.token };
}
export function isPreviewMessage(
  data: unknown,
  token: string,
): data is {
  type: "drc-preview-ready" | "drc-preview-rendered";
  token: string;
  error?: string;
} {
  return (
    data !== null &&
    typeof data === "object" &&
    "token" in data &&
    data.token === token &&
    "type" in data &&
    (data.type === "drc-preview-ready" ||
      data.type === "drc-preview-rendered") &&
    (!("error" in data) || typeof data.error === "string")
  );
}

export function ContentPreview({
  content,
  onUnauthenticated,
}: {
  content: EditorContent;
  onUnauthenticated: () => void;
}) {
  const [destination, setDestination] = useState<PreviewDestination | null>(
    null,
  );
  const [attempt, setAttempt] = useState(0);
  const [width, setWidth] = useState<"desktop" | "mobile">("desktop");
  const [loading, setLoading] = useState(true);
  const [buildError, setBuildError] = useState("");
  const [renderError, setRenderError] = useState("");
  const frame = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);
  const latestContent = useRef(content);
  latestContent.current = content;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    ready.current = false;
    setDestination(null);
    setLoading(true);
    setBuildError("");
    setRenderError("");
    fetch("/api/site-preview", {
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 401) {
          if (active) onUnauthenticated();
          return;
        }
        const body: unknown = await response.json();
        if (!response.ok) {
          const error =
            body &&
            typeof body === "object" &&
            "error" in body &&
            typeof body.error === "string"
              ? body.error
              : "Could not build the site preview";
          throw new Error(error);
        }
        if (active)
          setDestination(parsePreviewDestination(body, window.location.origin));
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setBuildError(
          reason instanceof Error
            ? reason.message
            : "Could not load the preview",
        );
        setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt, onUnauthenticated]);

  useLayoutEffect(() => {
    if (!destination) return;
    const timeout = window.setTimeout(() => {
      if (!ready.current) {
        setBuildError(
          "The preview did not start. Retry the preview to rebuild and reload it.",
        );
        setLoading(false);
      }
    }, 30_000);
    const receive = (event: MessageEvent<unknown>) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.origin !== "null" ||
        !isPreviewMessage(event.data, destination.token)
      )
        return;
      if (event.data.type === "drc-preview-ready") {
        ready.current = true;
        clearTimeout(timeout);
        frame.current?.contentWindow?.postMessage(
          {
            type: "drc-preview-content",
            token: destination.token,
            content: latestContent.current,
          },
          "*",
        );
      } else {
        setLoading(false);
        setRenderError(event.data.error ?? "");
      }
    };
    window.addEventListener("message", receive);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("message", receive);
    };
  }, [destination]);

  useEffect(() => {
    if (destination && ready.current)
      frame.current?.contentWindow?.postMessage(
        { type: "drc-preview-content", token: destination.token, content },
        "*",
      );
  }, [content, destination]);

  return (
    <aside className="content-preview" aria-labelledby="preview-heading">
      <div className="preview-heading">
        <h2 id="preview-heading">Live preview</h2>
        {buildError && (
          <button
            type="button"
            className="secondary"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry preview
          </button>
        )}
      </div>
      <p className="muted">
        Changes appear here before publishing. Registration and navigation are
        disabled.
      </p>
      <div className="preview-width" role="group" aria-label="Preview width">
        <button
          type="button"
          className="secondary"
          aria-pressed={width === "desktop"}
          onClick={() => setWidth("desktop")}
        >
          Desktop
        </button>
        <button
          type="button"
          className="secondary"
          aria-pressed={width === "mobile"}
          onClick={() => setWidth("mobile")}
        >
          Mobile
        </button>
      </div>
      {loading && <p role="status">Preparing the site preview…</p>}
      {buildError && (
        <p className="form-error" role="alert">
          {buildError}
        </p>
      )}
      {renderError && (
        <p className="form-error" role="alert">
          {renderError} The last valid preview is preserved.
        </p>
      )}
      <div className={`preview-viewport preview-${width}`}>
        {destination && (
          <iframe
            key={destination.token}
            ref={frame}
            title="Registration page preview"
            src={destination.url}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
          />
        )}
      </div>
    </aside>
  );
}
