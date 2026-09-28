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
  /** Family duels: [challenging family, challenged family]. Null for friend duels and old owner-vs-owner family duels. */
  familyIds: [string, string] | null;
  /** Participant id -> their family id, snapshotted when the challenge was made. */
  teams: Record<string, string>;
  /** Family id -> family name, snapshotted with the rosters (the other family isn't readable directly). */
  teamNames: Record<string, string>;
  winnerFamilyId: string | null;
};

export type TeamMember = { id: string; joined: boolean; pct: number | null; liveNetWorth: number | null };
export type TeamStanding = { familyId: string; name: string; members: TeamMember[]; joinedCount: number; pct: number | null };

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
    familyIds: (row.family_ids as [string, string] | null) ?? null,
    teams: (row.teams as Record<string, string>) ?? {},
    teamNames: (row.team_names as Record<string, string>) ?? {},
    winnerFamilyId: (row.winner_family_id as string | null) ?? null,
  };
}

/** A participant's % change since they joined, or null if they haven't. */
export function participantPct(duel: Duel, id: string): number | null {
  const base = duel.baselineNetWorths[id];
  if (!base) return null;
  const live = duel.liveNetWorths[id] ?? base;
  return ((live - base) / base) * 100;
}

/**
 * Both families in a family duel, challenger first. A family's score is the
 * average % change of the members who joined — the same rule
 * finalize_duel_if_ready uses to pick the winner, so what's on screen is
 * what gets scored.
 */
export function familyStandings(duel: Duel): TeamStanding[] {
  if (!duel.familyIds) return [];
  return duel.familyIds.map((familyId) => {
    const members = duel.participantIds
      .filter((id) => duel.teams[id] === familyId)
      .map((id) => {
        const pct = participantPct(duel, id);
        return { id, joined: pct !== null, pct, liveNetWorth: duel.liveNetWorths[id] ?? null };
      });
    const joined = members.filter((m) => m.pct !== null);
    const pct = joined.length ? joined.reduce((sum, m) => sum + (m.pct as number), 0) / joined.length : null;
    return { familyId, name: duel.teamNames[familyId] ?? 'Family', members, joinedCount: joined.length, pct };
  });
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

async function createDuel(participantIds: string[], durationDays: number): Promise<Result & { id?: string }> {
  const me = currentUserId();
  if (!me) return { ok: false, message: 'Sign in first.' };
  const endsAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('duels')
    .insert({
      kind: 'friend',
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
  return createDuel([me, opponentId], durationDays);
}

// Every member of both families is in a family duel, and each one joins from
// their own device, which captures their own baseline. Built server-side by
// create_family_duel because the other family's roster is invisible to us
// under RLS. The challenger joins by sending it.
export async function challengeFamily(myFamilyId: string, opponentFamilyId: string, durationDays: number): Promise<Result & { id?: string }> {
  if (!currentUserId()) return { ok: false, message: 'Sign in first.' };
  const { data, error } = await supabase.rpc('create_family_duel', {
    p_my_family_id: myFamilyId,
    p_opponent_family_id: opponentFamilyId.trim(),
    p_duration_days: durationDays,
    p_net_worth: computeMyNetWorth(),
  });
  // 22P02: the code isn't a uuid at all (a typo).
  if (error?.code === '22P02') return { ok: false, message: "That invite code doesn't match a family." };
  if (error || !data) return { ok: false, message: errorMessage(error) };
  return { ok: true, id: data as string };
}

/** Accepting a challenge, or joining a family duel as one more member — both report this device's baseline. */
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
