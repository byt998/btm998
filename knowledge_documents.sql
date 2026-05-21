create extension if not exists "pgcrypto";

create table if not exists knowledge_documents (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    pdf_url text not null,
    sort_order int default 0,
    created_at timestamptz default now()
);

alter table public.knowledge_documents enable row level security;

grant select on public.knowledge_documents to authenticated;

drop policy if exists "knowledge_documents_select_auth" on public.knowledge_documents;

create policy "knowledge_documents_select_auth"
    on public.knowledge_documents
    for select
    to authenticated
    using (true);
