do $$
begin
  create type duty_measure_device_status_type as enum ('ok', 'missing', 'broken');
exception
  when duplicate_object then null;
end
$$;

create table if not exists duty_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  norm_qty integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists duty_items_name_uidx
  on duty_items (name);

create table if not exists duty_measure_devices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists duty_measure_devices_name_uidx
  on duty_measure_devices (name);

create table if not exists duty_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  shift_code text not null,
  created_by uuid not null
);

create index if not exists duty_reports_created_at_idx
  on duty_reports (created_at desc);

create index if not exists duty_reports_shift_code_idx
  on duty_reports (shift_code, created_at desc);

create table if not exists duty_report_lines (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references duty_reports(id) on delete cascade,
  item_id uuid not null references duty_items(id),
  norm_qty integer not null default 0,
  have_qty integer not null default 0,
  missing_qty integer not null default 0,
  broken_qty integer not null default 0,
  note text,
  photo_path text,
  updated_at timestamptz not null default now()
);

alter table duty_report_lines
  add column if not exists photo_path text;

create unique index if not exists duty_report_lines_report_item_uidx
  on duty_report_lines (report_id, item_id);

create index if not exists duty_report_lines_report_idx
  on duty_report_lines (report_id);

create table if not exists duty_measure_device_status (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references duty_reports(id) on delete cascade,
  device_id uuid not null references duty_measure_devices(id),
  status duty_measure_device_status_type not null default 'ok',
  note text,
  photo_path text,
  updated_at timestamptz not null default now()
);

create unique index if not exists duty_measure_device_status_report_device_uidx
  on duty_measure_device_status (report_id, device_id);

create index if not exists duty_measure_device_status_report_idx
  on duty_measure_device_status (report_id);

insert into duty_items (name, norm_qty, is_active)
values
  ('Radiostacje', 0, true),
  ('Baterie', 0, true),
  ('Latarki', 0, true),
  ('Urządzenia Pomiarowe', 0, true)
on conflict (name) do nothing;

-- Tabela duty_measure_devices jest niezalezna od measurement_devices.
-- Nazwy urzadzen wpisujesz recznie w Supabase bezposrednio do duty_measure_devices.
--
-- Przyklad:
-- insert into duty_measure_devices (name, is_active)
-- values
--   ('Miernik wielogazowy 1', true),
--   ('Detektor CO 2', true);

drop view if exists duty_latest_report_lines;

create view duty_latest_report_lines as
with latest_report as (
  select id, created_at, shift_code, created_by
  from duty_reports
  order by created_at desc
  limit 1
)
select
  lr.id as report_id,
  lr.created_at,
  lr.shift_code,
  lr.created_by,
  dl.id as line_id,
  dl.item_id,
  di.name as item_name,
  dl.norm_qty,
  dl.have_qty,
  dl.missing_qty,
  dl.broken_qty,
  dl.note,
  dl.photo_path,
  dl.updated_at
from latest_report lr
join duty_report_lines dl on dl.report_id = lr.id
join duty_items di on di.id = dl.item_id
order by di.name;

alter table duty_items enable row level security;
alter table duty_measure_devices enable row level security;
alter table duty_reports enable row level security;
alter table duty_report_lines enable row level security;
alter table duty_measure_device_status enable row level security;

grant select on table duty_items to authenticated;
grant select on table duty_measure_devices to authenticated;
grant select, insert, update, delete on table duty_reports to authenticated;
grant select, insert, update, delete on table duty_report_lines to authenticated;
grant select, insert, update, delete on table duty_measure_device_status to authenticated;
grant select on table duty_latest_report_lines to authenticated;

drop policy if exists "duty_items_select_auth" on duty_items;
create policy "duty_items_select_auth"
  on duty_items
  for select
  to authenticated
  using (true);

drop policy if exists "duty_measure_devices_select_auth" on duty_measure_devices;
create policy "duty_measure_devices_select_auth"
  on duty_measure_devices
  for select
  to authenticated
  using (true);

drop policy if exists "duty_reports_select_auth" on duty_reports;
create policy "duty_reports_select_auth"
  on duty_reports
  for select
  to authenticated
  using (true);

drop policy if exists "duty_reports_insert_auth" on duty_reports;
create policy "duty_reports_insert_auth"
  on duty_reports
  for insert
  to authenticated
  with check (true);

drop policy if exists "duty_report_lines_select_auth" on duty_report_lines;
create policy "duty_report_lines_select_auth"
  on duty_report_lines
  for select
  to authenticated
  using (true);

drop policy if exists "duty_report_lines_insert_auth" on duty_report_lines;
create policy "duty_report_lines_insert_auth"
  on duty_report_lines
  for insert
  to authenticated
  with check (true);

drop policy if exists "duty_measure_device_status_select_auth" on duty_measure_device_status;
create policy "duty_measure_device_status_select_auth"
  on duty_measure_device_status
  for select
  to authenticated
  using (true);

drop policy if exists "duty_measure_device_status_insert_auth" on duty_measure_device_status;
create policy "duty_measure_device_status_insert_auth"
  on duty_measure_device_status
  for insert
  to authenticated
  with check (true);

grant usage on schema storage to authenticated;
grant select, insert, update on table storage.objects to authenticated;

drop policy if exists "issue_photos_select_auth" on storage.objects;
create policy "issue_photos_select_auth"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'issue-photos');

drop policy if exists "issue_photos_insert_auth" on storage.objects;
create policy "issue_photos_insert_auth"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'issue-photos');

drop policy if exists "issue_photos_update_auth" on storage.objects;
create policy "issue_photos_update_auth"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'issue-photos')
  with check (bucket_id = 'issue-photos');
