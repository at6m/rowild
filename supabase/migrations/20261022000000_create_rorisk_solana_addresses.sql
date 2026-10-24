-- Permanent per-user Solana deposit addresses, derived from one dedicated seed
-- (SOLANA_DEPOSIT_MNEMONIC). Funds arriving at a derived address are credited to
-- the owning account and then swept to SOLANA_RECIPIENT_WALLET.
create table if not exists public.rorisk_solana_addresses (
  user_uuid uuid primary key references public.rorisk_users(uuid) on delete cascade,
  derivation_index integer not null unique check (derivation_index >= 0),
  address text not null unique,
  last_signature text,
  last_swept_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.rorisk_solana_addresses enable row level security;
revoke all on public.rorisk_solana_addresses from public, anon, authenticated;
grant select, insert, update, delete on public.rorisk_solana_addresses to service_role;

comment on table public.rorisk_solana_addresses is
  'One permanent Solana deposit address per RoRisk account, derived on the server. Private keys never leave the server.';
