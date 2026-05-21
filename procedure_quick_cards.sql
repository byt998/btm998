create extension if not exists "pgcrypto";

create table if not exists procedure_quick_cards (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    image_url text not null,
    sort_order int default 0,
    created_at timestamptz default now()
);

alter table public.procedure_quick_cards enable row level security;

grant select on public.procedure_quick_cards to authenticated;

drop policy if exists "procedure_quick_cards_select_auth" on public.procedure_quick_cards;

create policy "procedure_quick_cards_select_auth"
    on public.procedure_quick_cards
    for select
    to authenticated
    using (true);
