import { useEffect, useMemo, useState } from "react";
import { fetchRegistrations, modifyRegistration, signIn, signOut } from "./api";
import type { Registration } from "./types";

const cacheKey = "dreamrock:registrations";

const readCache = (): Registration[] => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(cacheKey) ?? "null");
    return Array.isArray(value) ? (value as Registration[]) : [];
  } catch {
    return [];
  }
};

const saveCache = (registrations: Registration[]): void => {
  localStorage.setItem(cacheKey, JSON.stringify(registrations));
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    fetchRegistrations()
      .then((fresh) => {
        if (!active) return;
        setRegistrations(fresh);
        saveCache(fresh);
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

  const patchRegistration = (updated: Registration): void => {
    setRegistrations((current) => {
      const next = current.map((registration) => registration.id === updated.id ? updated : registration);
      saveCache(next);
      return next;
    });
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
      <header className="page-header">
        <div>
          <p className="eyebrow">Dream Rock Collective</p>
          <h1>Registrations</h1>
        </div>
        <div className="toolbar">
          <button type="button" className="secondary" onClick={exportData}>Export JSON</button>
          <button type="button" className="secondary" onClick={async () => { await signOut(); redirectToLogin(); }}>Sign out</button>
        </div>
      </header>
      {error && <p className="form-error" role="alert">{error}</p>}
      {loading && registrations.length === 0 ? <p className="muted">Loading registrations…</p> : (
        <section className="table-card">
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
    </main>
  );
};

const RegistrationRow = ({ registration, editing, onEdit, onCancel, onSaved, onDelete, onError }: {
  registration: Registration;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSaved: (registration: Registration) => void;
  onDelete: () => void;
  onError: (message: string) => void;
}) => {
  const [name, setName] = useState(registration.name);
  const [email, setEmail] = useState(registration.email);
  const [address, setAddress] = useState(registration.address);
  const [birthday, setBirthday] = useState(registration.birthday ?? "");
  const [notes, setNotes] = useState(registration.notes ?? "");
  const [allocationText, setAllocationText] = useState(
    registration.latest_allocation ? JSON.stringify(registration.latest_allocation) : "",
  );
  const [busy, setBusy] = useState(false);

  if (editing) {
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

    return <tr><td colSpan={14}><form className="inline-form" onSubmit={save}>
      <input aria-label="Name" value={name} onChange={(event) => setName(event.target.value)} required />
      <input aria-label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      <input aria-label="Address" value={address} onChange={(event) => setAddress(event.target.value)} required />
      <input aria-label="Birthday" value={birthday} onChange={(event) => setBirthday(event.target.value)} />
      <textarea aria-label="Allotments JSON" value={allocationText} onChange={(event) => setAllocationText(event.target.value)} placeholder="{ &quot;charityKey&quot;: 1 }" />
      <textarea aria-label="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add an internal note" maxLength={5000} />
      <button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
      <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
    </form></td></tr>;
  }

  return <tr>
    <td>{registration.id}</td>
    <td>{registration.name}</td>
    <td>{registration.email}</td>
    <td>{registration.address}</td>
    <td>{registration.birthday || <span className="muted">—</span>}</td>
    <td>{new Date(registration.created_at).toLocaleString()}</td>
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
  </tr>;
};
