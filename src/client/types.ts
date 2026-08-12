export type Registration = {
  id: number;
  name: string;
  email: string;
  address: string;
  stripe_payment_id: string | null;
  created_at: string;
  deleted: boolean;
};
