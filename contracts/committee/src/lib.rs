//! Committee: rotating savings circles on NEAR where the pot pays out by rule,
//! not by trusting an organizer.
//!
//! Members pay with a fungible token (`ft_transfer_call` with a JSON message),
//! the contract tracks every round, and payouts leave by token transfer.
//! The rules themselves live in `core.rs` so they can be tested on their own.

pub mod core;

use crate::core::{holdback_bps_for, Committee, PayoutMode, RoundContext, Status, Transfer};
use near_sdk::json_types::U128;
use near_sdk::serde::Deserialize;
use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{
    env, ext_contract, log, near, require, AccountId, BorshStorageKey, Gas, NearToken,
    PanicOnDefault, PromiseError, PromiseOrValue,
};

const GAS_FOR_FT_TRANSFER: Gas = Gas::from_tgas(10);
const GAS_FOR_CALLBACK: Gas = Gas::from_tgas(10);
const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);

#[ext_contract(ext_ft)]
#[allow(dead_code)]
trait FungibleToken {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
enum StorageKey {
    Committees,
    Reputation,
    Stuck,
}

/// A member's record across every committee they have been in.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Reputation {
    /// Committees finished without missing a payment.
    pub finished: u32,
    /// Committees finished with at least one missed payment.
    pub defaults: u32,
    pub on_time: u32,
    pub missed: u32,
}

#[near(serializers = [json])]
pub struct ReputationView {
    pub account_id: AccountId,
    pub record: Reputation,
    /// Share of an early payout that will be held back, in basis points.
    pub holdback_bps: u16,
}

#[near(serializers = [json])]
pub struct CommitteeView {
    #[serde(flatten)]
    pub committee: Committee,
    pub pot: U128,
    pub round_ends_ms: u64,
    pub can_advance: bool,
    pub held: U128,
}

#[derive(Deserialize)]
#[serde(crate = "near_sdk::serde", tag = "action", rename_all = "snake_case")]
enum TransferMsg {
    Join { committee_id: u64 },
    Contribute { committee_id: u64 },
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    owner: AccountId,
    /// The token every new committee uses (testUSD on testnet).
    token: AccountId,
    next_id: u64,
    committees: IterableMap<u64, Committee>,
    reputation: LookupMap<AccountId, Reputation>,
    /// Payouts whose token transfer failed, kept safe until withdrawn.
    stuck: LookupMap<AccountId, u128>,
}

#[near]
impl Contract {
    #[init]
    pub fn new(owner: AccountId, token: AccountId) -> Self {
        Self {
            owner,
            token,
            next_id: 1,
            committees: IterableMap::new(StorageKey::Committees),
            reputation: LookupMap::new(StorageKey::Reputation),
            stuck: LookupMap::new(StorageKey::Stuck),
        }
    }

    // ---------- organizer and members ----------

    pub fn create_committee(
        &mut self,
        name: String,
        amount: U128,
        size: u32,
        round_secs: u64,
        mode: Option<PayoutMode>,
    ) -> u64 {
        let id = self.next_id;
        self.next_id += 1;
        let c = Committee::new(
            id,
            name,
            env::predecessor_account_id(),
            self.token.clone(),
            amount.0,
            size,
            round_secs,
            mode.unwrap_or(PayoutMode::Draw),
            now_ms(),
        );
        log!("EVENT_JSON:{{\"standard\":\"committee\",\"version\":\"1.0.0\",\"event\":\"created\",\"data\":[{{\"committee_id\":{}}}]}}", id);
        self.committees.insert(id, c);
        id
    }

    pub fn start(&mut self, committee_id: u64) {
        let c = self.committee_mut(committee_id);
        c.start(&env::predecessor_account_id(), now_ms());
    }

    pub fn place_bid(&mut self, committee_id: u64, discount_bps: u16) {
        let c = self.committee_mut(committee_id);
        c.place_bid(&env::predecessor_account_id(), discount_bps, now_ms());
    }

    /// Anyone can close a round once it has ended (or once everyone has paid).
    pub fn advance_round(&mut self, committee_id: u64) -> U128 {
        let mut c = self.committees.get(&committee_id).expect("No such committee").clone();
        let before: Vec<(u32, u32)> = c.members.iter().map(|m| (m.on_time, m.missed)).collect();
        let seed = env::random_seed();
        let rep = &self.reputation;
        let holdback = |id: &AccountId| {
            let r = rep.get(id).cloned().unwrap_or_default();
            holdback_bps_for(r.finished, r.defaults)
        };
        let transfers =
            c.advance(&RoundContext { now_ms: now_ms(), random_seed: &seed, holdback_bps: &holdback });

        // Update everyone's record.
        for (m, (on_time, missed)) in c.members.iter().zip(before) {
            let mut r = self.reputation.get(&m.account_id).cloned().unwrap_or_default();
            r.on_time += m.on_time - on_time;
            r.missed += m.missed - missed;
            if c.status == Status::Finished {
                if m.missed == 0 {
                    r.finished += 1;
                } else {
                    r.defaults += 1;
                }
            }
            self.reputation.insert(m.account_id.clone(), r);
        }
        let token = c.token.clone();
        let sent = transfers.iter().map(|t| t.amount).sum::<u128>();
        self.committees.insert(committee_id, c);
        for t in transfers {
            self.send(&token, t, committee_id);
        }
        U128(sent)
    }

    /// After the last round, take back your deposit, released holdback and bonus.
    pub fn claim(&mut self, committee_id: u64) -> U128 {
        let c = self.committee_mut(committee_id);
        let token = c.token.clone();
        let t = c.claim(&env::predecessor_account_id(), now_ms());
        let amount = t.amount;
        if amount > 0 {
            self.send(&token, t, committee_id);
        }
        U128(amount)
    }

    /// Withdraw a payout whose transfer failed earlier.
    pub fn withdraw_stuck(&mut self) -> U128 {
        let who = env::predecessor_account_id();
        let amount = self.stuck.remove(&who).unwrap_or(0);
        require!(amount > 0, "Nothing to withdraw");
        self.send(&self.token.clone(), Transfer { to: who, amount }, 0);
        U128(amount)
    }

    // ---------- token payments ----------

    /// Called by the token contract when a member pays with `ft_transfer_call`.
    /// Panicking here refunds the payment automatically.
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        let token = env::predecessor_account_id();
        let parsed: TransferMsg =
            near_sdk::serde_json::from_str(&msg).unwrap_or_else(|_| env::panic_str("Invalid message"));
        let id = match &parsed {
            TransferMsg::Join { committee_id } | TransferMsg::Contribute { committee_id } => *committee_id,
        };
        let c = self.committee_mut(id);
        require!(c.token == token, "Wrong token for this committee");
        match parsed {
            TransferMsg::Join { .. } => c.join(sender_id, amount.0, now_ms()),
            TransferMsg::Contribute { .. } => c.contribute(&sender_id, amount.0, now_ms()),
        }
        PromiseOrValue::Value(U128(0))
    }

    #[private]
    pub fn on_payout(
        &mut self,
        to: AccountId,
        amount: U128,
        committee_id: u64,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> bool {
        if result.is_ok() {
            return true;
        }
        let held = self.stuck.get(&to).copied().unwrap_or(0);
        self.stuck.insert(to.clone(), held + amount.0);
        log!("Payout to {} from committee {} failed; kept for withdraw_stuck", to, committee_id);
        false
    }

    // ---------- views ----------

    pub fn get_committee(&self, committee_id: u64) -> Option<CommitteeView> {
        self.committees.get(&committee_id).map(|c| view(c))
    }

    pub fn get_committees(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<CommitteeView> {
        self.committees
            .values()
            .skip(from_index.unwrap_or(0) as usize)
            .take(limit.unwrap_or(20).min(50) as usize)
            .map(view)
            .collect()
    }

    pub fn get_committees_for(&self, account_id: AccountId) -> Vec<CommitteeView> {
        self.committees
            .values()
            .filter(|c| c.organizer == account_id || c.member_index(&account_id).is_some())
            .map(view)
            .collect()
    }

    pub fn get_reputation(&self, account_id: AccountId) -> ReputationView {
        let record = self.reputation.get(&account_id).cloned().unwrap_or_default();
        let holdback_bps = holdback_bps_for(record.finished, record.defaults);
        ReputationView { account_id, record, holdback_bps }
    }

    pub fn get_stuck(&self, account_id: AccountId) -> U128 {
        U128(self.stuck.get(&account_id).copied().unwrap_or(0))
    }

    pub fn get_config(&self) -> (AccountId, AccountId, u64) {
        (self.owner.clone(), self.token.clone(), self.next_id - 1)
    }
}

impl Contract {
    fn committee_mut(&mut self, id: u64) -> &mut Committee {
        self.committees.get_mut(&id).unwrap_or_else(|| env::panic_str("No such committee"))
    }

    fn send(&self, token: &AccountId, t: Transfer, committee_id: u64) {
        if t.amount == 0 {
            return;
        }
        log!(
            "EVENT_JSON:{{\"standard\":\"committee\",\"version\":\"1.0.0\",\"event\":\"transfer\",\"data\":[{{\"committee_id\":{},\"to\":\"{}\",\"amount\":\"{}\"}}]}}",
            committee_id, t.to, t.amount
        );
        ext_ft::ext(token.clone())
            .with_attached_deposit(ONE_YOCTO)
            .with_static_gas(GAS_FOR_FT_TRANSFER)
            .ft_transfer(t.to.clone(), U128(t.amount), Some(format!("committee {}", committee_id)))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_CALLBACK)
                    .on_payout(t.to, U128(t.amount), committee_id),
            )
            .detach();
    }
}

fn now_ms() -> u64 {
    env::block_timestamp_ms()
}

fn view(c: &Committee) -> CommitteeView {
    let now = now_ms();
    CommitteeView {
        pot: U128(c.pot()),
        round_ends_ms: c.round_ends_ms(),
        can_advance: c.can_advance(now),
        held: U128(c.held()),
        committee: c.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{get_logs, VMContextBuilder};
    use near_sdk::testing_env;

    fn acc(s: &str) -> AccountId {
        s.parse().unwrap()
    }

    fn set(predecessor: &str, ts_ms: u64) {
        let mut b = VMContextBuilder::new();
        b.current_account_id(acc("committee.testnet"))
            .predecessor_account_id(acc(predecessor))
            .block_timestamp(ts_ms * 1_000_000)
            .random_seed([3u8; 32]);
        testing_env!(b.build());
    }

    fn pay(c: &mut Contract, who: &str, action: &str, id: u64, amount: u128, ts: u64) {
        set("usd.testnet", ts);
        let msg = format!("{{\"action\":\"{}\",\"committee_id\":{}}}", action, id);
        let _ = c.ft_on_transfer(acc(who), U128(amount), msg);
    }

    fn setup() -> (Contract, u64) {
        set("owner.testnet", 0);
        let mut c = Contract::new(acc("owner.testnet"), acc("usd.testnet"));
        set("ayesha.testnet", 0);
        let id = c.create_committee("Family".into(), U128(100), 3, 60, None);
        for who in ["ayesha.testnet", "bilal.testnet", "sara.testnet"] {
            pay(&mut c, who, "join", id, 100, 0);
        }
        set("ayesha.testnet", 0);
        c.start(id);
        (c, id)
    }

    #[test]
    fn full_committee_through_the_contract() {
        let (mut c, id) = setup();
        let mut ts = 0;
        for _ in 0..3 {
            ts += 61_000;
            for who in ["ayesha.testnet", "bilal.testnet", "sara.testnet"] {
                pay(&mut c, who, "contribute", id, 100, ts);
            }
            set("anyone.testnet", ts);
            assert!(c.advance_round(id).0 > 0);
        }
        let v = c.get_committee(id).unwrap();
        assert_eq!(v.committee.status, Status::Finished);
        let mut returned = 0;
        for who in ["ayesha.testnet", "bilal.testnet", "sara.testnet"] {
            set(who, ts);
            returned += c.claim(id).0;
            let r = c.get_reputation(acc(who));
            assert_eq!(r.record.finished, 1);
            assert_eq!(r.record.on_time, 3);
            assert_eq!(r.holdback_bps, 2_500, "one finished committee lowers holdback");
        }
        // 3 deposits come back, plus whatever holdback was released.
        assert!(returned >= 300);
        assert_eq!(c.get_committee(id).unwrap().held.0, 0);
        assert!(get_logs().iter().any(|l| l.contains("\"event\":\"transfer\"")));
    }

    #[test]
    #[should_panic(expected = "Wrong token for this committee")]
    fn rejects_other_tokens() {
        let (mut c, id) = setup();
        set("fake-usd.testnet", 1);
        let _ = c.ft_on_transfer(
            acc("bilal.testnet"),
            U128(100),
            format!("{{\"action\":\"contribute\",\"committee_id\":{}}}", id),
        );
    }

    #[test]
    #[should_panic(expected = "Invalid message")]
    fn rejects_bad_messages() {
        let (mut c, _) = setup();
        set("usd.testnet", 1);
        let _ = c.ft_on_transfer(acc("bilal.testnet"), U128(100), "hello".into());
    }

    #[test]
    fn missed_payment_hurts_reputation() {
        let (mut c, id) = setup();
        let mut ts = 0;
        for round in 0..3 {
            ts += 61_000;
            for who in ["ayesha.testnet", "bilal.testnet", "sara.testnet"] {
                if !(round == 1 && who == "sara.testnet") {
                    pay(&mut c, who, "contribute", id, 100, ts);
                }
            }
            set("anyone.testnet", ts);
            c.advance_round(id);
        }
        let r = c.get_reputation(acc("sara.testnet"));
        assert_eq!(r.record.missed, 1);
        assert_eq!(r.record.defaults, 1);
        assert_eq!(r.holdback_bps, 5_000);
    }

    #[test]
    fn lists_committees_for_a_member() {
        let (c, id) = setup();
        let mine = c.get_committees_for(acc("bilal.testnet"));
        assert_eq!(mine.len(), 1);
        assert_eq!(mine[0].committee.id, id);
        assert!(c.get_committees_for(acc("stranger.testnet")).is_empty());
    }
}
