# newrons-escrow — deploy guide (devnet)

Two-Stage Escrow program for Rhythmic OS Phase 1. The API (`apps/api`,
`ESCROW_MODE=nxt-reserve`) runs the same state machine off-chain today; this
program is the on-chain anchor. Deploy needs a Linux/macOS box with the
Solana + Anchor toolchains (not available on the current Windows build host —
see "Blocked" below).

## Build & test (toolchain host)

```bash
cargo install --git https://github.com/coral-xyz/anchor anchor-cli --tag v0.30.1
solana-keygen new -o ~/.config/solana/id.json
solana config set --url devnet
anchor build
anchor test          # spins solana-test-validator locally
```

## Deploy

```bash
anchor deploy --provider.cluster devnet
# copy the program id into:
#   1. declare_id!(...) in src/lib.rs
#   2. apps/api .env → ESCROW_PROGRAM_ID=<id>, ESCROW_MODE=onchain
```

## Post-deploy checklist

- [ ] `anchor verify` / audit before any real value ( devnet first, always )
- [ ] API `solana-escrow.client.ts` PDA tests pass against the deployed id
- [ ] Release flow e2e on devnet explorer (lock → accept → release → close)
- [ ] Impact Analysis updated with the on-chain trust assumptions

## Blocked on this host

`cargo`, `anchor`, `solana` CLIs are absent (Windows, no WSL). Program ships
uncompiled but complete; the TS mirror (`rhythmic-escrow.logic.ts`) is unit
tested and seed-compatible by construction (same `"escrow"` seed string,
same field order). Do NOT mark VS2 on-chain done until `anchor test` is green.
