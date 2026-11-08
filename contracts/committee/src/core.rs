//! Pure committee rules: no blockchain calls, so every rule is unit-testable.
//!
//! Money only moves through the `Transfer` effects that the rule functions return;
//! the contract layer turns those into token transfers.

use near_sdk::json_types::U128;
use near_sdk::{near, AccountId};

pub const MAX_MEMBERS: u32 = 20;
pub const MIN_MEMBERS: u32 = 2;
/// Bidders can offer at most 30% of the pot as a discount.
pub const MAX_BID_BPS: u16 = 3_000;
const BPS: u128 = 10_000;

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PayoutMode {
    /// Random pick among members not yet paid (default).
    Draw,
    /// Members are paid in the order they joined.
    Order,
    /// Highest discount bid wins; falls back to a draw when nobody bids.
    Bid,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    Open,
    Running,
    Finished,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Member {
    pub account_id: AccountId,
    /// Security deposit still held (one contribution when joining).
    pub deposit: U128,
    /// Part of this member's payout still locked as cover for future rounds.
    pub holdback: U128,
    /// How much holdback is released for each later round paid on time.
    pub holdback_release: U128,
    /// Bidding discounts shared with this member, paid out at the end.
    pub bonus: U128,
    /// Round in which this member received the pot, if any.
    pub paid_out_round: Option<u32>,
    pub paid_this_round: bool,
    pub on_time: u32,
    pub missed: u32,
    pub claimed: bool,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum EventKind {
    Created,
    Joined,
    Started,
    Contributed,
    Bid,
    /// A missed payment, covered from holdback and/or deposit.
    Covered,
    /// A missed payment that could not be fully covered.
    Shortfall,
    Payout,
    Claimed,
    Finished,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Event {
    pub round: u32,
    pub kind: EventKind,
    pub account_id: Option<AccountId>,
    pub amount: U128,
    /// For payouts: how the recipient was chosen, and the random seed for draws.
    pub note: Option<String>,
    pub timestamp_ms: u64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Committee {
    pub id: u64,
    pub name: String,
    pub organizer: AccountId,
    /// Fungible token used for every payment.
    pub token: AccountId,
    /// Contribution per member per round.
    pub amount: U128,
    pub size: u32,
    pub round_secs: u64,
    pub mode: PayoutMode,
    pub status: Status,
    /// 1-based once running; 0 while open.
    pub round: u32,
    pub round_started_ms: u64,
    pub members: Vec<Member>,
    /// (bidder index, discount in basis points) for the current round.
    pub bids: Vec<(u32, u16)>,
    pub events: Vec<Event>,
}

/// A token transfer the contract must make.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Transfer {
    pub to: AccountId,
    pub amount: u128,
}

/// Inputs the chain provides when a round closes.
pub struct RoundContext<'a> {
    pub now_ms: u64,
    pub random_seed: &'a [u8],
    /// Holdback share in basis points for a member, from their reputation.
    pub holdback_bps: &'a dyn Fn(&AccountId) -> u16,
}

pub fn holdback_bps_for(finished_committees: u32, defaults: u32) -> u16 {
    if defaults > 0 || finished_committees == 0 {
        5_000
    } else if finished_committees < 3 {
        2_500
    } else {
        0
    }
}

impl Committee {
    pub fn new(
        id: u64,
        name: String,
        organizer: AccountId,
        token: AccountId,
        amount: u128,
        size: u32,
        round_secs: u64,
        mode: PayoutMode,
        now_ms: u64,
    ) -> Self {
        assert!(!name.trim().is_empty() && name.len() <= 64, "Name must be 1-64 characters");
        assert!(amount > 0, "Contribution must be more than zero");
        assert!(
            (MIN_MEMBERS..=MAX_MEMBERS).contains(&size),
            "A committee needs {}-{} members",
            MIN_MEMBERS,
            MAX_MEMBERS
        );
        assert!(round_secs >= 60, "Rounds must be at least 60 seconds");
        Self {
            id,
            name,
            organizer,
            token,
            amount: U128(amount),
            size,
            round_secs,
            mode,
            status: Status::Open,
            round: 0,
            round_started_ms: 0,
            members: Vec::new(),
            bids: Vec::new(),
            events: vec![],
        }
        .with_event(0, EventKind::Created, None, 0, None, now_ms)
    }

    fn with_event(
        mut self,
        round: u32,
        kind: EventKind,
        account_id: Option<AccountId>,
        amount: u128,
        note: Option<String>,
        now_ms: u64,
    ) -> Self {
        self.push_event(round, kind, account_id, amount, note, now_ms);
        self
    }

    fn push_event(
        &mut self,
        round: u32,
        kind: EventKind,
        account_id: Option<AccountId>,
        amount: u128,
        note: Option<String>,
        timestamp_ms: u64,
    ) {
        self.events.push(Event { round, kind, account_id, amount: U128(amount), note, timestamp_ms });
    }

    pub fn member_index(&self, account_id: &AccountId) -> Option<usize> {
        self.members.iter().position(|m| &m.account_id == account_id)
    }

    fn member_mut(&mut self, account_id: &AccountId) -> &mut Member {
        let i = self.member_index(account_id).expect("Not a member of this committee");
        &mut self.members[i]
    }

    pub fn pot(&self) -> u128 {
        self.amount.0 * self.size as u128
    }

    pub fn round_ends_ms(&self) -> u64 {
        self.round_started_ms + self.round_secs * 1_000
    }

    /// Join by paying the security deposit, which must equal one contribution.
    pub fn join(&mut self, account_id: AccountId, paid: u128, now_ms: u64) {
        assert_eq!(self.status, Status::Open, "This committee is no longer open");
        assert!(self.member_index(&account_id).is_none(), "Already a member");
        assert!((self.members.len() as u32) < self.size, "This committee is full");
        assert_eq!(paid, self.amount.0, "The deposit must equal one contribution");
        self.members.push(Member {
            account_id: account_id.clone(),
            deposit: U128(paid),
            holdback: U128(0),
            holdback_release: U128(0),
            bonus: U128(0),
            paid_out_round: None,
            paid_this_round: false,
            on_time: 0,
            missed: 0,
            claimed: false,
        });
        self.push_event(0, EventKind::Joined, Some(account_id), paid, None, now_ms);
    }

    pub fn start(&mut self, caller: &AccountId, now_ms: u64) {
        assert_eq!(caller, &self.organizer, "Only the organizer can start");
        assert_eq!(self.status, Status::Open, "Already started");
        assert_eq!(self.members.len() as u32, self.size, "Wait until every seat is taken");
        self.status = Status::Running;
        self.round = 1;
        self.round_started_ms = now_ms;
        self.push_event(1, EventKind::Started, Some(caller.clone()), 0, None, now_ms);
    }

    pub fn contribute(&mut self, account_id: &AccountId, paid: u128, now_ms: u64) {
        assert_eq!(self.status, Status::Running, "This committee is not running");
        assert_eq!(paid, self.amount.0, "Pay exactly one contribution");
        let round = self.round;
        let m = self.member_mut(account_id);
        assert!(!m.paid_this_round, "Already paid this round");
        m.paid_this_round = true;
        self.push_event(round, EventKind::Contributed, Some(account_id.clone()), paid, None, now_ms);
    }

    pub fn place_bid(&mut self, account_id: &AccountId, discount_bps: u16, now_ms: u64) {
        assert_eq!(self.mode, PayoutMode::Bid, "Bidding is off for this committee");
        assert_eq!(self.status, Status::Running, "This committee is not running");
        assert!(discount_bps > 0 && discount_bps <= MAX_BID_BPS, "Bid between 0.01% and 30%");
        let i = self.member_index(account_id).expect("Not a member of this committee");
        assert!(self.members[i].paid_out_round.is_none(), "You already received the pot");
        self.bids.retain(|(b, _)| *b as usize != i);
        self.bids.push((i as u32, discount_bps));
        self.push_event(
            self.round,
            EventKind::Bid,
            Some(account_id.clone()),
            0,
            Some(format!("{} bps", discount_bps)),
            now_ms,
        );
    }

    pub fn can_advance(&self, now_ms: u64) -> bool {
        self.status == Status::Running
            && (now_ms >= self.round_ends_ms() || self.members.iter().all(|m| m.paid_this_round))
    }

    /// Close the round: cover missed payments, choose the recipient, pay them,
    /// release holdbacks, and move on. Returns the transfers to make.
    pub fn advance(&mut self, ctx: &RoundContext) -> Vec<Transfer> {
        assert!(self.status == Status::Running, "This committee is not running");
        assert!(self.can_advance(ctx.now_ms), "This round has not ended yet");
        let round = self.round;
        let amount = self.amount.0;
        let mut transfers = Vec::new();

        // 1. Cover missed payments, then release holdback for members who paid.
        let mut shortfall: u128 = 0;
        for i in 0..self.members.len() {
            if self.members[i].paid_this_round {
                let m = &mut self.members[i];
                m.on_time += 1;
                let release = m.holdback_release.0.min(m.holdback.0);
                m.holdback = U128(m.holdback.0 - release);
                m.bonus = U128(m.bonus.0 + release);
                continue;
            }
            let m = &mut self.members[i];
            m.missed += 1;
            let from_holdback = m.holdback.0.min(amount);
            m.holdback = U128(m.holdback.0 - from_holdback);
            let from_deposit = (amount - from_holdback).min(m.deposit.0);
            m.deposit = U128(m.deposit.0 - from_deposit);
            let covered = from_holdback + from_deposit;
            let missing = amount - covered;
            let account = m.account_id.clone();
            if covered > 0 {
                self.push_event(
                    round,
                    EventKind::Covered,
                    Some(account.clone()),
                    covered,
                    Some(format!("holdback {} + deposit {}", from_holdback, from_deposit)),
                    ctx.now_ms,
                );
            }
            if missing > 0 {
                shortfall += missing;
                self.push_event(round, EventKind::Shortfall, Some(account), missing, None, ctx.now_ms);
            }
        }
        let pot = self.pot() - shortfall;

        // 2. Choose the recipient.
        let waiting: Vec<usize> =
            (0..self.members.len()).filter(|&i| self.members[i].paid_out_round.is_none()).collect();
        let (winner, discount_bps, how) = self.choose(&waiting, ctx.random_seed);

        // 3. Share any bid discount with everyone else still waiting.
        let others: Vec<usize> = waiting.iter().copied().filter(|&i| i != winner).collect();
        let mut discount = if others.is_empty() { 0 } else { pot * discount_bps as u128 / BPS };
        if discount > 0 {
            let share = discount / others.len() as u128;
            discount = share * others.len() as u128; // dust stays with the winner
            for &i in &others {
                let m = &mut self.members[i];
                m.bonus = U128(m.bonus.0 + share);
            }
        }
        let gross = pot - discount;

        // 4. Hold back part of an early payout as cover for the rounds still owed.
        let rounds_left = self.size - round;
        let winner_id = self.members[winner].account_id.clone();
        let bps = (ctx.holdback_bps)(&winner_id) as u128;
        let holdback = (gross * bps / BPS).min(amount * rounds_left as u128);
        let w = &mut self.members[winner];
        w.paid_out_round = Some(round);
        w.holdback = U128(w.holdback.0 + holdback);
        w.holdback_release = U128(if rounds_left == 0 { 0 } else { holdback / rounds_left as u128 });
        let sent = gross - holdback;
        transfers.push(Transfer { to: winner_id.clone(), amount: sent });
        self.push_event(
            round,
            EventKind::Payout,
            Some(winner_id),
            sent,
            Some(format!("{}; held back {}; discount shared {}", how, holdback, discount)),
            ctx.now_ms,
        );

        // 5. Next round, or finish.
        self.bids.clear();
        for m in self.members.iter_mut() {
            m.paid_this_round = false;
        }
        if round == self.size {
            self.status = Status::Finished;
            self.push_event(round, EventKind::Finished, None, 0, None, ctx.now_ms);
        } else {
            self.round = round + 1;
            self.round_started_ms = ctx.now_ms;
        }
        transfers
    }

    fn choose(&self, waiting: &[usize], seed: &[u8]) -> (usize, u16, String) {
        assert!(!waiting.is_empty(), "Nobody left to pay");
        if self.mode == PayoutMode::Bid {
            // Highest bid wins; ties go to whoever joined first.
            if let Some(&(i, bps)) = self
                .bids
                .iter()
                .filter(|(i, _)| waiting.contains(&(*i as usize)))
                .max_by(|a, b| a.1.cmp(&b.1).then(b.0.cmp(&a.0)))
            {
                return (i as usize, bps, format!("won bid at {} bps", bps));
            }
        }
        if self.mode == PayoutMode::Order {
            return (waiting[0], 0, "next in agreed order".into());
        }
        let mut bytes = [0u8; 8];
        bytes.copy_from_slice(&seed[..8]);
        let pick = (u64::from_le_bytes(bytes) % waiting.len() as u64) as usize;
        (waiting[pick], 0, format!("lucky draw, seed {}", hex(seed)))
    }

    /// After the last round: return what is left of a member's deposit,
    /// holdback and bonus.
    pub fn claim(&mut self, account_id: &AccountId, now_ms: u64) -> Transfer {
        assert_eq!(self.status, Status::Finished, "Claims open after the last round");
        let m = self.member_mut(account_id);
        assert!(!m.claimed, "Already claimed");
        let total = m.deposit.0 + m.holdback.0 + m.bonus.0;
        m.claimed = true;
        m.deposit = U128(0);
        m.holdback = U128(0);
        m.bonus = U128(0);
        let to = m.account_id.clone();
        self.push_event(self.round, EventKind::Claimed, Some(to.clone()), total, None, now_ms);
        Transfer { to, amount: total }
    }

    /// Funds the contract should still hold for this committee.
    pub fn held(&self) -> u128 {
        let paid_now = self.members.iter().filter(|m| m.paid_this_round).count() as u128;
        let locked: u128 =
            self.members.iter().map(|m| m.deposit.0 + m.holdback.0 + m.bonus.0).sum();
        locked + if self.status == Status::Running { paid_now * self.amount.0 } else { 0 }
    }
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn acc(s: &str) -> AccountId {
        s.parse().unwrap()
    }

    fn committee(mode: PayoutMode, size: u32) -> Committee {
        let mut c = Committee::new(
            1,
            "Family committee".into(),
            acc("org.testnet"),
            acc("usd.testnet"),
            100,
            size,
            60,
            mode,
            0,
        );
        for i in 0..size {
            c.join(acc(&format!("m{}.testnet", i)), 100, 0);
        }
        c.start(&acc("org.testnet"), 0);
        c
    }

    fn ctx<'a>(now_ms: u64, seed: &'a [u8], bps: &'a dyn Fn(&AccountId) -> u16) -> RoundContext<'a> {
        RoundContext { now_ms, random_seed: seed, holdback_bps: bps }
    }

    fn pay_all(c: &mut Committee, except: &[usize]) {
        for i in 0..c.members.len() {
            if !except.contains(&i) {
                let id = c.members[i].account_id.clone();
                c.contribute(&id, 100, 1);
            }
        }
    }

    const SEED: [u8; 32] = [7u8; 32];
    fn no_holdback(_: &AccountId) -> u16 {
        0
    }
    fn half_holdback(_: &AccountId) -> u16 {
        5_000
    }

    #[test]
    fn full_cycle_pays_everyone_once_and_conserves_money() {
        let mut c = committee(PayoutMode::Draw, 3);
        let mut paid_in = 300u128; // deposits
        let mut paid_out = 0u128;
        let mut winners = vec![];
        for r in 1..=3 {
            pay_all(&mut c, &[]);
            paid_in += 300;
            let t = c.advance(&ctx(r * 61_000, &SEED, &half_holdback));
            assert_eq!(t.len(), 1);
            winners.push(t[0].to.clone());
            paid_out += t[0].amount;
        }
        assert_eq!(c.status, Status::Finished);
        winners.sort();
        winners.dedup();
        assert_eq!(winners.len(), 3, "each member is paid exactly once");
        for i in 0..3 {
            let id = c.members[i].account_id.clone();
            paid_out += c.claim(&id, 0).amount;
        }
        assert_eq!(paid_in, paid_out, "every unit paid in comes back out");
        assert_eq!(c.held(), 0);
    }

    #[test]
    fn deposit_and_released_holdback_come_back_when_everyone_pays() {
        let mut c = committee(PayoutMode::Order, 2);
        for r in 1..=2 {
            pay_all(&mut c, &[]);
            c.advance(&ctx(r * 61_000, &SEED, &half_holdback));
        }
        let first = c.members[0].account_id.clone();
        // Payout was 200 with 100 held back; it is released after paying round 2.
        // Claim = deposit 100 + released holdback 100.
        assert_eq!(c.claim(&first, 0).amount, 200);
    }

    #[test]
    fn order_mode_pays_in_join_order() {
        let mut c = committee(PayoutMode::Order, 3);
        for r in 1..=3u64 {
            pay_all(&mut c, &[]);
            let t = c.advance(&ctx(r * 61_000, &SEED, &no_holdback));
            assert_eq!(t[0].to, acc(&format!("m{}.testnet", r - 1)));
            assert_eq!(t[0].amount, 300);
        }
    }

    #[test]
    fn draw_depends_on_the_seed() {
        let picks: Vec<AccountId> = (0u8..3)
            .map(|s| {
                let mut c = committee(PayoutMode::Draw, 3);
                pay_all(&mut c, &[]);
                let seed = [s; 32];
                c.advance(&ctx(61_000, &seed, &no_holdback))[0].to.clone()
            })
            .collect();
        assert!(picks.iter().any(|p| p != &picks[0]), "different seeds give different winners");
        let mut c = committee(PayoutMode::Draw, 3);
        pay_all(&mut c, &[]);
        c.advance(&ctx(61_000, &SEED, &no_holdback));
        let note = c.events.iter().rev().find(|e| e.kind == EventKind::Payout).unwrap().note.clone();
        assert!(note.unwrap().contains("0707070707"), "the seed is recorded for verification");
    }

    #[test]
    fn holdback_is_capped_and_released_as_payments_arrive() {
        let mut c = committee(PayoutMode::Order, 3);
        pay_all(&mut c, &[]);
        let t = c.advance(&ctx(61_000, &SEED, &half_holdback));
        // 50% of 300 = 150, capped at 2 rounds owed * 100 = 200 -> 150 held.
        assert_eq!(t[0].amount, 150);
        assert_eq!(c.members[0].holdback.0, 150);
        assert_eq!(c.members[0].holdback_release.0, 75);
        pay_all(&mut c, &[]);
        c.advance(&ctx(122_000, &SEED, &half_holdback));
        assert_eq!(c.members[0].holdback.0, 75);
        assert_eq!(c.members[0].bonus.0, 75);
    }

    #[test]
    fn a_skipped_payment_is_covered_from_holdback_so_the_pot_stays_whole() {
        let mut c = committee(PayoutMode::Order, 3);
        pay_all(&mut c, &[]);
        c.advance(&ctx(61_000, &SEED, &half_holdback)); // m0 paid, 150 held back
        pay_all(&mut c, &[0]); // m0 skips round 2
        let t = c.advance(&ctx(122_000, &SEED, &no_holdback));
        assert_eq!(t[0].to, acc("m1.testnet"));
        assert_eq!(t[0].amount, 300, "recipient still gets the full pot");
        assert_eq!(c.members[0].holdback.0, 50);
        assert_eq!(c.members[0].deposit.0, 100);
        assert_eq!(c.members[0].missed, 1);
        assert!(c.events.iter().any(|e| e.kind == EventKind::Covered));
    }

    #[test]
    fn deposit_covers_when_there_is_no_holdback_and_shortfall_is_recorded_beyond_it() {
        let mut c = committee(PayoutMode::Order, 3);
        pay_all(&mut c, &[2]); // m2 skips round 1: deposit covers it
        let t = c.advance(&ctx(61_000, &SEED, &no_holdback));
        assert_eq!(t[0].amount, 300);
        assert_eq!(c.members[2].deposit.0, 0);
        pay_all(&mut c, &[2]); // m2 skips again: nothing left
        let t = c.advance(&ctx(122_000, &SEED, &no_holdback));
        assert_eq!(t[0].amount, 200);
        assert!(c.events.iter().any(|e| e.kind == EventKind::Shortfall));
    }

    #[test]
    fn highest_bid_wins_and_discount_is_shared() {
        let mut c = committee(PayoutMode::Bid, 3);
        c.place_bid(&acc("m1.testnet"), 1_000, 1);
        c.place_bid(&acc("m2.testnet"), 2_000, 1);
        pay_all(&mut c, &[]);
        let t = c.advance(&ctx(61_000, &SEED, &no_holdback));
        assert_eq!(t[0].to, acc("m2.testnet"));
        assert_eq!(t[0].amount, 240); // 300 - 20%
        assert_eq!(c.members[0].bonus.0, 30);
        assert_eq!(c.members[1].bonus.0, 30);
        assert!(c.bids.is_empty());
    }

    #[test]
    fn bid_mode_without_bids_falls_back_to_a_draw() {
        let mut c = committee(PayoutMode::Bid, 3);
        pay_all(&mut c, &[]);
        c.advance(&ctx(61_000, &SEED, &no_holdback));
        let note = c.events.iter().rev().find(|e| e.kind == EventKind::Payout).unwrap().note.clone();
        assert!(note.unwrap().starts_with("lucky draw"));
    }

    #[test]
    fn round_can_close_early_once_everyone_paid() {
        let mut c = committee(PayoutMode::Draw, 2);
        assert!(!c.can_advance(1_000));
        pay_all(&mut c, &[]);
        assert!(c.can_advance(1_000));
    }

    #[test]
    #[should_panic(expected = "This round has not ended yet")]
    fn cannot_advance_early_while_payments_are_missing() {
        let mut c = committee(PayoutMode::Draw, 2);
        pay_all(&mut c, &[1]);
        c.advance(&ctx(1_000, &SEED, &no_holdback));
    }

    #[test]
    #[should_panic(expected = "Already paid this round")]
    fn cannot_pay_twice_in_a_round() {
        let mut c = committee(PayoutMode::Draw, 2);
        c.contribute(&acc("m0.testnet"), 100, 1);
        c.contribute(&acc("m0.testnet"), 100, 1);
    }

    #[test]
    #[should_panic(expected = "The deposit must equal one contribution")]
    fn deposit_must_match_contribution() {
        let mut c = Committee::new(
            1, "x".into(), acc("org.testnet"), acc("usd.testnet"), 100, 2, 60, PayoutMode::Draw, 0,
        );
        c.join(acc("a.testnet"), 50, 0);
    }

    #[test]
    #[should_panic(expected = "Only the organizer can start")]
    fn only_organizer_starts() {
        let mut c = Committee::new(
            1, "x".into(), acc("org.testnet"), acc("usd.testnet"), 100, 2, 60, PayoutMode::Draw, 0,
        );
        c.join(acc("a.testnet"), 100, 0);
        c.join(acc("b.testnet"), 100, 0);
        c.start(&acc("a.testnet"), 0);
    }

    #[test]
    #[should_panic(expected = "You already received the pot")]
    fn paid_members_cannot_bid() {
        let mut c = committee(PayoutMode::Bid, 3);
        pay_all(&mut c, &[]);
        let t = c.advance(&ctx(61_000, &SEED, &no_holdback));
        c.place_bid(&t[0].to, 500, 1);
    }

    #[test]
    fn reputation_tiers() {
        assert_eq!(holdback_bps_for(0, 0), 5_000);
        assert_eq!(holdback_bps_for(1, 0), 2_500);
        assert_eq!(holdback_bps_for(3, 0), 0);
        assert_eq!(holdback_bps_for(5, 1), 5_000);
    }
}
