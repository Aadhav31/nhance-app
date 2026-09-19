-- The daily-log RPCs do not need to bypass RLS. Run them with caller
-- privileges so the table policies remain an independent authorization layer.
alter function public.save_daily_log_batch(jsonb, boolean) security invoker;
alter function public.review_daily_logs(uuid[], text, text) security invoker;

notify pgrst, 'reload schema';
