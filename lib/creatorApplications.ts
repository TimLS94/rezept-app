// Applying to be a creator, and deciding who becomes one.
//
// A creator publishes recipes, charges for them and takes a payout. That is
// not something an account should be able to give itself, and until now the
// app tried to: influencer-login ran an update on its own `role`, which has
// been failing silently since the profile columns were hardened.
//
// So the role is written in exactly one place — admin_decide_creator() — and
// nothing a client can send reaches it.
import { supabase } from './supabase';

export type ApplicationStatus = 'pending' | 'approved' | 'rejected';

export type MyApplication = {
  status: ApplicationStatus;
  applied_at: string;
  note: string | null;
} | null;

export type PendingApplication = {
  user_id: string;
  email: string;
  name: string | null;
  username: string | null;
  pitch: string | null;
  links: string | null;
  status: ApplicationStatus;
  applied_at: string;
};

/** Your own application, or null if you have never filed one. */
export async function myApplication(): Promise<MyApplication> {
  const { data } = await supabase
    .from('creator_applications')
    .select('status, applied_at, note')
    .maybeSingle();
  return (data as MyApplication) ?? null;
}

export async function applyToBeCreator(
  pitch: string,
  links?: string,
): Promise<{ error?: string }> {
  const { data, error } = await supabase.rpc('apply_to_be_creator', {
    p_pitch: pitch,
    p_links: links ?? null,
  });
  if (error) return { error: error.message };
  if (!data?.ok) {
    // The refusals are ordinary situations, not faults, so they get sentences
    // rather than codes.
    return {
      error:
        data?.error === 'already_pending'
          ? 'Your application is already with us. We will come back to you.'
          : data?.error === 'already_a_creator'
            ? 'You already have a creator account.'
            : 'Could not send that. Try again in a moment.',
    };
  }
  return {};
}

export async function listApplications(
  status: ApplicationStatus | null = 'pending',
): Promise<PendingApplication[]> {
  const { data } = await supabase.rpc('admin_creator_applications', { p_status: status });
  return data?.ok ? (data.applications as PendingApplication[]) : [];
}

export async function decideApplication(
  userId: string,
  approve: boolean,
  note?: string,
): Promise<{ error?: string }> {
  const { data, error } = await supabase.rpc('admin_decide_creator', {
    p_user: userId,
    p_approve: approve,
    p_note: note ?? null,
  });
  if (error) return { error: error.message };
  if (!data?.ok) return { error: String(data?.error ?? 'could-not-decide') };
  return {};
}
