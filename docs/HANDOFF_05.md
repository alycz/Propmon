# Handoff 05

Agent 05 deliverables are in place for the account registry and authorized-signer model.

## Contract

`contracts/src/registry/AccountRegistry.sol` implements `IAccountRegistry` with OpenZeppelin `AccessControl`.

Constructor:

```solidity
constructor(address admin)
```

Roles:

- `DEFAULT_ADMIN_ROLE`: grants and revokes registry roles.
- `VAULT_ROLE`: required for `register` and `setState`.

## ABI Surface

- `register(address owner) returns (uint256 accountId)`
- `ownerOf(uint256 accountId) returns (address)`
- `isAuthorizedSigner(uint256 accountId, address signer) returns (bool)`
- `stateOf(uint256 accountId) returns (AccountState)`
- `authorizeSigner(uint256 accountId, address signer)`
- `revokeSigner(uint256 accountId, address signer)`
- `setState(uint256 accountId, AccountState state)`

Events:

- `AccountRegistered(accountId, owner)`
- `SignerAuthorized(accountId, signer)`
- `SignerRevoked(accountId, signer)`
- `StateChanged(accountId, from, to)`

## Flow

`ExaminationVault.buyExamination` now calls `AccountRegistry.register(msg.sender)` and uses the returned account ID for its examination ledger. Registration sets the registry owner and moves the account from `NONE` to `EXAMINATION`.

Account owners call `authorizeSigner(accountId, signer)` to connect an agent key or secondary wallet. They call `revokeSigner(accountId, signer)` to remove it. The owner is always treated as authorized, even if they are not stored in the signer mapping.

Only contracts with `VAULT_ROLE` can call `setState`, so users and agent keys cannot self-promote accounts to `PASSED`, `FUNDED`, or `PAYOUT`.

## Integration Notes

The registry is mode-agnostic. Demo and live flows use the same account ownership, signer, and state checks.

`Deploy.s.sol` deploys `AccountRegistry` first and writes its address to `shared/deployments.json`. If `EXAMINATION_VAULT_ADDRESS` or `FUNDED_VAULT_ADDRESS` are supplied, the deploy script grants each address `VAULT_ROLE`.

Agent 07 should surface signer authorization as an owner-only action. Agent 06 should use a user-authorized signer key for both examination entries and funded orders; vaults check `isAuthorizedSigner` through the same interface for manual wallets and agents.

## Validation

Run:

```bash
pnpm install --frozen-lockfile
forge test --root contracts
```
