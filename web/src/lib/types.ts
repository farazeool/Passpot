// Shapes returned by the Rota contract's view methods.

export type PayoutMode = "Draw" | "Order" | "Bid";
export type Status = "Open" | "Running" | "Finished";

export type EventKind =
  | "Created"
  | "Joined"
  | "Started"
  | "Contributed"
  | "Bid"
  | "Covered"
  | "Shortfall"
  | "Payout"
  | "Claimed"
  | "Finished"
  | "DaoReady"
  | "DaoProposal";

export interface Member {
  account_id: string;
  deposit: string;
  holdback: string;
  holdback_release: string;
  bonus: string;
  paid_out_round: number | null;
  paid_this_round: boolean;
  on_time: number;
  missed: number;
  claimed: boolean;
}

export interface CommitteeEvent {
  round: number;
  kind: EventKind;
  account_id: string | null;
  amount: string;
  note: string | null;
  timestamp_ms: number;
}

export interface Committee {
  id: number;
  name: string;
  organizer: string;
  token: string;
  dao: string | null;
  dao_ready: boolean;
  amount: string;
  size: number;
  round_secs: number;
  mode: PayoutMode;
  status: Status;
  round: number;
  round_started_ms: number;
  members: Member[];
  bids: [number, number][];
  events: CommitteeEvent[];
  // view extras
  pot: string;
  round_ends_ms: number;
  can_advance: boolean;
  held: string;
  unforwarded: string;
}

export interface Reputation {
  account_id: string;
  record: { finished: number; defaults: number; on_time: number; missed: number };
  holdback_bps: number;
}

export interface ContractConfig {
  owner: string;
  token: string;
  dao_factory: string | null;
  dao_deposit: string;
  committees: number;
}
