create table if not exists public.vehicle_crews (
    id uuid primary key default gen_random_uuid(),
    crew_date date not null,
    shift_code text not null check (shift_code in ('zmiana-1', 'zmiana-2', 'zmiana-3', 'biuro')),
    vehicle_code text not null,
    slot_code text not null,
    slot_label text not null,
    required_role text not null check (required_role in ('dowodca', 'kierowca', 'ratownik', 'nurek')),
    assigned_user_id uuid references auth.users(id) on delete set null,
    assigned_manual_name text,
    updated_by uuid references auth.users(id) on delete set null,
    updated_at timestamptz not null default now(),
    constraint vehicle_crews_assignee_check
        check (
            (assigned_user_id is not null and coalesce(assigned_manual_name, '') = '')
            or
            (assigned_user_id is null and coalesce(assigned_manual_name, '') <> '')
        ),
    unique (crew_date, shift_code, vehicle_code, slot_code)
);

create index if not exists vehicle_crews_date_shift_idx
    on public.vehicle_crews(crew_date desc, shift_code, vehicle_code);

create or replace function public.touch_vehicle_crews_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists vehicle_crews_touch_updated_at on public.vehicle_crews;
create trigger vehicle_crews_touch_updated_at
before update on public.vehicle_crews
for each row execute function public.touch_vehicle_crews_updated_at();

grant select, insert, update, delete on public.vehicle_crews to authenticated;

alter table public.vehicle_crews enable row level security;

drop policy if exists vehicle_crews_select_policy on public.vehicle_crews;
create policy vehicle_crews_select_policy
on public.vehicle_crews
for select
to authenticated
using (
    public.current_user_can_manage_command_order()
    or public.current_user_shift_code() = 'biuro'
    or shift_code = public.current_user_shift_code()
);

drop policy if exists vehicle_crews_modify_policy on public.vehicle_crews;
create policy vehicle_crews_modify_policy
on public.vehicle_crews
for all
to authenticated
using (
    public.current_user_can_manage_command_order()
    or (
        public.current_user_is_dowodca()
        and (
            shift_code = public.current_user_shift_code()
            or public.current_user_shift_code() = 'biuro'
        )
    )
)
with check (
    public.current_user_can_manage_command_order()
    or (
        public.current_user_is_dowodca()
        and (
            shift_code = public.current_user_shift_code()
            or public.current_user_shift_code() = 'biuro'
        )
    )
);
