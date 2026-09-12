import { supabase } from '@/services/social/supabaseClient';
import { useAuthStore } from '@/store/useAuthStore';
import { useToastStore } from '@/store/useToastStore';

// Friends live entirely behind Supabase — see supabase/schema.sql's
// FRIENDSHIPS section for the table/RLS this talks to, and its
// find_profile_by_email() for why "add by email" is an RPC rather than a
// plain SELECT (emails are never exposed through a direct table read).

export type Profile = { id: string; displayName: string };
export type FriendRequest = { id: string; otherUser: Profile; incoming: boolean };
export type Friend = { friendshipId: string; profile: Profile };

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

// A read that fails must never look identical to "you have none" — that's
// indistinguishable from real data on screen. Surfaced as a toast
// (cross-store getState() call, same pattern used throughout this codebase)
// rather than changing these functions' return shape.
function notifyLoadError(): void {
  useToastStore.getState().show("Couldn't load — check your connection.");
}

/** Shared by anything that needs to turn a list of user ids into display names — e.g. a duel's roster. */
export async function profilesByIds(ids: string[]): Promise<Map<string, Profile>> {
  const map = new Map<string, Profile>();
  if (ids.length === 0) return map;
  const { data, error } = await supabase.from('profiles').select('id, display_name').in('id', ids);
  if (error) notifyLoadError();
  for (const row of data ?? []) map.set(row.id, { id: row.id, displayName: row.display_name });
  return map;
}

export async function findProfileByEmail(email: string): Promise<Profile | null> {
  const { data, error } = await supabase.rpc('find_profile_by_email', { lookup_email: email.trim() });
  if (error || !data || data.length === 0) return null;
  const row = data[0];
  return { id: row.id, displayName: row.display_name };
}

export async function sendFriendRequest(addresseeId: string): Promise<Result> {
  const me = currentUserId();
  if (!me) return { ok: false, message: 'Sign in first.' };
  if (me === addresseeId) return { ok: false, message: "That's you." };

  // The table's unique constraint is (requester_id, addressee_id) — it only
  // catches a duplicate in the SAME direction. Checked explicitly here so
  // "they already sent you one" surfaces as a clear message pointing at
  // Requests, rather than silently creating a second, reversed pending row.
  const { data: existing } = await supabase
    .from('friendships')
    .select('id, requester_id, status')
    .or(`and(requester_id.eq.${me},addressee_id.eq.${addresseeId}),and(requester_id.eq.${addresseeId},addressee_id.eq.${me})`)
    .maybeSingle();
  if (existing) {
    if (existing.status === 'accepted') return { ok: false, message: "You're already friends." };
    if (existing.requester_id === me) return { ok: false, message: 'Request already sent.' };
    return { ok: false, message: 'They already sent you a request — check Requests to accept it.' };
  }

  const { error } = await supabase.from('friendships').insert({ requester_id: me, addressee_id: addresseeId });
  if (error) {
    if (error.code === '23505') return { ok: false, message: 'Already sent — or you already have a request from them.' };
    return { ok: false, message: errorMessage(error) };
  }
  return { ok: true };
}

export async function acceptFriendRequest(friendshipId: string): Promise<Result> {
  const { error } = await supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId);
  if (error) return { ok: false, message: errorMessage(error) };
  return { ok: true };
}

/** Also used to unfriend an already-accepted row — one row, one action. */
export async function removeFriendship(friendshipId: string): Promise<Result> {
  const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
  if (error) return { ok: false, message: errorMessage(error) };
  return { ok: true };
}

export async function listFriends(): Promise<Friend[]> {
  const me = currentUserId();
  if (!me) return [];
  const { data, error } = await supabase
    .from('friendships')
    .select('id, requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${me},addressee_id.eq.${me}`);
  if (error) notifyLoadError();
  const rows = data ?? [];
  const otherIds = rows.map((r) => (r.requester_id === me ? r.addressee_id : r.requester_id));
  const profiles = await profilesByIds(otherIds);
  return rows
    .map((r) => {
      const otherId = r.requester_id === me ? r.addressee_id : r.requester_id;
      const profile = profiles.get(otherId);
      return profile ? { friendshipId: r.id, profile } : null;
    })
    .filter((f): f is Friend => !!f);
}

export async function listPendingRequests(): Promise<FriendRequest[]> {
  const me = currentUserId();
  if (!me) return [];
  const { data, error } = await supabase
    .from('friendships')
    .select('id, requester_id, addressee_id')
    .eq('status', 'pending')
    .or(`requester_id.eq.${me},addressee_id.eq.${me}`);
  if (error) notifyLoadError();
  const rows = data ?? [];
  const otherIds = rows.map((r) => (r.requester_id === me ? r.addressee_id : r.requester_id));
  const profiles = await profilesByIds(otherIds);
  return rows
    .map((r) => {
      const incoming = r.addressee_id === me;
      const otherId = incoming ? r.requester_id : r.addressee_id;
      const otherUser = profiles.get(otherId);
      return otherUser ? { id: r.id, otherUser, incoming } : null;
    })
    .filter((r): r is FriendRequest => !!r);
}
