import type { Registration } from "./types";

const jsonHeaders = { "Content-Type": "application/json" };

export const signIn = async (email: string, password: string): Promise<void> => {
  const response = await fetch("/auth/sign-in/email", {
    method: "POST",
    headers: jsonHeaders,
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error("Invalid email or password");
  }
};

export const signOut = async (): Promise<void> => {
  await fetch("/auth/sign-out", {
    method: "POST",
    credentials: "include",
  });
};

export const fetchRegistrations = async (): Promise<Registration[]> => {
  const response = await fetch("/registrations", { credentials: "include" });

  if (response.status === 401) {
    throw new Error("AUTH_REQUIRED");
  }

  if (!response.ok) {
    throw new Error("Could not load registrations");
  }

  const body = (await response.json()) as { registrations: Registration[] };
  return body.registrations;
};

export const modifyRegistration = async (
  request:
    | { type: "delete"; id: number }
    | { type: "edit"; id: number; data: {
        name?: string;
        email?: string;
        address?: string;
        birthday?: string | null;
        notes?: string | null;
        allocation?: Record<string, number>;
      } },
): Promise<Registration> => {
  const response = await fetch("/modify-registration", {
    method: "POST",
    headers: jsonHeaders,
    credentials: "include",
    body: JSON.stringify({ ...request, id: String(request.id) }),
  });

  if (response.status === 401) {
    throw new Error("AUTH_REQUIRED");
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Could not modify registration");
  }

  return (await response.json()) as Registration;
};
