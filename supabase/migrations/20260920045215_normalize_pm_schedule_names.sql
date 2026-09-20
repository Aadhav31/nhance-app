-- Normalize labels created from whole-hour service intervals after schedule seeding.
update public.pm_schedules
set schedule_name = regexp_replace(
  schedule_name,
  '^Standard ([0-9]+)\. hr Service$',
  E'Standard \\1 hr Service'
)
where schedule_name ~ '^Standard [0-9]+\. hr Service$';
