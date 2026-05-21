do $$
begin
  create type equipment_issue_status_type as enum ('broken', 'missing');
exception
  when duplicate_object then null;
end
$$;

create table if not exists equipment_issue_status (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null,
  equipment_name text,
  vehicle_code text,
  compartment_code text,
  shift_code text,
  status equipment_issue_status_type not null,
  note text,
  issue_photo_path text,
  updated_at timestamptz default now()
);

alter table equipment_issue_status
  add column if not exists shift_code text;

update equipment_issue_status
set shift_code = coalesce(nullif(shift_code, ''), 'legacy')
where shift_code is null
   or shift_code = '';

alter table equipment_issue_status
  alter column shift_code set not null;

alter table equipment_issue_status
  alter column updated_at set default now();

alter table equipment_issue_status
  drop constraint if exists equipment_issue_status_equipment_id_key;

drop index if exists equipment_issue_status_equipment_shift_uidx;

delete from equipment_issue_status a
using equipment_issue_status b
where a.equipment_id = b.equipment_id
  and a.id <> b.id
  and (
    a.updated_at < b.updated_at
    or (a.updated_at = b.updated_at and a.id::text < b.id::text)
  );

create unique index if not exists equipment_issue_status_equipment_id_uidx
  on equipment_issue_status (equipment_id);

create index if not exists equipment_issue_status_updated_at_idx
  on equipment_issue_status (updated_at desc);

create index if not exists equipment_issue_status_shift_vehicle_updated_idx
  on equipment_issue_status (shift_code, vehicle_code, updated_at desc);

create index if not exists equipment_issue_status_vehicle_shift_idx
  on equipment_issue_status (vehicle_code, shift_code);

create or replace view vehicle_totals as
select vehicle_code, sum(total_count)::bigint as total_count
from (
  select '411-22'::text as vehicle_code, count(*)::bigint as total_count from vehicle_411_22
  union all
  select '411-23'::text as vehicle_code, count(*)::bigint as total_count from vehicle_411_23
  union all
  select '411-25'::text as vehicle_code, count(*)::bigint as total_count from vehicle_411_25
  union all
  select '411-26'::text as vehicle_code, count(*)::bigint as total_count from vehicle_411_26
  union all
  select '411-43'::text as vehicle_code, count(*)::bigint as total_count from vehicle_411_43
  union all
  select '411-51'::text as vehicle_code, count(*)::bigint as total_count from vehicle_411_51
  union all
  select '411-59'::text as vehicle_code, count(*)::bigint as total_count from vehicle_411_59
  union all
  select '411-71'::text as vehicle_code, count(*)::bigint as total_count from vehicle_411_71
  union all
  select '411-91'::text as vehicle_code, count(*)::bigint as total_count from vehicle_411_91
  union all
  select '411-22-tyl'::text as vehicle_code, count(*)::bigint as total_count from vehicle_411_22_tyl
  union all
  select '411-23-tyl'::text as vehicle_code, count(*)::bigint as total_count from vehicle_411_23_tyl
) totals
group by vehicle_code;

create or replace function get_vehicle_totals()
returns table (
  vehicle_code text,
  total_count bigint
)
language sql
stable
as $$
  select vehicle_code, total_count
  from vehicle_totals
  order by vehicle_code;
$$;

create or replace function get_vehicle_total(p_vehicle_code text)
returns bigint
language sql
stable
as $$
  select coalesce(
    (
      select total_count
      from vehicle_totals
      where vehicle_code = p_vehicle_code
    ),
    0
  );
$$;

alter table equipment_issue_status enable row level security;

grant select, insert, update, delete on table equipment_issue_status to authenticated;
grant select on table vehicle_totals to authenticated;
grant execute on function get_vehicle_totals() to authenticated;
grant execute on function get_vehicle_total(text) to authenticated;

drop policy if exists "equipment_issue_status_select_auth" on equipment_issue_status;
create policy "equipment_issue_status_select_auth"
  on equipment_issue_status
  for select
  to authenticated
  using (true);

drop policy if exists "equipment_issue_status_insert_auth" on equipment_issue_status;
create policy "equipment_issue_status_insert_auth"
  on equipment_issue_status
  for insert
  to authenticated
  with check (true);

drop policy if exists "equipment_issue_status_update_auth" on equipment_issue_status;
create policy "equipment_issue_status_update_auth"
  on equipment_issue_status
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "equipment_issue_status_delete_auth" on equipment_issue_status;
create policy "equipment_issue_status_delete_auth"
  on equipment_issue_status
  for delete
  to authenticated
  using (true);
