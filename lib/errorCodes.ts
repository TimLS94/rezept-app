// Codes for failures that are ours, not the user's.
//
// A user who cannot import a recipe does not need to hear about our vendor's
// billing period. They need to know it is not their fault, that it is being
// dealt with, and to have something short they can quote if they get in
// touch. That is all a code is for.
//
// This table is the other half: it is the only place that says what each code
// actually means, so a support message reading "T-0001" resolves to a cause
// and a fix rather than to a guess.
//
//   T-0001  Instagram lookup — the plan's allowance for the billing period is
//           used up. Check the subscription for instagram-scraper-stable-api
//           at rapidapi.com; the BASIC tier is 20 requests per MONTH for the
//           whole app, so this fires almost immediately under real use.
//           Fix: upgrade the plan. Resets at the billing period boundary.
//
//   T-0002  Instagram lookup — too many requests at once, not the monthly
//           allowance. Transient; it clears within a minute on its own.
//
//   T-0003  Instagram lookup — no RAPIDAPI_KEY set on the gateway. Set it with
//           `npx supabase secrets set RAPIDAPI_KEY=…` and redeploy.
//
//   T-0004  Instagram lookup — something we did not anticipate. The real error
//           goes to the console; if this one turns up in support mail it wants
//           a look rather than a table entry.
//
// Keep the numbering stable. A code that changes meaning between releases is
// worse than no code, because the support reply will be confidently wrong.

export type SupportCode = 'T-0001' | 'T-0002' | 'T-0003' | 'T-0004';

const SUPPORT_EMAIL = 'support@spoondrop.app';

/**
 * The sentence a user sees. Deliberately says nothing about the cause: what
 * is broken here is ours to fix, and naming a third-party service in a
 * consumer-facing error only invites people to go and look at it.
 */
export function technicalError(code: SupportCode, alternative?: string): string {
  return [
    'This feature is temporarily unavailable for technical reasons.',
    alternative,
    `If it keeps happening, contact ${SUPPORT_EMAIL} and quote error code ${code}.`,
  ]
    .filter(Boolean)
    .join(' ');
}
