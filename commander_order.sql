alter table if exists public.registered_users
    add column if not exists ratownik boolean not null default false,
    add column if not exists dowodca boolean not null default false,
    add column if not exists kierowca boolean not null default false,
    add column if not exists nurek boolean not null default false,
    add column if not exists can_manage_command_order boolean not null default false;

create table if not exists public.command_orders (
    id uuid primary key default gen_random_uuid(),
    order_date date not null,
    shift_code text not null check (shift_code in ('zmiana-1', 'zmiana-2', 'zmiana-3')),
    created_by uuid references auth.users(id) on delete set null,
    updated_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (order_date, shift_code)
);

create table if not exists public.command_order_presence (
    id uuid primary key default gen_random_uuid(),
    order_date date not null,
    shift_code text not null check (shift_code in ('zmiana-1', 'zmiana-2', 'zmiana-3')),
    person_user_id uuid references auth.users(id) on delete set null,
    person_manual_name text,
    added_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    constraint command_order_presence_person_check
        check (
            (person_user_id is not null and coalesce(person_manual_name, '') = '')
            or
            (person_user_id is null and coalesce(person_manual_name, '') <> '')
        )
);

create unique index if not exists command_order_presence_unique_user
    on public.command_order_presence(order_date, shift_code, person_user_id)
    where person_user_id is not null;

create table if not exists public.command_order_assignments (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.command_orders(id) on delete cascade,
    vehicle_group_code text not null,
    slot_code text not null,
    slot_label text not null,
    required_role text not null,
    display_order integer not null default 1,
    planned_user_id uuid references auth.users(id) on delete set null,
    planned_manual_name text,
    current_user_id uuid references auth.users(id) on delete set null,
    current_manual_name text,
    source_type text not null default 'list' check (source_type in ('manual', 'list', 'auto_fill')),
    updated_by uuid references auth.users(id) on delete set null,
    updated_at timestamptz not null default now(),
    unique (order_id, vehicle_group_code, slot_code)
);

create index if not exists command_orders_shift_date_idx
    on public.command_orders(shift_code, order_date desc);

create index if not exists command_order_presence_shift_date_idx
    on public.command_order_presence(shift_code, order_date desc);

create index if not exists command_order_assignments_order_idx
    on public.command_order_assignments(order_id, vehicle_group_code, display_order);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists command_orders_touch_updated_at on public.command_orders;
create trigger command_orders_touch_updated_at
before update on public.command_orders
for each row execute function public.touch_updated_at();

drop trigger if exists command_order_assignments_touch_updated_at on public.command_order_assignments;
create trigger command_order_assignments_touch_updated_at
before update on public.command_order_assignments
for each row execute function public.touch_updated_at();

alter table public.command_orders enable row level security;
alter table public.command_order_presence enable row level security;
alter table public.command_order_assignments enable row level security;

grant select, insert, update, delete on public.command_orders to authenticated;
grant select, insert, update, delete on public.command_order_presence to authenticated;
grant select, insert, update, delete on public.command_order_assignments to authenticated;

drop policy if exists command_orders_select_policy on public.command_orders;
create policy command_orders_select_policy
on public.command_orders
for select
to authenticated
using (
    exists (
        select 1
        from public.registered_users ru
        where ru.user_id = auth.uid()
          and (
              ru.can_manage_command_order = true
              or ru.shift_code = 'biuro'
              or ru.shift_code = command_orders.shift_code
          )
    )
);

drop policy if exists command_orders_modify_policy on public.command_orders;
create policy command_orders_modify_policy
on public.command_orders
for all
to authenticated
using (
    exists (
        select 1
        from public.registered_users ru
        where ru.user_id = auth.uid()
          and (
              ru.can_manage_command_order = true
              or (ru.dowodca = true and (ru.shift_code = command_orders.shift_code or ru.shift_code = 'biuro'))
          )
    )
)
with check (
    exists (
        select 1
        from public.registered_users ru
        where ru.user_id = auth.uid()
          and (
              ru.can_manage_command_order = true
              or (ru.dowodca = true and (ru.shift_code = command_orders.shift_code or ru.shift_code = 'biuro'))
          )
    )
);

drop policy if exists command_order_presence_select_policy on public.command_order_presence;
create policy command_order_presence_select_policy
on public.command_order_presence
for select
to authenticated
using (
    exists (
        select 1
        from public.registered_users ru
        where ru.user_id = auth.uid()
          and (
              ru.can_manage_command_order = true
              or ru.shift_code = 'biuro'
              or ru.shift_code = command_order_presence.shift_code
          )
    )
);

drop policy if exists command_order_presence_modify_policy on public.command_order_presence;
create policy command_order_presence_modify_policy
on public.command_order_presence
for all
to authenticated
using (
    exists (
        select 1
        from public.registered_users ru
        where ru.user_id = auth.uid()
          and (
              ru.can_manage_command_order = true
              or (ru.dowodca = true and (ru.shift_code = command_order_presence.shift_code or ru.shift_code = 'biuro'))
          )
    )
)
with check (
    exists (
        select 1
        from public.registered_users ru
        where ru.user_id = auth.uid()
          and (
              ru.can_manage_command_order = true
              or (ru.dowodca = true and (ru.shift_code = command_order_presence.shift_code or ru.shift_code = 'biuro'))
          )
    )
);

drop policy if exists command_order_assignments_select_policy on public.command_order_assignments;
create policy command_order_assignments_select_policy
on public.command_order_assignments
for select
to authenticated
using (
    exists (
        select 1
        from public.command_orders co
        join public.registered_users ru on ru.user_id = auth.uid()
        where co.id = command_order_assignments.order_id
          and (
              ru.can_manage_command_order = true
              or ru.shift_code = 'biuro'
              or ru.shift_code = co.shift_code
          )
    )
);

drop policy if exists command_order_assignments_modify_policy on public.command_order_assignments;
create policy command_order_assignments_modify_policy
on public.command_order_assignments
for all
to authenticated
using (
    exists (
        select 1
        from public.command_orders co
        join public.registered_users ru on ru.user_id = auth.uid()
        where co.id = command_order_assignments.order_id
          and (
              ru.can_manage_command_order = true
              or (ru.dowodca = true and (ru.shift_code = co.shift_code or ru.shift_code = 'biuro'))
          )
    )
)
with check (
    exists (
        select 1
        from public.command_orders co
        join public.registered_users ru on ru.user_id = auth.uid()
        where co.id = command_order_assignments.order_id
          and (
              ru.can_manage_command_order = true
              or (ru.dowodca = true and (ru.shift_code = co.shift_code or ru.shift_code = 'biuro'))
          )
    )
);
