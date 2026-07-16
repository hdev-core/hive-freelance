/** Row types and unions matching packages/db migrations (docs schema 02). */

export type UserRole = "client" | "freelancer" | "both";
export type AuthType = "keychain" | "google" | "claimed";
export type JobStatus = "open" | "in_progress" | "completed";
export type ProposalStatus = "pending" | "accepted" | "rejected";
export type ContractStatus = "active" | "completed" | "cancelled";
export type MilestoneStatus =
  | "pending"
  | "funded"
  | "submitted"
  | "approved"
  | "released";
export type PaymentCurrency = "HIVE" | "HBD";
export type PaymentStatus =
  | "pending"
  | "awaiting_ratification"
  | "escrowed"
  | "released"
  | "refunded"
  | "disputed";
export type DisputeStatus = "open" | "resolved";
export type ResolutionDirection = "to_client" | "to_freelancer";
export type OAuthProvider = "google";

export type UserRow = {
  id: string;
  hive_username: string;
  email: string | null;
  role: UserRole;
  auth_type: AuthType;
  kms_key_ref: string | null;
  created_at: Date;
  updated_at: Date;
};

export type ProfileRow = {
  id: string;
  user_id: string;
  bio: string | null;
  avatar_url: string | null;
  location: string | null;
  hourly_rate: string | null;
  skills: string[] | null;
  created_at: Date;
  updated_at: Date;
};

export type JobRow = {
  id: string;
  client_id: string;
  title: string;
  description: string;
  budget: string;
  category: string | null;
  skills_required: string[] | null;
  status: JobStatus;
  created_at: Date;
  updated_at: Date;
};

export type ProposalRow = {
  id: string;
  job_id: string;
  freelancer_id: string;
  cover_letter: string;
  bid_amount: string;
  status: ProposalStatus;
  hive_tx_id: string | null;
  created_at: Date;
  updated_at: Date;
};

export type ContractRow = {
  id: string;
  job_id: string;
  proposal_id: string;
  client_id: string;
  freelancer_id: string;
  total_amount: string;
  status: ContractStatus;
  completed_by_client: boolean;
  completed_by_freelancer: boolean;
  hive_tx_id: string | null;
  start_date: Date | null;
  end_date: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type MilestoneRow = {
  id: string;
  contract_id: string;
  title: string;
  description: string | null;
  amount: string;
  milestone_order: number;
  status: MilestoneStatus;
  submitted_at: Date | null;
  approved_at: Date | null;
  hive_tx_id: string | null;
  created_at: Date;
  updated_at: Date;
};

export type PaymentRow = {
  id: string;
  contract_id: string;
  milestone_id: string;
  amount: string;
  currency: PaymentCurrency;
  status: PaymentStatus;
  escrow_id: number | null;
  hive_tx_id: string | null;
  created_at: Date;
  updated_at: Date;
};

export type DisputeRow = {
  id: string;
  contract_id: string;
  milestone_id: string;
  raised_by: string;
  reason: string;
  status: DisputeStatus;
  resolution_direction: ResolutionDirection | null;
  resolved_by: string | null;
  resolution_notes: string | null;
  escrow_dispute_tx_id: string | null;
  escrow_release_tx_id: string | null;
  created_at: Date;
  resolved_at: Date | null;
};

export type ReviewRow = {
  id: string;
  contract_id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  comment: string | null;
  hive_tx_id: string | null;
  created_at: Date;
};

export type HiveRecordRow = {
  id: string;
  hive_tx_id: string;
  app_id: string;
  operation_type: string;
  from_account: string | null;
  to_account: string | null;
  escrow_id: number | null;
  payload: unknown;
  block_number: string | null;
  block_timestamp: Date | null;
  confirmed: boolean;
  created_at: Date;
  updated_at: Date;
};

export type OAuthAccountRow = {
  id: string;
  user_id: string;
  provider: OAuthProvider;
  provider_user_id: string;
  created_at: Date;
};

export type ListenerStateRow = {
  id: string;
  last_processed_block: string;
  updated_at: Date;
};
