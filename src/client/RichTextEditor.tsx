import { useEffect, useId, useRef } from "react";

const escape = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
export function safeLink(value: string): boolean {
  return !/[\u0000-\u0020\u007f\\]/.test(value) && /^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(value);
}
export function normalizeRichText(html: string): string {
  const body = new DOMParser().parseFromString(html, "text/html").body;
  const render = (node: Node, parent = ""): string => {
    if (node.nodeType === Node.TEXT_NODE) return escape(node.textContent ?? "");
    if (!(node instanceof Element)) return "";
    let tag = node.tagName.toLowerCase();
    if (["script", "style", "iframe", "object", "svg", "math"].includes(tag)) return "";
    if (tag === "b") tag = "strong";
    if (tag === "i") tag = "em";
    if (tag === "div") tag = "p";
    const inlineParent = ["strong", "em", "a", "p"].includes(parent);
    if (tag === "p" && [...node.children].some((child) => ["DIV", "P", "UL", "OL"].includes(child.tagName))) tag = "";
    if (tag === "li" && parent !== "ul" && parent !== "ol") tag = "p";
    const children = [...node.childNodes].map((child) => render(child, tag || parent)).join("");
    if (tag === "a") {
      const href = node.getAttribute("href") ?? "";
      return parent !== "a" && safeLink(href) ? `<a href="${escape(href)}">${children}</a>` : children;
    }
    if (tag === "br") return "<br>";
    if (["p", "ul", "ol", "li"].includes(tag) && inlineParent) return children + "<br>";
    if (tag === "ul" || tag === "ol") {
      const items = [...node.childNodes].filter((child) => child instanceof Element || child.textContent?.trim()).map((child) => {
        const rendered = render(child, tag);
        return child instanceof Element && child.tagName === "LI" ? rendered : `<li>${rendered}</li>`;
      }).join("");
      return `<${tag}>${items}</${tag}>`;
    }
    if (["p", "li", "strong", "em"].includes(tag)) return `<${tag}>${children}</${tag}>`;
    return children;
  };
  return [...body.childNodes].map((node) => render(node)).join("");
}

export function RichTextEditor({ label, value, onChange, disabled = false }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const id = useId();
  const editor = useRef<HTMLDivElement>(null);
  const emitted = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (editor.current && value !== emitted.current) editor.current.innerHTML = normalizeRichText(value);
  }, [value]);
  const update = () => {
    if (!editor.current) return;
    const html = normalizeRichText(editor.current.innerHTML);
    emitted.current = html;
    onChange(html);
  };
  const command = (name: string, argument?: string) => {
    editor.current?.focus();
    document.execCommand(name, false, argument);
    update();
  };
  return <div className="rich-editor">
    <span id={`${id}-label`} className="field-label">{label}</span>
    <div className="rich-toolbar" role="group" aria-label={`${label} formatting`}>
      {[["Bold", "bold"], ["Italic", "italic"], ["Bullets", "insertUnorderedList"], ["Numbered list", "insertOrderedList"], ["Paragraph", "formatBlock"]].map(([text, action]) =>
        <button key={action} type="button" className="secondary" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => command(action ?? "", action === "formatBlock" ? "p" : undefined)}>{text}</button>)}
      <button type="button" className="secondary" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => {
        const href = window.prompt("Link URL (https://, mailto:, /path, or #fragment)");
        if (href === null) return;
        if (!safeLink(href)) { window.alert("Enter an HTTP, mailto, relative-path, or fragment link."); return; }
        command("createLink", href);
      }}>Link</button>
      <button type="button" className="secondary" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => command("unlink")}>Remove link</button>
    </div>
    <div ref={editor} className="rich-input" role="textbox" aria-multiline="true" aria-labelledby={`${id}-label`} contentEditable={!disabled} suppressContentEditableWarning onInput={update} onPaste={(event) => {
      event.preventDefault();
      command("insertText", event.clipboardData.getData("text/plain"));
    }} onDrop={(event) => event.preventDefault()} />
  </div>;
}
