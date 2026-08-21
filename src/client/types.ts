export type Registration = {
  id: number;
  name: string;
  email: string;
  address: string;
  stripe_payment_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: "once" | "monthly" | "yearly" | null;
  payment_status: "pending" | "paid" | "failed";
  created_at: string;
  deleted: boolean;
};
