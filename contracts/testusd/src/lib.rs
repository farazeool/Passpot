//! testUSD: free test dollars for trying Committee on NEAR testnet.
//!
//! A standard NEP-141 token with two conveniences for demos:
//! - `faucet()` gives the caller 1,000 tUSD (up to a 10,000 tUSD balance);
//! - accounts are registered automatically on first use, so nobody has to
//!   pay a storage deposit before receiving test dollars.
//! The token contract pays that storage itself. Not for real money.

use near_contract_standards::fungible_token::core::FungibleTokenCore;
use near_contract_standards::fungible_token::events::FtMint;
use near_contract_standards::fungible_token::metadata::{
    FungibleTokenMetadata, FungibleTokenMetadataProvider, FT_METADATA_SPEC,
};
use near_contract_standards::fungible_token::resolver::FungibleTokenResolver;
use near_contract_standards::fungible_token::FungibleToken;
use near_contract_standards::storage_management::{
    StorageBalance, StorageBalanceBounds, StorageManagement,
};
use near_sdk::json_types::U128;
use near_sdk::{env, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault, PromiseOrValue};

/// 6 decimals, like USDC.
pub const ONE_USD: u128 = 1_000_000;
pub const FAUCET_AMOUNT: u128 = 1_000 * ONE_USD;
pub const FAUCET_MAX_BALANCE: u128 = 10_000 * ONE_USD;

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
enum StorageKey {
    Accounts,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    token: FungibleToken,
}

#[near]
impl Contract {
    #[init]
    pub fn new() -> Self {
        Self { token: FungibleToken::new(StorageKey::Accounts) }
    }

    /// Give the caller 1,000 test dollars.
    pub fn faucet(&mut self) -> U128 {
        let who = env::predecessor_account_id();
        self.ensure_registered(&who);
        let balance = self.token.internal_unwrap_balance_of(&who);
        require!(balance < FAUCET_MAX_BALANCE, "You already have plenty of test dollars");
        let amount = FAUCET_AMOUNT.min(FAUCET_MAX_BALANCE - balance);
        self.token.internal_deposit(&who, amount);
        FtMint { owner_id: &who, amount: U128(amount), memo: Some("faucet") }.emit();
        U128(balance + amount)
    }

    /// Register any account at the token's expense (e.g. the Committee contract).
    pub fn register(&mut self, account_id: AccountId) {
        self.ensure_registered(&account_id);
    }
}

impl Contract {
    fn ensure_registered(&mut self, account_id: &AccountId) {
        if !self.token.accounts.contains_key(account_id) {
            self.token.internal_register_account(account_id);
        }
    }
}

#[near]
impl FungibleTokenCore for Contract {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.ensure_registered(&receiver_id);
        self.token.ft_transfer(receiver_id, amount, memo)
    }

    #[payable]
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        self.ensure_registered(&receiver_id);
        self.token.ft_transfer_call(receiver_id, amount, memo, msg)
    }

    fn ft_total_supply(&self) -> U128 {
        self.token.ft_total_supply()
    }

    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.token.ft_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenResolver for Contract {
    #[private]
    fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        let (used, burned) = self.token.internal_ft_resolve_transfer(&sender_id, receiver_id, amount);
        if burned > 0 {
            self.token.total_supply -= burned;
        }
        used.into()
    }
}

#[near]
impl StorageManagement for Contract {
    #[payable]
    fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }

    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }

    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        self.token.internal_storage_unregister(force).is_some()
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenMetadataProvider for Contract {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        FungibleTokenMetadata {
            spec: FT_METADATA_SPEC.to_string(),
            name: "Test USD (Committee demo)".to_string(),
            symbol: "tUSD".to_string(),
            icon: Some("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%231f7a5a'/%3E%3Ctext x='16' y='22' font-size='16' text-anchor='middle' fill='white' font-family='Arial'%3E$%3C/text%3E%3C/svg%3E".to_string()),
            reference: None,
            reference_hash: None,
            decimals: 6,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    fn as_caller(who: &str, deposit: u128) {
        let mut b = VMContextBuilder::new();
        b.current_account_id("usd.testnet".parse().unwrap())
            .predecessor_account_id(who.parse().unwrap())
            .attached_deposit(NearToken::from_yoctonear(deposit));
        testing_env!(b.build());
    }

    #[test]
    fn faucet_gives_test_dollars_up_to_a_cap() {
        as_caller("ayesha.testnet", 0);
        let mut t = Contract::new();
        assert_eq!(t.faucet().0, FAUCET_AMOUNT);
        for _ in 0..9 {
            t.faucet();
        }
        assert_eq!(t.ft_balance_of("ayesha.testnet".parse().unwrap()).0, FAUCET_MAX_BALANCE);
        assert_eq!(t.ft_total_supply().0, FAUCET_MAX_BALANCE);
    }

    #[test]
    #[should_panic(expected = "plenty of test dollars")]
    fn faucet_stops_at_the_cap() {
        as_caller("ayesha.testnet", 0);
        let mut t = Contract::new();
        for _ in 0..11 {
            t.faucet();
        }
    }

    #[test]
    fn transfers_register_new_receivers_automatically() {
        as_caller("ayesha.testnet", 0);
        let mut t = Contract::new();
        t.faucet();
        as_caller("ayesha.testnet", 1);
        t.ft_transfer("bilal.testnet".parse().unwrap(), U128(5 * ONE_USD), None);
        assert_eq!(t.ft_balance_of("bilal.testnet".parse().unwrap()).0, 5 * ONE_USD);
    }

    #[test]
    fn metadata_is_valid() {
        as_caller("ayesha.testnet", 0);
        let t = Contract::new();
        t.ft_metadata().assert_valid();
    }
}
