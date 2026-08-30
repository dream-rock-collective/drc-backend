export type Registration = {
  id: number;
  name: string;
  email: string;
  address: string | null;
  birthday: string | null;
  notes: string | null;
  stripe_payment_intent_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: "once" | "monthly" | "yearly" | null;
  payment_status: "pending" | "paid" | "failed";
  latest_allocation: Record<string, number> | null;
  created_at: string;
  deleted: boolean;
};
