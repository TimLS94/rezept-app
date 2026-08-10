-- ============================================================================
-- DEV UTILITY — give a test account its Fridge Scan quota back.
--
-- Not part of the schema. Nothing here is idempotent-by-design or meant to run
-- on a schedule; it's a hand-run reset for testing.
--
-- Deliberately NOT an RPC: a "reset my own quota" function callable from the
-- app would hand every user an unlimited scan count and quietly undo the 3-per-
-- week limit. Resetting stays something only someone with SQL access can do.
-- ============================================================================

-- Where the account currently stands (run before and after).
select u.email,
       count(f.id)                                   as scans_in_window,
       greatest(0, 3 - count(f.id))                  as remaining,
       min(f.created_at) + interval '7 days'         as frees_up_at
from auth.users u
left join public.fridge_scans f
       on f.user_id = u.id
      and f.created_at > now() - interval '7 days'
where u.email = 'tim.schaefer94@web.de'
group by u.email;

-- The reset itself. Deletes only this account's scan log; the weekly window is
-- derived from those rows, so removing them restores all three scans.
delete from public.fridge_scans
where user_id = (select id from auth.users where email = 'tim.schaefer94@web.de');

-- ── Notes ─────────────────────────────────────────────────────────────────
-- • The scan RESULT the app shows is stored on the device (AsyncStorage), not
--   in the database. This query won't clear it — use "Start over" on the Fridge
--   Scan screen, or reinstall.
-- • To reset every test account at once:
--     delete from public.fridge_scans;
