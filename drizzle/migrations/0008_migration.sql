create table public.paywave_payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  kind text not null check (kind in ('sms_recharge','subscription')),
  landlord_account_id uuid references public.landlord_accounts(id) on delete set null,
  amount numeric not null,
  months_covered integer not null default 0,
  phone_number text not null,
  transaction_request_id text,
  checkout_request_id text,
  merchant_request_id text,
  status text not null default 'pending' check (status in ('pending','success','failed')),
  result_desc text,
  mpesa_receipt_no text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.paywave_payments enable row level security;
create policy paywave_select_own on public.paywave_payments for select using (auth.uid() = owner_id);
revoke insert, update, delete on public.paywave_payments from authenticated;
create trigger paywave_payments_updated_at before update on public.paywave_payments for each row execute function public.set_updated_at();