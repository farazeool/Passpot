//! Committee: rotating savings circles on NEAR where the pot pays out by rule,
//! not by trusting an organizer.
//!
//! Each committee can have its own stock Sputnik DAO as its vault:
//! - the contract creates the DAO through the Sputnik factory, with itself as the
//!   only council member, so no person can move the money;
//! - every contribution and deposit is forwarded to the DAO as it arrives;
//! - every payout and claim leaves the DAO through the DAO's own Transfer
//!   proposal, which the contract files and approves by the committee's rules.
//! Anyone can audit the DAO's proposals and balance in any Sputnik UI.
//!
//! Without a DAO (cheaper, for quick tests), the contract holds the money itself.
//! The rules live in `core.rs` so they can be tested on their own.

pub mod core;

use crate::core::{
    holdback_bps_for, Committee, EventKind, PayoutMode, RoundContext, Status, Transfer,
};
use near_sdk::json_types::{Base64VecU8, U128};
use near_sdk::serde::Deserialize;
use near_sdk::serde_json::{self, json};
use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{
    env, ext_contract, log, near, require, AccountId, BorshStorageKey, Gas, NearToken,
    PanicOnDefault, Promise, PromiseError, PromiseOrValue,
};

const GAS_FOR_FT_TRANSFER: Gas = Gas::from_tgas(10);
const GAS_FOR_CALLBACK: Gas = Gas::from_tgas(10);
const GAS_FOR_DAO_CREATE: Gas = Gas::from_tgas(150);
const GAS_FOR_ON_DAO_CREATED: Gas = Gas::from_tgas(10);
const GAS_FOR_ADD_PROPOSAL: Gas = Gas::from_tgas(20);
const GAS_FOR_ON_PROPOSAL_ADDED: Gas = Gas::from_tgas(150);
const GAS_FOR_ACT_PROPOSAL: Gas = Gas::from_tgas(110);
const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);
/// What the Sputnik factory needs to create a DAO (its code storage).
pub const DAO_DEPOSIT: NearToken = NearToken::from_near(6);

#[ext_contract(ext_ft)]
#[allow(dead_code)]
trait FungibleToken {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}

#[ext_contract(ext_factory)]
#[allow(dead_code)]
trait SputnikFactory {
    fn create(&mut self, name: AccountId, args: Base64VecU8) -> bool;
}

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
enum StorageKey {
    Committees,
    Reputation,
    Owed,
    Unforwarded,
    NearRefunds,
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
    /// What the committee's vault (DAO or contract) should hold right now.
    pub held: U128,
    /// Payments received but not yet forwarded to the DAO (normally 0).
    pub unforwarded: U128,
}

#[near(serializers = [json])]
pub struct ConfigView {
    pub owner: AccountId,
    pub token: AccountId,
    pub dao_factory: Option<AccountId>,
    pub dao_deposit: NearToken,
    pub committees: u64,
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
    /// Sputnik DAO factory (sputnikv2.testnet on testnet); None disables DAOs.
    dao_factory: Option<AccountId>,
    next_id: u64,
    committees: IterableMap<u64, Committee>,
    reputation: LookupMap<AccountId, Reputation>,
    /// Payouts that failed to arrive, by "committee_id:account"; retry with `retry_payout`.
    owed: LookupMap<String, u128>,
    /// Payments not yet forwarded to a committee's DAO; retry with `retry_forward`.
    unforwarded: LookupMap<u64, u128>,
    /// NEAR returned to organizers whose DAO could not be created.
    near_refunds: LookupMap<AccountId, NearToken>,
}

#[near]
impl Contract {
    #[init]
    pub fn new(owner: AccountId, token: AccountId, dao_factory: Option<AccountId>) -> Self {
        Self {
            owner,
            token,
            dao_factory,
            next_id: 1,
            committees: IterableMap::new(StorageKey::Committees),
            reputation: LookupMap::new(StorageKey::Reputation),
            owed: LookupMap::new(StorageKey::Owed),
            unforwarded: LookupMap::new(StorageKey::Unforwarded),
            near_refunds: LookupMap::new(StorageKey::NearRefunds),
        }
    }

    // ---------- organizer and members ----------

    /// Create a committee. Attach `DAO_DEPOSIT` (6 NEAR) to give it its own
    /// Sputnik DAO vault; attach nothing for a contract-held test committee.
    #[payable]
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
        let organizer = env::predecessor_account_id();
        let mut c = Committee::new(
            id,
            name.clone(),
            organizer.clone(),
            self.token.clone(),
            amount.0,
            size,
            round_secs,
            mode.unwrap_or(PayoutMode::Draw),
            now_ms(),
        );
        let deposit = env::attached_deposit();
        if !deposit.is_zero() {
            let factory = self
                .dao_factory
                .clone()
                .unwrap_or_else(|| env::panic_str("DAOs are not enabled on this contract"));
            require!(deposit >= DAO_DEPOSIT, "Attach 6 NEAR to create the committee's DAO");
            let short = self.dao_name(id);
            let dao: AccountId = format!("{}.{}", short, factory).parse().unwrap();
            c.dao = Some(dao.clone());
            let args = json!({
                "config": {
                    "name": short,
                    "purpose": format!("Vault of committee #{} \"{}\" on {}. Payouts leave only by the committee's rules.", id, name, env::current_account_id()),
                    "metadata": "",
                },
                "policy": self.dao_policy(),
            });
            ext_factory::ext(factory)
                .with_attached_deposit(deposit)
                .with_static_gas(GAS_FOR_DAO_CREATE)
                .create(short.parse().unwrap(), Base64VecU8(serde_json::to_vec(&args).unwrap()))
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(GAS_FOR_ON_DAO_CREATED)
                        .on_dao_created(id, organizer, deposit),
                )
                .detach();
        }
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
    /// Send it with 300 Tgas: a DAO payout files and approves a proposal.
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
        let sent = transfers.iter().map(|t| t.amount).sum::<u128>();
        self.committees.insert(committee_id, c);
        for t in transfers {
            self.send(committee_id, t);
        }
        U128(sent)
    }

    /// After the last round, take back your deposit, released holdback and bonus.
    pub fn claim(&mut self, committee_id: u64) -> U128 {
        let c = self.committee_mut(committee_id);
        let t = c.claim(&env::predecessor_account_id(), now_ms());
        let amount = t.amount;
        self.send(committee_id, t);
        U128(amount)
    }

    /// Resend a payout or claim that failed to arrive. Anyone can call it.
    pub fn retry_payout(&mut self, committee_id: u64, account_id: AccountId) -> U128 {
        let amount = self.owed.remove(&owed_key(committee_id, &account_id)).unwrap_or(0);
        require!(amount > 0, "Nothing owed");
        self.send(committee_id, Transfer { to: account_id, amount });
        U128(amount)
    }

    /// Forward payments that did not reach the DAO. Anyone can call it.
    pub fn retry_forward(&mut self, committee_id: u64) -> U128 {
        let amount = self.unforwarded.remove(&committee_id).unwrap_or(0);
        require!(amount > 0, "Nothing to forward");
        self.forward(committee_id, amount);
        U128(amount)
    }

    /// Take back the NEAR attached for a DAO that could not be created.
    pub fn withdraw_near_refund(&mut self) -> Promise {
        let who = env::predecessor_account_id();
        let amount = self.near_refunds.remove(&who).unwrap_or(NearToken::from_yoctonear(0));
        require!(!amount.is_zero(), "Nothing to refund");
        Promise::new(who).transfer(amount)
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
            serde_json::from_str(&msg).unwrap_or_else(|_| env::panic_str("Invalid message"));
        let id = match &parsed {
            TransferMsg::Join { committee_id } | TransferMsg::Contribute { committee_id } => *committee_id,
        };
        let c = self.committee_mut(id);
        require!(c.token == token, "Wrong token for this committee");
        match parsed {
            TransferMsg::Join { .. } => c.join(sender_id, amount.0, now_ms()),
            TransferMsg::Contribute { .. } => c.contribute(&sender_id, amount.0, now_ms()),
        }
        if c.dao.is_some() {
            self.forward(id, amount.0);
        }
        PromiseOrValue::Value(U128(0))
    }

    // ---------- callbacks ----------

    #[private]
    pub fn on_dao_created(
        &mut self,
        committee_id: u64,
        organizer: AccountId,
        deposit: NearToken,
        #[callback_result] result: Result<bool, PromiseError>,
    ) -> bool {
        let ok = matches!(result, Ok(true));
        let c = self.committee_mut(committee_id);
        if ok {
            c.dao_ready = true;
            let dao = c.dao.clone();
            c.push_event(0, EventKind::DaoReady, dao, 0, None, now_ms());
        } else {
            // The factory refunds the deposit to this contract; pass it back.
            c.dao = None;
            let held = self.near_refunds.get(&organizer).copied().unwrap_or(NearToken::from_yoctonear(0));
            self.near_refunds.insert(organizer.clone(), held.saturating_add(deposit));
            log!("DAO for committee {} could not be created; {} can withdraw_near_refund", committee_id, organizer);
        }
        ok
    }

    #[private]
    pub fn on_forwarded(
        &mut self,
        committee_id: u64,
        amount: U128,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> bool {
        if result.is_ok() {
            return true;
        }
        let held = self.unforwarded.get(&committee_id).copied().unwrap_or(0);
        self.unforwarded.insert(committee_id, held + amount.0);
        log!("Forwarding {} to the DAO of committee {} failed; call retry_forward", amount.0, committee_id);
        false
    }

    /// Step 2 of a DAO payout: the Transfer proposal exists, now approve it.
    #[private]
    pub fn on_proposal_added(
        &mut self,
        committee_id: u64,
        to: AccountId,
        amount: U128,
        #[callback_result] result: Result<u64, PromiseError>,
    ) -> PromiseOrValue<bool> {
        let proposal_id = match result {
            Ok(id) => id,
            Err(_) => {
                self.record_owed(committee_id, &to, amount.0);
                return PromiseOrValue::Value(false);
            }
        };
        let c = self.committee_mut(committee_id);
        let dao = c.dao.clone().expect("Committee has no DAO");
        let kind = transfer_kind(&c.token, &to, amount.0);
        let round = c.round;
        c.push_event(
            round,
            EventKind::DaoProposal,
            Some(to.clone()),
            amount.0,
            Some(format!("proposal {}", proposal_id)),
            now_ms(),
        );
        let args = json!({ "id": proposal_id, "action": "VoteApprove", "proposal": kind });
        Promise::new(dao)
            .function_call(
                "act_proposal".to_string(),
                serde_json::to_vec(&args).unwrap(),
                NearToken::from_yoctonear(0),
                GAS_FOR_ACT_PROPOSAL,
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_CALLBACK)
                    .on_payout(committee_id, to, amount),
            )
            .into()
    }

    #[private]
    pub fn on_payout(
        &mut self,
        committee_id: u64,
        to: AccountId,
        amount: U128,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> bool {
        if result.is_ok() {
            return true;
        }
        self.record_owed(committee_id, &to, amount.0);
        false
    }

    // ---------- views ----------

    pub fn get_committee(&self, committee_id: u64) -> Option<CommitteeView> {
        self.committees.get(&committee_id).map(|c| self.view(c))
    }

    pub fn get_committees(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<CommitteeView> {
        self.committees
            .values()
            .skip(from_index.unwrap_or(0) as usize)
            .take(limit.unwrap_or(20).min(50) as usize)
            .map(|c| self.view(c))
            .collect()
    }

    pub fn get_committees_for(&self, account_id: AccountId) -> Vec<CommitteeView> {
        self.committees
            .values()
            .filter(|c| c.organizer == account_id || c.member_index(&account_id).is_some())
            .map(|c| self.view(c))
            .collect()
    }

    pub fn get_reputation(&self, account_id: AccountId) -> ReputationView {
        let record = self.reputation.get(&account_id).cloned().unwrap_or_default();
        let holdback_bps = holdback_bps_for(record.finished, record.defaults);
        ReputationView { account_id, record, holdback_bps }
    }

    pub fn get_owed(&self, committee_id: u64, account_id: AccountId) -> U128 {
        U128(self.owed.get(&owed_key(committee_id, &account_id)).copied().unwrap_or(0))
    }

    pub fn get_config(&self) -> ConfigView {
        ConfigView {
            owner: self.owner.clone(),
            token: self.token.clone(),
            dao_factory: self.dao_factory.clone(),
            dao_deposit: DAO_DEPOSIT,
            committees: self.next_id - 1,
        }
    }

    /// The exact policy every committee DAO is created with, for auditing.
    pub fn get_dao_policy(&self) -> near_sdk::serde_json::Value {
        self.dao_policy()
    }
}

impl Contract {
    fn committee_mut(&mut self, id: u64) -> &mut Committee {
        self.committees.get_mut(&id).unwrap_or_else(|| env::panic_str("No such committee"))
    }

    fn view(&self, c: &Committee) -> CommitteeView {
        let now = now_ms();
        CommitteeView {
            pot: U128(c.pot()),
            round_ends_ms: c.round_ends_ms(),
            can_advance: c.can_advance(now),
            held: U128(c.held()),
            unforwarded: U128(self.unforwarded.get(&c.id).copied().unwrap_or(0)),
            committee: c.clone(),
        }
    }

    /// Short DAO name, unique per contract: e.g. "app-fatneek-committee-7".
    fn dao_name(&self, id: u64) -> String {
        let me = env::current_account_id().to_string();
        let base = me.trim_end_matches(".testnet").trim_end_matches(".near").replace('.', "-");
        let base: String = base.chars().take(28).collect();
        format!("{}-{}", base.trim_end_matches('-'), id)
    }

    /// Only this contract sits on the council, so only the committee's rules
    /// can move money. Anyone may file non-binding polls ("Vote" proposals).
    fn dao_policy(&self) -> near_sdk::serde_json::Value {
        json!({
            "roles": [
                {
                    "name": "committee-rules",
                    "kind": { "Group": [env::current_account_id()] },
                    "permissions": ["*:*"],
                    "vote_policy": {}
                },
                {
                    "name": "all",
                    "kind": "Everyone",
                    "permissions": ["vote:AddProposal"],
                    "vote_policy": {}
                }
            ],
            "default_vote_policy": { "weight_kind": "RoleWeight", "quorum": "0", "threshold": [1, 2] },
            "proposal_bond": "0",
            "proposal_period": "604800000000000",
            "bounty_bond": "0",
            "bounty_forgiveness_period": "86400000000000"
        })
    }

    fn record_owed(&mut self, committee_id: u64, to: &AccountId, amount: u128) {
        let key = owed_key(committee_id, to);
        let held = self.owed.get(&key).copied().unwrap_or(0);
        self.owed.insert(key, held + amount);
        log!("Payout of {} to {} from committee {} failed; call retry_payout", amount, to, committee_id);
    }

    /// Move a payment that just arrived into the committee's DAO.
    fn forward(&self, committee_id: u64, amount: u128) {
        let c = self.committees.get(&committee_id).expect("No such committee");
        let dao = c.dao.clone().expect("Committee has no DAO");
        ext_ft::ext(c.token.clone())
            .with_attached_deposit(ONE_YOCTO)
            .with_static_gas(GAS_FOR_FT_TRANSFER)
            .ft_transfer(dao, U128(amount), Some(format!("committee {}", committee_id)))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_CALLBACK)
                    .on_forwarded(committee_id, U128(amount)),
            )
            .detach();
    }

    /// Pay someone from the committee's vault: through a DAO Transfer proposal
    /// when the committee has a DAO, or straight from this contract otherwise.
    fn send(&self, committee_id: u64, t: Transfer) {
        if t.amount == 0 {
            return;
        }
        let c = self.committees.get(&committee_id).expect("No such committee");
        log!(
            "EVENT_JSON:{{\"standard\":\"committee\",\"version\":\"1.0.0\",\"event\":\"transfer\",\"data\":[{{\"committee_id\":{},\"to\":\"{}\",\"amount\":\"{}\",\"via\":\"{}\"}}]}}",
            committee_id, t.to, t.amount, if c.dao.is_some() { "dao" } else { "contract" }
        );
        match &c.dao {
            Some(dao) => {
                let args = json!({
                    "proposal": {
                        "description": format!("Committee #{} round {}: pay {} by the committee's rules", committee_id, c.round, t.to),
                        "kind": transfer_kind(&c.token, &t.to, t.amount),
                    }
                });
                Promise::new(dao.clone())
                    .function_call(
                        "add_proposal".to_string(),
                        serde_json::to_vec(&args).unwrap(),
                        NearToken::from_yoctonear(0),
                        GAS_FOR_ADD_PROPOSAL,
                    )
                    .then(
                        Self::ext(env::current_account_id())
                            .with_static_gas(GAS_FOR_ON_PROPOSAL_ADDED)
                            .on_proposal_added(committee_id, t.to, U128(t.amount)),
                    )
                    .detach();
            }
            None => {
                ext_ft::ext(c.token.clone())
                    .with_attached_deposit(ONE_YOCTO)
                    .with_static_gas(GAS_FOR_FT_TRANSFER)
                    .ft_transfer(t.to.clone(), U128(t.amount), Some(format!("committee {}", committee_id)))
                    .then(
                        Self::ext(env::current_account_id())
                            .with_static_gas(GAS_FOR_CALLBACK)
                            .on_payout(committee_id, t.to, U128(t.amount)),
                    )
                    .detach();
            }
        }
    }
}

fn owed_key(committee_id: u64, account_id: &AccountId) -> String {
    format!("{}:{}", committee_id, account_id)
}

/// Sputnik's Transfer proposal kind for a fungible-token payment.
fn transfer_kind(token: &AccountId, to: &AccountId, amount: u128) -> near_sdk::serde_json::Value {
    json!({ "Transfer": { "token_id": token, "receiver_id": to, "amount": U128(amount), "msg": null } })
}

fn now_ms() -> u64 {
    env::block_timestamp_ms()
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{get_created_receipts, get_logs, VMContextBuilder};
    use near_sdk::{testing_env, PromiseResult};

    fn acc(s: &str) -> AccountId {
        s.parse().unwrap()
    }

    fn ctx(predecessor: &str, ts_ms: u64, deposit: NearToken) -> VMContextBuilder {
        let mut b = VMContextBuilder::new();
        b.current_account_id(acc("app.fatneek.testnet"))
            .predecessor_account_id(acc(predecessor))
            .block_timestamp(ts_ms * 1_000_000)
            .attached_deposit(deposit)
            .random_seed([3u8; 32]);
        b
    }

    fn set(predecessor: &str, ts_ms: u64) {
        testing_env!(ctx(predecessor, ts_ms, NearToken::from_yoctonear(0)).build());
    }

    /// Run a private callback as the contract, with the given promise result.
    fn callback(ts_ms: u64, result: PromiseResult) {
        let b = ctx("app.fatneek.testnet", ts_ms, NearToken::from_yoctonear(0));
        testing_env!(
            b.build(),
            near_sdk::test_vm_config(),
            near_sdk::RuntimeFeesConfig::test(),
            Default::default(),
            vec![result]
        );
    }

    fn pay(c: &mut Contract, who: &str, action: &str, id: u64, amount: u128, ts: u64) {
        set("usd.testnet", ts);
        let msg = format!("{{\"action\":\"{}\",\"committee_id\":{}}}", action, id);
        let _ = c.ft_on_transfer(acc(who), U128(amount), msg);
    }

    const MEMBERS: [&str; 3] = ["ayesha.testnet", "bilal.testnet", "sara.testnet"];

    fn new_contract() -> Contract {
        set("owner.testnet", 0);
        Contract::new(acc("owner.testnet"), acc("usd.testnet"), Some(acc("sputnikv2.testnet")))
    }

    fn setup() -> (Contract, u64) {
        let mut c = new_contract();
        set("ayesha.testnet", 0);
        let id = c.create_committee("Family".into(), U128(100), 3, 60, None);
        for who in MEMBERS {
            pay(&mut c, who, "join", id, 100, 0);
        }
        set("ayesha.testnet", 0);
        c.start(id);
        (c, id)
    }

    fn setup_dao() -> (Contract, u64) {
        let mut c = new_contract();
        testing_env!(ctx("ayesha.testnet", 0, DAO_DEPOSIT).build());
        let id = c.create_committee("Family".into(), U128(100), 3, 60, None);
        callback(0, PromiseResult::Successful(b"true".to_vec()));
        assert!(c.on_dao_created(id, acc("ayesha.testnet"), DAO_DEPOSIT, Ok(true)));
        for who in MEMBERS {
            pay(&mut c, who, "join", id, 100, 0);
        }
        set("ayesha.testnet", 0);
        c.start(id);
        (c, id)
    }

    fn receipt_methods() -> Vec<(String, String)> {
        get_created_receipts()
            .iter()
            .flat_map(|r| {
                let to = r.receiver_id.to_string();
                r.actions.iter().filter_map(move |a| match a {
                    near_sdk::mock::MockAction::FunctionCallWeight { method_name, .. } => {
                        Some((to.clone(), String::from_utf8(method_name.clone()).unwrap()))
                    }
                    _ => None,
                })
            })
            .collect()
    }

    #[test]
    fn full_committee_through_the_contract() {
        let (mut c, id) = setup();
        let mut ts = 0;
        for _ in 0..3 {
            ts += 61_000;
            for who in MEMBERS {
                pay(&mut c, who, "contribute", id, 100, ts);
            }
            set("anyone.testnet", ts);
            assert!(c.advance_round(id).0 > 0);
        }
        let v = c.get_committee(id).unwrap();
        assert_eq!(v.committee.status, Status::Finished);
        let mut returned = 0;
        for who in MEMBERS {
            set(who, ts);
            returned += c.claim(id).0;
            let r = c.get_reputation(acc(who));
            assert_eq!(r.record.finished, 1);
            assert_eq!(r.record.on_time, 3);
            assert_eq!(r.holdback_bps, 2_500, "one finished committee lowers holdback");
        }
        assert!(returned >= 300);
        assert_eq!(c.get_committee(id).unwrap().held.0, 0);
        assert!(get_logs().iter().any(|l| l.contains("\"via\":\"contract\"")));
    }

    #[test]
    fn creating_with_a_deposit_asks_the_factory_for_a_dao_ruled_only_by_the_contract() {
        let mut c = new_contract();
        testing_env!(ctx("ayesha.testnet", 0, DAO_DEPOSIT).build());
        let id = c.create_committee("Family".into(), U128(100), 3, 60, None);
        let v = c.get_committee(id).unwrap();
        assert_eq!(v.committee.dao, Some(acc("app-fatneek-1.sputnikv2.testnet")));
        assert!(!v.committee.dao_ready);
        let calls = receipt_methods();
        assert!(calls.contains(&("sputnikv2.testnet".into(), "create".into())));
        let policy = c.get_dao_policy();
        assert_eq!(policy["roles"][0]["kind"]["Group"][0], "app.fatneek.testnet");
        assert_eq!(policy["roles"][1]["permissions"][0], "vote:AddProposal");
        assert_eq!(policy["proposal_bond"], "0");
    }

    #[test]
    #[should_panic(expected = "DAO is still being created")]
    fn no_money_is_accepted_before_the_dao_exists() {
        let mut c = new_contract();
        testing_env!(ctx("ayesha.testnet", 0, DAO_DEPOSIT).build());
        let id = c.create_committee("Family".into(), U128(100), 3, 60, None);
        pay(&mut c, "bilal.testnet", "join", id, 100, 0);
    }

    #[test]
    #[should_panic(expected = "Attach 6 NEAR")]
    fn too_small_a_dao_deposit_is_refused() {
        let mut c = new_contract();
        testing_env!(ctx("ayesha.testnet", 0, NearToken::from_near(1)).build());
        c.create_committee("Family".into(), U128(100), 3, 60, None);
    }

    #[test]
    fn failed_dao_creation_falls_back_and_refunds_the_organizer() {
        let mut c = new_contract();
        testing_env!(ctx("ayesha.testnet", 0, DAO_DEPOSIT).build());
        let id = c.create_committee("Family".into(), U128(100), 3, 60, None);
        callback(0, PromiseResult::Failed);
        assert!(!c.on_dao_created(id, acc("ayesha.testnet"), DAO_DEPOSIT, Err(PromiseError::Failed)));
        assert_eq!(c.get_committee(id).unwrap().committee.dao, None);
        set("ayesha.testnet", 1);
        let _ = c.withdraw_near_refund();
    }

    #[test]
    fn payments_go_straight_to_the_dao() {
        let (mut c, id) = setup_dao();
        pay(&mut c, "bilal.testnet", "contribute", id, 100, 1);
        let calls = receipt_methods();
        assert!(calls.contains(&("usd.testnet".into(), "ft_transfer".into())));
        assert!(calls.contains(&("app.fatneek.testnet".into(), "on_forwarded".into())));
    }

    #[test]
    fn dao_payout_files_a_transfer_proposal_then_approves_it() {
        let (mut c, id) = setup_dao();
        for who in MEMBERS {
            pay(&mut c, who, "contribute", id, 100, 61_000);
        }
        set("anyone.testnet", 61_000);
        c.advance_round(id);
        let dao = "app-fatneek-1.sputnikv2.testnet".to_string();
        assert!(receipt_methods().contains(&(dao.clone(), "add_proposal".into())));
        assert!(get_logs().iter().any(|l| l.contains("\"via\":\"dao\"")));

        // The DAO answers with proposal id 4; the contract approves it.
        callback(61_000, PromiseResult::Successful(b"4".to_vec()));
        let winner = c.get_committee(id).unwrap().committee.events.iter().rev()
            .find(|e| e.kind == EventKind::Payout).unwrap().account_id.clone().unwrap();
        let _ = c.on_proposal_added(id, winner.clone(), U128(150), Ok(4));
        assert!(receipt_methods().contains(&(dao, "act_proposal".into())));
        let ev = c.get_committee(id).unwrap().committee.events.last().cloned().unwrap();
        assert_eq!(ev.kind, EventKind::DaoProposal);
        assert_eq!(ev.note.as_deref(), Some("proposal 4"));
    }

    #[test]
    fn a_failed_payout_is_owed_and_can_be_retried() {
        let (mut c, id) = setup_dao();
        callback(1, PromiseResult::Failed);
        c.on_payout(id, acc("bilal.testnet"), U128(150), Err(PromiseError::Failed));
        assert_eq!(c.get_owed(id, acc("bilal.testnet")).0, 150);
        set("anyone.testnet", 2);
        assert_eq!(c.retry_payout(id, acc("bilal.testnet")).0, 150);
        assert_eq!(c.get_owed(id, acc("bilal.testnet")).0, 0);
    }

    #[test]
    fn a_failed_forward_is_tracked_and_can_be_retried() {
        let (mut c, id) = setup_dao();
        callback(1, PromiseResult::Failed);
        c.on_forwarded(id, U128(100), Err(PromiseError::Failed));
        assert_eq!(c.get_committee(id).unwrap().unforwarded.0, 100);
        set("anyone.testnet", 2);
        assert_eq!(c.retry_forward(id).0, 100);
        assert_eq!(c.get_committee(id).unwrap().unforwarded.0, 0);
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
            for who in MEMBERS {
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
