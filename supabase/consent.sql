-- ============================================================================
-- Consent: push notifications, and marketing email.
--
-- Kept as columns rather than inside the `preferences` blob, because these are
-- not preferences. A preference is a convenience we can lose; a consent record
-- is evidence of what someone agreed to and when, and it has to survive being
-- looked up years later by someone answering a complaint.
--
-- What US law actually requires here, since the two are not the same:
--
--   Marketing email — CAN-SPAM (15 U.S.C. §7701 et seq.) does NOT require
--   opt-in. It requires that commercial mail is not deceptive, is identifiable
--   as advertising, carries a valid physical postal address, and offers an
--   opt-out that is honoured within 10 business days. We ask for opt-in anyway
--   and default it to off: a pre-ticked box is the kind of thing that turns a
--   complaint into a finding, and both app stores treat forced marketing
--   consent as grounds for rejection. Transactional mail — password resets,
--   receipts, "your purchase is ready" — is exempt from all of that and must
--   keep working after someone unsubscribes.
--
--   Push — no US statute governs it; Apple does. Guideline 4.5.4: push may not
--   be required to use the app, and may not be used for advertising or
--   promotion without explicit opt-in. So this flag gates both whether we ask
--   iOS for permission at all and whether anything promotional may be sent.
--
-- The timestamp is written server-side by set_consent(), not by the client. A
-- consent record whose date came from the device it is meant to prove
-- something about is not evidence of anything.
--
-- Idempotent. Run in the Supabase SQL Editor.
-- ============================================================================

begin;

alter table public.profiles
  add column if not exists push_opt_in boolean not null default false,
  add column if not exists push_opt_in_at timestamptz,
  add column if not exists marketing_email_opt_in boolean not null default false,
  add column if not exists marketing_email_opt_in_at timestamptz,
  -- Withdrawal is kept as well as grant. "Never agreed" and "agreed and then
  -- changed their mind" are different facts, and only the second one has a
  -- deadline attached to it.
  add column if not exists marketing_email_opt_out_at timestamptz;

-- Read through my_profile(), which returns the owner's whole row. Deliberately
-- not added to the public column grants: whether someone accepts marketing is
-- between them and us.
--
-- No client UPDATE grant either — writes go through the function below, so the
-- timestamp cannot be set by the device it describes.

create or replace function public.set_consent(p_push boolean, p_email boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare was_email boolean;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  select marketing_email_opt_in into was_email from public.profiles where id = auth.uid();

  update public.profiles set
    push_opt_in = coalesce(p_push, push_opt_in),
    -- Only re-stamp when the answer actually changed, so the record says when
    -- someone decided, not when they last happened to open a settings screen.
    push_opt_in_at = case
      when p_push is not null and p_push is distinct from push_opt_in then now()
      else push_opt_in_at end,

    marketing_email_opt_in = coalesce(p_email, marketing_email_opt_in),
    marketing_email_opt_in_at = case
      when p_email is true and was_email is distinct from true then now()
      else marketing_email_opt_in_at end,
    marketing_email_opt_out_at = case
      when p_email is false and was_email is true then now()
      else marketing_email_opt_out_at end
  where id = auth.uid();

  return jsonb_build_object('ok', true);
end; $$;

grant execute on function public.set_consent(boolean, boolean) to authenticated;

-- ── Who may be emailed ─────────────────────────────────────────────────────
-- The one query a mailing ever runs. Anyone not in it must not receive
-- promotional mail, and an opt-out has to disappear from it immediately —
-- CAN-SPAM allows 10 business days, which is a ceiling, not a target.
--
--   select u.email
--   from public.profiles p
--   join auth.users u on u.id = p.id
--   where p.marketing_email_opt_in is true;

commit;
