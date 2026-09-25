import { getQuote } from '@/services/marketData/marketData';
import { supabase } from '@/services/social/supabaseClient';
import { usePortfolioStore } from '@/store/usePortfolioStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useToastStore } from '@/store/useToastStore';

// A duel scores each participant's EXISTING active portfolio — the same one
// they already trade in the Portfolio tab — by % net-worth change from a
// captured baseline. See supabase/schema.sql's DUELS section for why: no
// second market engine, no simulated clock to keep two devices in sync on.
// Every write that touches a shared column (the net-worth maps, the
// time-skip vote array) goes through one of that section's RPC functions
// rather than a plain client .update(), to avoid a read-modify-write race
// against the other participant's device.

export type DuelStatus = 'pending' | 'active' | 'completed' | 'declined';

export type Duel = {
  id: string;
  kind: 'friend' | 'family';
  status: DuelStatus;
  participantIds: string[];
  timeSkipVotes: string[];
  baselineNetWorths: Record<string, number>;
  liveNetWorths: Record<string, number>;
  winnerId: string | null;
  createdAt: string;
  endsAt: string | null;
};

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

// A read that fails must never look identical to "you genuinely have none" —
// that's indistinguishable from real data to whoever's looking at the
// screen. Surfaced as a toast (cross-store getState() call, same pattern
// used throughout this codebase) rather than changing these functions'
// return shape, so every existing caller keeps working unchanged.
function notifyLoadError(): void {
  useToastStore.getState().show("Couldn't load — check your connection.");
}

/** Same computation as ManagePortfoliosScreen's netWorthOf — the active portfolio, priced synchronously from cache. */
export function computeMyNetWorth(): number {
  const { portfolios, activePortfolioId } = usePortfolioStore.getState();
  const active = portfolios[activePortfolioId];
  if (!active) return 0;
  let value = active.cash;
  for (const h of Object.values(active.holdings)) value += getQuote(h.symbol).price * h.qty;
  return value;
}

function fromRow(row: Record<string, unknown>): Duel {
  return {
    id: row.id as string,
    kind: row.kind as Duel['kind'],
    status: row.status as DuelStatus,
    participantIds: (row.participant_ids as string[]) ?? [],
    timeSkipVotes: (row.time_skip_votes as string[]) ?? [],
    baselineNetWorths: (row.baseline_net_worths as Record<string, number>) ?? {},
    liveNetWorths: (row.live_net_worths as Record<string, number>) ?? {},
    winnerId: (row.winner_id as string | null) ?? null,
    createdAt: row.created_at as string,
    endsAt: (row.ends_at as string | null) ?? null,
  };
}

export async function listDuels(): Promise<Duel[]> {
  // RLS already scopes this to duels the caller is a participant in.
  const { data, error } = await supabase.from('duels').select('*').order('created_at', { ascending: false });
  if (error) notifyLoadError();
  return (data ?? []).map(fromRow);
}

export async function getDuel(duelId: string): Promise<Duel | null> {
  const { data, error } = await supabase.from('duels').select('*').eq('id', duelId).maybeSingle();
  if (error) notifyLoadError();
  return data ? fromRow(data) : null;
}

async function createDuel(kind: 'friend' | 'family', participantIds: string[], durationDays: number): Promise<Result & { id?: string }> {
  const me = currentUserId();
  if (!me) return { ok: false, message: 'Sign in first.' };
  const endsAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('duels')
    .insert({
      kind,
      participant_ids: participantIds,
      baseline_net_worths: { [me]: computeMyNetWorth() },
      live_net_worths: { [me]: computeMyNetWorth() },
      ends_at: endsAt,
    })
    .select('id')
    .single();
  if (error || !data) return { ok: false, message: errorMessage(error) };
  return { ok: true, id: data.id };
}

export async function challengeFriend(opponentId: string, durationDays: number): Promise<Result & { id?: string }> {
  const me = currentUserId();
  if (!me) return { ok: false, message: 'Sign in first.' };
  return createDuel('friend', [me, opponentId], durationDays);
}

// A family duel is scored as representative vs. representative — whoever
// taps "Challenge another family" stands in for their whole family, matched
// against the other family's owner. Every member's own device would need to
// individually report a baseline for a true full-roster aggregate, which
// needs its own per-member join flow; scoped down to two net worths for
// now, same mechanics as a friend duel, just framed as families.
export async function challengeFamily(opponentFamilyId: string, durationDays: number): Promise<Result & { id?: string }> {
  const me = currentUserId();
  if (!me) return { ok: false, message: 'Sign in first.' };
  // Another family's row is invisible under RLS (members only), so its owner
  // is resolved through a SECURITY DEFINER function that returns just that
  // one id. A malformed code errors (not a uuid) — same answer as unknown.
  const { data: ownerId, error } = await supabase.rpc('family_owner_for_invite', { p_family_id: opponentFamilyId.trim() });
  if (error || !ownerId) return { ok: false, message: "That invite code doesn't match a family." };
  if (ownerId === me) return { ok: false, message: "That's your own family." };
  return createDuel('family', [me, ownerId as string], durationDays);
}

export async function acceptDuel(duelId: string): Promise<Result> {
  const { error } = await supabase.rpc('report_duel_net_worth', {
    p_duel_id: duelId,
    p_net_worth: computeMyNetWorth(),
    p_is_baseline: true,
  });
  if (error) return { ok: false, message: errorMessage(error) };
  return { ok: true };
}

export async function declineDuel(duelId: string): Promise<Result> {
  const { error } = await supabase.from('duels').update({ status: 'declined' }).eq('id', duelId);
  if (error) return { ok: false, message: errorMessage(error) };
  return { ok: true };
}

export async function reportLiveNetWorth(duelId: string): Promise<void> {
  await supabase.rpc('report_duel_net_worth', { p_duel_id: duelId, p_net_worth: computeMyNetWorth(), p_is_baseline: false });
}

export async function castTimeSkipVote(duelId: string): Promise<Result> {
  const { error } = await supabase.rpc('cast_duel_time_skip_vote', { p_duel_id: duelId });
  if (error) return { ok: false, message: errorMessage(error) };
  return { ok: true };
}

/** Best-effort, called whenever a duel is opened — a no-op unless it has actually ended. */
export async function finalizeDuelIfReady(duelId: string): Promise<void> {
  await supabase.rpc('finalize_duel_if_ready', { p_duel_id: duelId });
}

/** Live score updates without polling. Returns an unsubscribe function. */
export function subscribeToDuel(duelId: string, onChange: (duel: Duel) => void): () => void {
  const channel = supabase
    .channel(`duel:${duelId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'duels', filter: `id=eq.${duelId}` },
      (payload) => onChange(fromRow(payload.new as Record<string, unknown>))
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
