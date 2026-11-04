import type { Registration } from "./types";

export const exportPlans = [
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "once", label: "One-time" },
  { value: null, label: "No payment" },
] as const;

export const exportColumns = [
  { value: "id", label: "ID" },
  { value: "name", label: "Name" },
  { value: "email", label: "Email" },
  { value: "address", label: "Address" },
  { value: "birthday", label: "Birthday" },
  { value: "created_at", label: "Created" },
  { value: "payment_status", label: "Payment status" },
  { value: "plan", label: "Plan" },
  { value: "stripe_payment_intent_id", label: "Payment intent ID" },
  { value: "stripe_customer_id", label: "Customer ID" },
  { value: "stripe_subscription_id", label: "Subscription ID" },
  { value: "latest_allocation", label: "Allotments" },
  { value: "notes", label: "Notes" },
] as const;

export type ExportSelection = {
  plans: Registration["plan"][];
  columns: Array<typeof exportColumns[number]["value"]>;
};

export const defaultExportSelection = (): ExportSelection => ({
  plans: exportPlans.map(({ value }) => value),
  columns: exportColumns.map(({ value }) => value),
});

export const parseExportSelection = (stored: string | null): ExportSelection => {
  try {
    const parsed: unknown = JSON.parse(stored ?? "null");
    if (!parsed || typeof parsed !== "object" || !("plans" in parsed) || !("columns" in parsed)) {
      return defaultExportSelection();
    }
    const { plans, columns } = parsed;
    if (!Array.isArray(plans) || !Array.isArray(columns)
      || !plans.length || !columns.length
      || !plans.every((plan: unknown) => exportPlans.some(({ value }) => value === plan))
      || !columns.every((column: unknown) => exportColumns.some(({ value }) => value === column))) {
      return defaultExportSelection();
    }
    return {
      plans: exportPlans.filter(({ value }) => plans.includes(value)).map(({ value }) => value),
      columns: exportColumns.filter(({ value }) => columns.includes(value)).map(({ value }) => value),
    };
  } catch {
    return defaultExportSelection();
  }
};

export const filterExportRegistrations = (
  registrations: Registration[], selection: ExportSelection,
): Registration[] => registrations.filter((registration) =>
  !registration.deleted && selection.plans.includes(registration.plan));

const csvValue = (value: Registration[typeof exportColumns[number]["value"]]): string => {
  const text = value === null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export const registrationsCsv = (registrations: Registration[], selection: ExportSelection): string => {
  const columns = exportColumns.filter(({ value }) => selection.columns.includes(value));
  return [
    columns.map(({ label }) => label),
    ...registrations.map((registration) => columns.map(({ value }) => registration[value])),
  ].map((row) => row.map(csvValue).join(",")).join("\r\n");
};
