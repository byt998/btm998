-- Cleanup: remove legacy shift messages backend objects
-- Run in Supabase SQL Editor.

begin;

-- Drop RPC functions used by the removed shift-messages UI (all overloads in public schema).
do $$
declare
  fn record;
begin
  for fn in
    select
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as identity_args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('purge_expired_shift_messages', 'delete_shift_message_group')
  loop
    execute format(
      'drop function if exists %I.%I(%s);',
      fn.schema_name,
      fn.function_name,
      fn.identity_args
    );
  end loop;
end $$;

drop table if exists public.shift_messages;

commit;
