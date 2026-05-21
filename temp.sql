SELECT format('drop policy if exists %I_select on public.%I;', vehicle || ''_select'', vehicle)
FROM (VALUES ('vehicle_411_22')) AS t(vehicle);
