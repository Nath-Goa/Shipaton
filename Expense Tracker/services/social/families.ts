import { supabase } from '@/services/social/supabaseClient';
import type { Profile } from '@/services/social/friends';
import { useAuthStore } from '@/store/useAuthStore';
import { useToastStore } from '@/store/useToastStore';

// A family's id doubles as its invite code — sharing it is how someone
// joins (see supabase/schema.sql's family_members insert policy: any
// signed-in user can add themself to any family id they were given, and a
// uuid is unguessable, so this is the same trust model as a shareable
// link). No separate short-code generation needed.

export type Family = { id: string; name: string; ownerId: string };

type Result = { ok: true } | { ok: false; message: string };

function currentUserId(): string | null {
  return useAuthStore.getState().session?.user.id ?? null;
}

function errorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return (e as { message: string }).message;
  }
  return 'Something went wrong. Please try again.';
}

// A read that fails must never look identical to "you're not in a family" —
// that's indistinguishable from real data on screen. Surfaced as a toast
// (cross-store getState() call, same pattern used throughout this codebase)
// rather than changing getMyFamily's return shape.
function notifyLoadError(): void {
  useToastStore.getState().show("Couldn't load — check your connection.");
}

export async function createFamily(name: string): Promise<Result & { id?: string }> {
  const me = currentUserId();
  if (!me) return { ok: false, message: 'Sign in first.' };
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, message: 'Give your family a name.' };

  const { data, error } = await supabase.from('families').insert({ name: trimmed, owner_id: me }).select('id').single();
  if (error || !data) return { ok: false, message: errorMessage(error) };

  const { error: memberError } = await supabase
    .from('family_members')
    .insert({ family_id: data.id, user_id: me, role: 'owner' });
  if (memberError) return { ok: false, message: errorMessage(memberError) };

  return { ok: true, id: data.id };
}

export async function joinFamily(familyId: string): Promise<Result> {
  const me = currentUserId();
  if (!me) return { ok: false, message: 'Sign in first.' };
  const { error } = await supabase.from('family_members').insert({ family_id: familyId.trim(), user_id: me });
  if (error) {
    if (error.code === '23505') return { ok: false, message: "You're already in that family." };
    if (error.code === '23503') return { ok: false, message: "That invite code doesn't match a family." };
    return { ok: false, message: errorMessage(error) };
  }
  return { ok: true };
}

export async function leaveFamily(familyId: string): Promise<Result> {
  const me = currentUserId();
  if (!me) return { ok: false, message: 'Sign in first.' };
  const { error } = await supabase.from('family_members').delete().eq('family_id', familyId).eq('user_id', me);
  if (error) return { ok: false, message: errorMessage(error) };
  return { ok: true };
}

export async function getMyFamily(): Promise<{ family: Family; members: Profile[] } | null> {
  const me = currentUserId();
  if (!me) return null;

  const { data: membership, error: membershipError } = await supabase
    .from('family_members')
    .select('family_id')
    .eq('user_id', me)
    .limit(1)
    .maybeSingle();
  if (membershipError) {
    notifyLoadError();
    return null;
  }
  if (!membership) return null;

  const { data: familyRow, error: familyError } = await supabase
    .from('families')
    .select('id, name, owner_id')
    .eq('id', membership.family_id)
    .single();
  if (familyError) notifyLoadError();
  if (!familyRow) return null;

  const { data: memberRows, error: memberRowsError } = await supabase
    .from('family_members')
    .select('user_id')
    .eq('family_id', membership.family_id);
  if (memberRowsError) notifyLoadError();
  const memberIds = (memberRows ?? []).map((r) => r.user_id);
  const { data: profileRows, error: profileRowsError } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', memberIds.length ? memberIds : ['']);
  if (profileRowsError) notifyLoadError();

  return {
    family: { id: familyRow.id, name: familyRow.name, ownerId: familyRow.owner_id },
    members: (profileRows ?? []).map((p) => ({ id: p.id, displayName: p.display_name })),
  };
}
