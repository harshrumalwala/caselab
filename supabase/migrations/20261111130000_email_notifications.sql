-- CaseLab: email notifications for practice requests.
--
-- Two events send an email (through Resend, from the project's own sender address): someone asks you to case, and someone accepts
-- your request. Declines never email anyone, and chat messages are not emailed. The email says who and links to CaseLab; it never
-- carries the case, the note or a message.
--
-- The sending itself is a small Supabase Edge Function (supabase/functions/notify-request). This migration adds the two things it needs
-- from the database:
--
--   * `notification_settings`: a member's choice to get these emails. PRIVATE to the member (row level security, own row only), and kept
--     out of `profiles` so that other members, who can read profiles, can't see whether someone has emails on. No row means "on": the
--     default is on, and a member turns it off in Profile & privacy. Deleted with the account (on delete cascade).
--
--   * `practice_requests.emailed_at` and `answer_emailed_at`: when each email was sent, so a request is emailed about once per event
--     however many times the function is called. These columns are read and written only by the function (the table is closed to the
--     API roles), and `my_practice_requests()` doesn't return them, so a member never sees them.
--
-- Additive: one table, two columns. Nothing existing changes.

create table public.notification_settings (
  user_id        uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  email_requests boolean not null default true,
  updated_at     timestamptz not null default now()
);

comment on table public.notification_settings is
  'A member''s private notification choices. No row means the defaults (emails about requests are on). Own row only.';

alter table public.notification_settings enable row level security;

create policy "notification_settings: select own" on public.notification_settings
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "notification_settings: insert own" on public.notification_settings
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "notification_settings: update own" on public.notification_settings
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.notification_settings from anon, authenticated;
grant select, insert, update on public.notification_settings to authenticated;

alter table public.practice_requests
  add column emailed_at        timestamptz,
  add column answer_emailed_at timestamptz;

comment on column public.practice_requests.emailed_at is
  'When the recipient was emailed about this request. Set by the notify-request function only.';
comment on column public.practice_requests.answer_emailed_at is
  'When the sender was emailed that this request was accepted. Set by the notify-request function only.';
