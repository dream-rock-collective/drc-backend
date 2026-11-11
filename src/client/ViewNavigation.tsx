export function ViewNavigation({
  active,
  onLeaveEditor,
}: {
  active: "registrations" | "editor";
  onLeaveEditor?: () => void;
}) {
  return (
    <nav className="view-navigation" aria-label="Admin views">
      {[
        { key: "registrations", label: "Registrations", href: "/" },
        { key: "editor", label: "Editor", href: "/editor" },
      ].map(({ key, label, href }) => (
        <a
          key={key}
          href={href}
          aria-current={active === key ? "page" : undefined}
          onClick={(event) => {
            if (active === "editor" && onLeaveEditor) {
              event.preventDefault();
              if (key !== active) onLeaveEditor();
            }
          }}
        >
          {active === key ? <h1>{label}</h1> : label}
        </a>
      ))}
    </nav>
  );
}
