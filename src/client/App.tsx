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
            <thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Address</th><th>Created</th><th>Actions</th></tr></thead>
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
  const [busy, setBusy] = useState(false);

  if (editing) {
    const save = async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const data: { name?: string; email?: string; address?: string } = {};
      if (name !== registration.name) data.name = name;
      if (email !== registration.email) data.email = email;
      if (address !== registration.address) data.address = address;
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

    return <tr><td colSpan={6}><form className="inline-form" onSubmit={save}>
      <input aria-label="Name" value={name} onChange={(event) => setName(event.target.value)} required />
      <input aria-label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      <input aria-label="Address" value={address} onChange={(event) => setAddress(event.target.value)} required />
      <button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
      <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
    </form></td></tr>;
  }

  return <tr>
    <td>{registration.id}</td>
    <td>{registration.name}</td>
    <td>{registration.email}</td>
    <td>{registration.address}</td>
    <td>{new Date(registration.created_at).toLocaleString()}</td>
    <td className="row-actions"><button type="button" className="link-button" onClick={onEdit}>Edit</button><button type="button" className="link-button danger" onClick={onDelete}>Delete</button></td>
  </tr>;
};
