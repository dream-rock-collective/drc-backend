import { useEffect, useMemo, useState } from "react";
import { fetchRegistrations, modifyRegistration, signIn, signOut } from "./api";
import type { Registration } from "./types";

const cacheKey = "dreamrock:registrations";
const backupTimestampKey = "dreamrock:registrations:last-backup";

const readCache = (): Registration[] => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(cacheKey) ?? "null");
    return Array.isArray(value) ? (value as Registration[]) : [];
  } catch {
    return [];
  }
};

const readBackupTimestamp = (): string | null => {
  try {
    return localStorage.getItem(backupTimestampKey);
  } catch {
    return null;
  }
};

const saveCache = (registrations: Registration[]): string | null => {
  const savedAt = new Date().toISOString();
  try {
    localStorage.setItem(cacheKey, JSON.stringify(registrations));
    localStorage.setItem(backupTimestampKey, savedAt);
    return savedAt;
  } catch {
    return null;
  }
};

const redirectToLogin = (): void => {
  window.history.replaceState({}, "", "/login");
  window.dispatchEvent(new PopStateEvent("popstate"));
};

const planLabel = (plan: Registration["plan"]): string => {
  if (plan === "once") return "One-time";
  if (plan === "monthly") return "Monthly";
  if (plan === "yearly") return "Yearly";
  return "—";
};

const formatBackupTimestamp = (value: string | null): string => {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Never" : date.toLocaleString();
};

const csvValue = (value: unknown): string => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const allocationCsvValue = (
  allocation: Record<string, number> | null,
): string => {
  if (!allocation) return "";
  return Object.entries(allocation)
    .map(([charity, amount]) => `${charity}: $${amount}`)
    .join("; ");
};

const exportColumns: Array<keyof Registration> = [
  "id",
  "name",
  "email",
  "address",
  "birthday",
  "notes",
  "stripe_payment_intent_id",
  "stripe_customer_id",
  "stripe_subscription_id",
  "plan",
  "payment_status",
  "latest_allocation",
  "created_at",
  "deleted",
];

const paymentIdentifier = (value: string | null) => (
  value ? <code className="payment-id" title={value}>{value}</code> : <span className="muted">—</span>
);

const notesView = (notes: string | null) => (
  notes ? <span>{notes}</span> : <span className="muted">—</span>
);

const allocationView = (allocation: Record<string, number> | null) => {
  if (!allocation) return <span className="muted">—</span>;
  return (
    <div className="allocation-list">
      {Object.entries(allocation).map(([charity, amount]) => (
        <div className="allocation-item" key={charity}>
          <span title={charity}>{charity}</span>
          <strong>${amount}</strong>
        </div>
      ))}
    </div>
  );
};

const detailValue = (value: React.ReactNode, className?: string) => (
  <dd className={className}>{value || <span className="muted">—</span>}</dd>
);

export const App = () => {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  if (path === "/login") {
    return <LoginPage />;
  }

  return <Dashboard onUnauthenticated={redirectToLogin} />;
};

const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      await signIn(email, password);
      window.history.replaceState({}, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Dream Rock Collective</p>
        <h1>Admin sign in</h1>
        <p className="muted">Sign in to manage registrations.</p>
        <form onSubmit={submit} className="stack-form">
          <label>
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
      </section>
    </main>
  );
};

const Dashboard = ({ onUnauthenticated }: { onUnauthenticated: () => void }) => {
  const [registrations, setRegistrations] = useState<Registration[]>(readCache);
  const [lastBackup, setLastBackup] = useState<string | null>(readBackupTimestamp);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    fetchRegistrations()
      .then((fresh) => {
        if (!active) return;
        setRegistrations(fresh);
        const savedAt = saveCache(fresh);
        if (savedAt) setLastBackup(savedAt);
      })
      .catch((reason) => {
        if (!active) return;
        if (reason instanceof Error && reason.message === "AUTH_REQUIRED") {
          onUnauthenticated();
        } else {
          setError(reason instanceof Error ? reason.message : "Could not load registrations");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [onUnauthenticated]);

  const visibleRegistrations = useMemo(
    () => registrations.filter((registration) => !registration.deleted),
    [registrations],
  );

  const analytics = useMemo(() => visibleRegistrations.reduce(
    (counts, registration) => {
      if (registration.plan === "monthly") counts.monthly += 1;
      else if (registration.plan === "once") counts.once += 1;
      else if (registration.plan === "yearly") counts.yearly += 1;
      else counts.newsletter += 1;
      return counts;
    },
    { monthly: 0, once: 0, yearly: 0, newsletter: 0 },
  ), [visibleRegistrations]);

  const patchRegistration = (updated: Registration): void => {
    const next = registrations.map((registration) => registration.id === updated.id ? updated : registration);
    setRegistrations(next);
    const savedAt = saveCache(next);
    if (savedAt) setLastBackup(savedAt);
  };

  const exportData = (): void => {
    const blob = new Blob([JSON.stringify(registrations, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "dreamrock-registrations.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportCsv = (): void => {
    const rows = [
      exportColumns,
      ...registrations.map((registration) => exportColumns.map((column) => {
        if (column === "latest_allocation") return allocationCsvValue(registration.latest_allocation);
        return registration[column];
      })),
    ];
    const csv = rows.map((row) => row.map(csvValue).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "dreamrock-registrations.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const deleteRegistration = async (registration: Registration): Promise<void> => {
    if (!window.confirm(`Delete registration #${registration.id}?`)) return;
    try {
      patchRegistration(await modifyRegistration({ type: "delete", id: registration.id }));
    } catch (reason) {
      if (reason instanceof Error && reason.message === "AUTH_REQUIRED") onUnauthenticated();
      else setError(reason instanceof Error ? reason.message : "Could not delete registration");
    }
  };

  return (
    <main className="page-shell">
      <div className="admin-clouds" aria-hidden="true">
        <img className="admin-cloud admin-cloud-a" src="/cloud.png" alt="" />
        <img className="admin-cloud admin-cloud-b" src="/cloud.png" alt="" />
        <img className="admin-cloud admin-cloud-c" src="/cloud.png" alt="" />
        <img className="admin-cloud admin-cloud-d" src="/cloud.png" alt="" />
        <img className="admin-cloud admin-cloud-e" src="/cloud.png" alt="" />
        <img className="admin-cloud admin-cloud-f" src="/cloud.png" alt="" />
      </div>
      <p className="backup-status">Last local backup: {formatBackupTimestamp(lastBackup)}</p>
      <header className="page-header">
        <div>
          <p className="eyebrow">Dream Rock Collective</p>
          <div className="page-title-row">
            <img className="admin-mark" src="/rock.png" alt="" />
            <h1>Registrations</h1>
          </div>
        </div>
        <div className="toolbar">
          <button type="button" className="secondary" onClick={exportData}>Export JSON</button>
          <button type="button" className="secondary" onClick={exportCsv}>Export CSV</button>
          <button type="button" className="secondary" onClick={async () => { await signOut(); redirectToLogin(); }}>Sign out</button>
        </div>
      </header>
      {error && <p className="form-error" role="alert">{error}</p>}
      <section className="analytics" aria-label="Registration analytics">
        <AnalyticsCard label="Monthly" value={analytics.monthly} />
        <AnalyticsCard label="One-time" value={analytics.once} />
        <AnalyticsCard label="Yearly" value={analytics.yearly} />
        <AnalyticsCard label="Newsletter / no payment" value={analytics.newsletter} />
      </section>
      {loading && registrations.length === 0 ? <p className="muted">Loading registrations…</p> : (
        <section className="table-card desktop-registrations">
          <table>
            <thead><tr>
              <th>ID</th><th>Name</th><th>Email</th><th>Address</th><th>Birthday</th><th>Created</th>
              <th>Payment status</th><th>Plan</th><th>Payment intent ID</th><th>Customer ID</th>
              <th>Subscription ID</th><th>Allotments</th><th>Notes</th><th>Actions</th>
            </tr></thead>
            <tbody>
              {visibleRegistrations.map((registration) => (
                <RegistrationRow
                  key={registration.id}
                  registration={registration}
                  editing={editingId === registration.id}
                  onEdit={() => setEditingId(registration.id)}
                  onCancel={() => setEditingId(null)}
                  onSaved={(updated) => { patchRegistration(updated); setEditingId(null); }}
                  onDelete={() => void deleteRegistration(registration)}
                  onError={setError}
                />
              ))}
            </tbody>
          </table>
          {visibleRegistrations.length === 0 && <p className="empty-state">No active registrations.</p>}
        </section>
      )}
      {(!loading || registrations.length > 0) && <section className="mobile-registrations" aria-label="Registrations">
        {visibleRegistrations.map((registration) => (
          <RegistrationCard
            key={registration.id}
            registration={registration}
            editing={editingId === registration.id}
            onEdit={() => setEditingId(registration.id)}
            onCancel={() => setEditingId(null)}
            onSaved={(updated) => { patchRegistration(updated); setEditingId(null); }}
            onDelete={() => void deleteRegistration(registration)}
            onError={setError}
          />
        ))}
        {visibleRegistrations.length === 0 && <p className="empty-state">No active registrations.</p>}
      </section>}
    </main>
  );
};

const AnalyticsCard = ({ label, value }: { label: string; value: number }) => (
  <article className="analytics-card">
    <strong>{label}</strong>
    <span>{value}</span>
    <small>registrations</small>
  </article>
);

const RegistrationRow = ({ registration, editing, onEdit, onCancel, onSaved, onDelete, onError }: {
  registration: Registration;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSaved: (registration: Registration) => void;
  onDelete: () => void;
  onError: (message: string) => void;
}) => {
  return <tr>
    {editing ? <td colSpan={14}><RegistrationEditor
      registration={registration}
      onCancel={onCancel}
      onSaved={onSaved}
      onError={onError}
    /></td> : <>
      <td className="monospace">{registration.id}</td>
      <td>{registration.name}</td>
      <td>{registration.email}</td>
      <td>{registration.address || <span className="muted">—</span>}</td>
      <td>{registration.birthday || <span className="muted">—</span>}</td>
      <td className="monospace">{new Date(registration.created_at).toLocaleString()}</td>
      <td><span className={`payment-status payment-status-${registration.payment_status}`}>
        {registration.payment_status}
      </span></td>
      <td>{planLabel(registration.plan)}</td>
      <td>{paymentIdentifier(registration.stripe_payment_intent_id)}</td>
      <td>{paymentIdentifier(registration.stripe_customer_id)}</td>
      <td>{paymentIdentifier(registration.stripe_subscription_id)}</td>
      <td className="allocation-cell">{allocationView(registration.latest_allocation)}</td>
      <td className="notes-cell">{notesView(registration.notes)}</td>
      <td className="row-actions"><button type="button" className="link-button" onClick={onEdit}>Edit</button><button type="button" className="link-button danger" onClick={onDelete}>Delete</button></td>
    </>}
  </tr>;
};

const RegistrationEditor = ({ registration, onCancel, onSaved, onError }: {
  registration: Registration;
  onCancel: () => void;
  onSaved: (registration: Registration) => void;
  onError: (message: string) => void;
}) => {
  const [name, setName] = useState(registration.name);
  const [email, setEmail] = useState(registration.email);
  const [address, setAddress] = useState(registration.address ?? "");
  const [birthday, setBirthday] = useState(registration.birthday ?? "");
  const [notes, setNotes] = useState(registration.notes ?? "");
  const [allocationText, setAllocationText] = useState(
    registration.latest_allocation ? JSON.stringify(registration.latest_allocation) : "",
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(registration.name);
    setEmail(registration.email);
    setAddress(registration.address ?? "");
    setBirthday(registration.birthday ?? "");
    setNotes(registration.notes ?? "");
    setAllocationText(registration.latest_allocation ? JSON.stringify(registration.latest_allocation) : "");
  }, [registration]);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data: {
      name?: string; email?: string; address?: string; birthday?: string | null;
      notes?: string | null; allocation?: Record<string, number>;
    } = {};
    if (name !== registration.name) data.name = name;
    if (email !== registration.email) data.email = email;
    if (address !== registration.address) data.address = address;
    if (birthday !== (registration.birthday ?? "")) data.birthday = birthday || null;
    if (notes !== (registration.notes ?? "")) data.notes = notes || null;
    if (allocationText !== (registration.latest_allocation ? JSON.stringify(registration.latest_allocation) : "")) {
      try {
        const parsed: unknown = JSON.parse(allocationText);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
        data.allocation = parsed as Record<string, number>;
      } catch {
        onError("Allotments must be a valid JSON object");
        return;
      }
    }
    if (Object.keys(data).length === 0) return onCancel();
    setBusy(true);
    try {
      onSaved(await modifyRegistration({ type: "edit", id: registration.id, data }));
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "Could not edit registration");
    } finally {
      setBusy(false);
    }
  };

  return <form className="registration-editor" onSubmit={save}>
    <div className="editor-fields">
      <label>Name<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
      <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      <label>Address<input value={address} onChange={(event) => setAddress(event.target.value)} /></label>
      <label>Birthday<input value={birthday} onChange={(event) => setBirthday(event.target.value)} /></label>
      <label className="editor-wide">Allotments JSON<textarea value={allocationText} onChange={(event) => setAllocationText(event.target.value)} placeholder="{ &quot;charityKey&quot;: 1 }" /></label>
      <label className="editor-wide">Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add an internal note" maxLength={5000} /></label>
    </div>
    <div className="editor-actions">
      <button type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
      <button type="button" className="secondary" onClick={onCancel} disabled={busy}>Cancel</button>
    </div>
  </form>;
};

const RegistrationCard = ({ registration, editing, onEdit, onCancel, onSaved, onDelete, onError }: {
  registration: Registration;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSaved: (registration: Registration) => void;
  onDelete: () => void;
  onError: (message: string) => void;
}) => {
  return <article className="registration-card">
    <div className="registration-card-header">
      <div>
        <p className="card-id">Registration #{registration.id}</p>
        <h2>{registration.name}</h2>
        <a href={`mailto:${registration.email}`}>{registration.email}</a>
      </div>
      <span className={`payment-status payment-status-${registration.payment_status}`}>
        {registration.payment_status}
      </span>
    </div>
    <div className="card-summary">
      <span><strong>Plan</strong>{planLabel(registration.plan)}</span>
      <span><strong>Birthday</strong>{registration.birthday || <span className="muted">—</span>}</span>
    </div>
    <div className="row-actions card-actions">
      <button type="button" className="link-button" onClick={onEdit}>Edit</button>
      <button type="button" className="link-button danger" onClick={onDelete}>Delete</button>
    </div>
    <details className="registration-details">
      <summary>View registration details</summary>
      <dl>
        <dt>Address</dt>{detailValue(registration.address)}
        <dt>Created</dt>{detailValue(new Date(registration.created_at).toLocaleString(), "monospace")}
        <dt>Payment intent ID</dt>{detailValue(paymentIdentifier(registration.stripe_payment_intent_id))}
        <dt>Customer ID</dt>{detailValue(paymentIdentifier(registration.stripe_customer_id))}
        <dt>Subscription ID</dt>{detailValue(paymentIdentifier(registration.stripe_subscription_id))}
        <dt>Allotments</dt>{detailValue(allocationView(registration.latest_allocation))}
        <dt>Notes</dt>{detailValue(notesView(registration.notes))}
      </dl>
    </details>
    {editing && <div className="mobile-editor"><RegistrationEditor
      registration={registration}
      onCancel={onCancel}
      onSaved={onSaved}
      onError={onError}
    /></div>}
  </article>;
};
