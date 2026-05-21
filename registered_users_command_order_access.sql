grant select, insert, update on public.registered_users to authenticated;

alter table public.registered_users enable row level security;

create or replace function public.current_user_shift_code()
returns text
language sql
stable
security definer
set search_path = public
as $$
    select ru.shift_code
    from public.registered_users ru
    where ru.user_id = auth.uid()
    limit 1;
$$;

create or replace function public.current_user_can_manage_command_order()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select coalesce((
        select ru.can_manage_command_order
        from public.registered_users ru
        where ru.user_id = auth.uid()
        limit 1
    ), false);
$$;

create or replace function public.current_user_is_dowodca()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select coalesce((
        select ru.dowodca
        from public.registered_users ru
        where ru.user_id = auth.uid()
        limit 1
    ), false);
$$;

grant execute on function public.current_user_shift_code() to authenticated;
grant execute on function public.current_user_can_manage_command_order() to authenticated;
grant execute on function public.current_user_is_dowodca() to authenticated;

drop policy if exists registered_users_select_for_command_order on public.registered_users;
create policy registered_users_select_for_command_order
on public.registered_users
for select
to authenticated
using (
    user_id = auth.uid()
    or public.current_user_can_manage_command_order()
    or public.current_user_shift_code() = 'biuro'
    or shift_code = public.current_user_shift_code()
    or shift_code = 'biuro'
);

drop policy if exists registered_users_insert_own_profile on public.registered_users;
create policy registered_users_insert_own_profile
on public.registered_users
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists registered_users_update_own_profile on public.registered_users;
create policy registered_users_update_own_profile
on public.registered_users
for update
to authenticated
using (
    user_id = auth.uid()
    or public.current_user_can_manage_command_order()
)
with check (
    user_id = auth.uid()
    or public.current_user_can_manage_command_order()
);
