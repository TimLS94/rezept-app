// Reporting a recipe, and answering the report.
//
// Guideline 1.2 asks for two things from an app that publishes what its users
// made: a way to flag something from inside the app, and an answer in a
// stated time. The terms say 48 hours. This is the first half.
//
// Nothing here reads or writes the table directly — content_reports has no
// grant and no policy, so every call goes through a function that knows who
// is asking. A client cannot list other people's reports or resolve its own.
import { supabase } from './supabase';

export type ReportReason = 'copyright' | 'unsafe' | 'offensive' | 'spam' | 'other';

/** The reasons, in the order they are offered. Shortest route to the point. */
export const REPORT_REASONS: { id: ReportReason; label: string }[] = [
  { id: 'copyright', label: 'It uses my photo or recipe' },
  { id: 'unsafe', label: 'Unsafe to cook' },
  { id: 'offensive', label: 'Offensive content' },
  { id: 'spam', label: 'Spam or not a recipe' },
];

export type ContentReport = {
  id: string;
  recipe_id: string;
  recipe_title: string | null;
  reason: ReportReason;
  detail: string | null;
  status: 'open' | 'removed' | 'dismissed';
  created_at: string;
  reporter: string | null;
  creator: string | null;
  recipe_exists: boolean;
};

export async function reportRecipe(
  recipeId: string,
  recipeTitle: string | null,
  reason: ReportReason,
  detail?: string,
): Promise<{ error?: string }> {
  const { data, error } = await supabase.rpc('report_content', {
    p_recipe_id: recipeId,
    p_recipe_title: recipeTitle,
    p_reason: reason,
    p_detail: detail ?? null,
  });
  if (error) {
    // The table arrives with content_reports.sql. Say which, rather than
    // showing somebody a Postgres error about a missing function.
    return {
      error: /report_content/.test(error.message)
        ? 'Reporting is not available yet. Please write to legal@spoondrop.app.'
        : error.message,
    };
  }
  if (!data?.ok) {
    return {
      error:
        data?.error === 'not_signed_in'
          ? 'Please sign in to report a recipe.'
          : data?.error === 'rate_limited'
            ? 'That is a lot of reports for one day. Write to legal@spoondrop.app and we will look properly.'
            : 'Could not send that. Try again in a moment.',
    };
  }
  return {};
}

export async function listReports(
  status: ContentReport['status'] | null = 'open',
): Promise<ContentReport[]> {
  const { data } = await supabase.rpc('admin_content_reports', { p_status: status });
  return data?.ok ? (data.reports as ContentReport[]) : [];
}

export async function decideReport(
  id: string,
  remove: boolean,
  note?: string,
): Promise<{ error?: string }> {
  const { data, error } = await supabase.rpc('admin_decide_report', {
    p_id: id,
    p_remove: remove,
    p_note: note ?? null,
  });
  if (error) return { error: error.message };
  if (!data?.ok) return { error: String(data?.error ?? 'could-not-decide') };
  return {};
}
