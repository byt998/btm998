create table if not exists kpp_questions (
  id uuid primary key default gen_random_uuid(),
  question_text text not null,
  answer_a text not null,
  answer_b text not null,
  answer_c text not null,
  answer_d text not null,
  answer_e text not null,
  correct_answer text not null check (correct_answer in ('a', 'b', 'c', 'd', 'e')),
  sort_order integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists kpp_questions_active_sort_idx
  on kpp_questions (is_active, sort_order, id);

alter table kpp_questions enable row level security;

grant select on table kpp_questions to authenticated;

drop policy if exists "kpp_questions_select_auth" on kpp_questions;
create policy "kpp_questions_select_auth"
  on kpp_questions
  for select
  to authenticated
  using (true);
