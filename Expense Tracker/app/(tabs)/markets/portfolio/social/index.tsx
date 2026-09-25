import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { SocialAuthGate } from '@/components/auth/SocialAuthGate';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { FeedbackPressable as Pressable } from '@/components/ui/FeedbackPressable';
import { IconButton } from '@/components/ui/IconButton';
import { PillBadge } from '@/components/ui/PillBadge';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { radius, spacing } from '@/constants/theme';
import { trackingFor } from '@/constants/typography';
import { useAgePermissions } from '@/hooks/useAgePermissions';
import { useTheme } from '@/hooks/useTheme';
import * as duelsApi from '@/services/social/duels';
import * as familiesApi from '@/services/social/families';
import * as friendsApi from '@/services/social/friends';
import { isSupabaseConfigured } from '@/services/social/supabaseClient';
import { useAuthStore } from '@/store/useAuthStore';
import { useToastStore } from '@/store/useToastStore';
import { confirmAction } from '@/utils/confirm';
import { signedPct } from '@/utils/money';

// Nested under Portfolio (not a bottom tab) — see CLAUDE.md §5.1/§10 for why.
// Gated by SocialAuthGate rather than an app-wide auth wall: the rest of the
// app works exactly the same with no account at all, this screen is the only
// place that ever asks for one.

type Section = 'friends' | 'family' | 'duels';
const SECTIONS: { value: Section; label: string }[] = [
  { value: 'friends', label: 'Friends' },
  { value: 'family', label: 'Family' },
  { value: 'duels', label: 'Duels' },
];

export default function SocialScreen() {
  const { colors } = useTheme();
  const session = useAuthStore((s) => s.session);
  const initializing = useAuthStore((s) => s.initializing);
  const agePermissions = useAgePermissions();
  const [section, setSection] = useState<Section>('friends');

  // Not even initialized for a minor: this is the one store in the app that
  // talks to a real backend, and an under-18 account is never created.
  useEffect(() => {
    if (!agePermissions.socialAccounts) return;
    useAuthStore.getState().init();
  }, [agePermissions]);

  // Checked ahead of the Supabase-configured branch below, because this is
  // the stricter rule — a properly configured project still must not sign a
  // minor up. SocialAuthGate carries the same check, so no other route into
  // the sign-up form can get around this one.
  if (!agePermissions.socialAccounts) {
    return (
      <Screen>
        <TopBar title="Friends & Family" />
        <EmptyState
          icon="🔒"
          title="Not available on your account"
          message="Friends, families and duels are the one part of Markva that needs a real account, and an account means storing your email address. Markva does not create accounts for under-18s, so this stays off. Everything else in the app works exactly the same."
        />
      </Screen>
    );
  }

  if (!isSupabaseConfigured()) {
    return (
      <Screen>
        <TopBar title="Friends & Family" />
        <EmptyState
          icon="🔒"
          title="Social features aren't set up"
          message="This install has no Supabase project configured — friends, families, and duels need one. See the app's .env.example file."
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <TopBar
        title="Friends & Family"
        subtitle={session ? 'Challenge someone to a duel' : 'Sign in to connect with others'}
        right={
          session ? (
            <IconButton
              name="log-out-outline"
              onPress={() => confirmAction({ title: 'Sign out?' }, () => useAuthStore.getState().signOut())}
            />
          ) : undefined
        }
      />
      {initializing ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : !session ? (
        <ScrollView>
          <SocialAuthGate />
        </ScrollView>
      ) : (
        <View style={styles.flex}>
          <View style={styles.switchWrap}>
            <SegmentedControl options={SECTIONS} value={section} onChange={setSection} />
          </View>
          {section === 'friends' ? <FriendsSection /> : section === 'family' ? <FamilySection /> : <DuelsSection />}
        </View>
      )}
    </Screen>
  );
}

function FriendsSection() {
  const { colors } = useTheme();
  const showToast = useToastStore((s) => s.show);
  const [friends, setFriends] = useState<friendsApi.Friend[] | null>(null);
  const [requests, setRequests] = useState<friendsApi.FriendRequest[] | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [searching, setSearching] = useState(false);
  // undefined = haven't searched yet, null = searched and found nobody.
  const [found, setFound] = useState<friendsApi.Profile | null | undefined>(undefined);

  const load = useCallback(() => {
    friendsApi.listFriends().then(setFriends);
    friendsApi.listPendingRequests().then(setRequests);
  }, []);

  useEffect(load, [load]);

  async function handleSearch() {
    if (!emailInput.trim()) return;
    setSearching(true);
    setFound(await friendsApi.findProfileByEmail(emailInput));
    setSearching(false);
  }

  async function handleSendRequest() {
    if (!found) return;
    const result = await friendsApi.sendFriendRequest(found.id);
    if (!result.ok) {
      showToast(result.message);
      return;
    }
    showToast('Friend request sent.');
    setFound(undefined);
    setEmailInput('');
    load();
  }

  async function handleAccept(requestId: string) {
    const result = await friendsApi.acceptFriendRequest(requestId);
    if (!result.ok) showToast(result.message);
    load();
  }

  async function handleRemove(friendshipId: string) {
    const result = await friendsApi.removeFriendship(friendshipId);
    if (!result.ok) showToast(result.message);
    load();
  }

  function handleUnfriend(friendshipId: string, name: string) {
    confirmAction({ title: `Remove ${name}?`, confirmLabel: 'Remove', destructive: true }, () => handleRemove(friendshipId));
  }

  function handleChallenge(opponentId: string, opponentName: string) {
    router.push({ pathname: '/markets/portfolio/social/new-duel', params: { kind: 'friend', opponentId, opponentName } });
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Card style={{ gap: spacing.sm }}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Add a friend</Text>
        <View style={styles.row}>
          <TextInput
            value={emailInput}
            onChangeText={(v) => {
              setEmailInput(v);
              setFound(undefined);
            }}
            placeholder="Their email"
            placeholderTextColor={colors.text3}
            autoCapitalize="none"
            keyboardType="email-address"
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface2 }]}
          />
          <Button label="Find" variant="ghost" loading={searching} disabled={!emailInput.trim()} onPress={handleSearch} />
        </View>
        {found === null ? (
          <Text style={[styles.muted, { color: colors.text3 }]}>No one found with that email.</Text>
        ) : found ? (
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <Text style={{ color: colors.text }}>{found.displayName}</Text>
            <Button label="Send request" onPress={handleSendRequest} />
          </View>
        ) : null}
      </Card>

      {requests && requests.length > 0 ? (
        <View>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Requests</Text>
          <Card style={{ padding: 0, marginTop: spacing.sm }}>
            {requests.map((r, i) => (
              <View key={r.id} style={[styles.listRow, i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '600' }}>{r.otherUser.displayName}</Text>
                  <Text style={[styles.muted, { color: colors.text3 }]}>{r.incoming ? 'wants to be friends' : 'request sent'}</Text>
                </View>
                {r.incoming ? (
                  <View style={styles.row}>
                    <Button label="Accept" onPress={() => handleAccept(r.id)} />
                    <Button label="Decline" variant="ghost" onPress={() => handleRemove(r.id)} />
                  </View>
                ) : (
                  <PillBadge label="Pending" />
                )}
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      <View>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Your friends</Text>
        <Card style={{ padding: 0, marginTop: spacing.sm }}>
          {friends === null ? (
            <ActivityIndicator style={{ margin: spacing.lg }} color={colors.text3} />
          ) : friends.length === 0 ? (
            <EmptyState icon="👋" title="No friends yet" message="Add someone by email to start a duel with them — or add bot@markva.app to practise against Markva Bot." />
          ) : (
            friends.map((f, i) => (
              <View
                key={f.friendshipId}
                style={[styles.listRow, i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                <Text style={{ color: colors.text, fontWeight: '600', flex: 1 }}>{f.profile.displayName}</Text>
                <View style={styles.row}>
                  <Button label="Challenge" onPress={() => handleChallenge(f.profile.id, f.profile.displayName)} />
                  <IconButton name="person-remove-outline" category="destructive" onPress={() => handleUnfriend(f.friendshipId, f.profile.displayName)} />
                </View>
              </View>
            ))
          )}
        </Card>
      </View>
    </ScrollView>
  );
}

function FamilySection() {
  const { colors } = useTheme();
  const showToast = useToastStore((s) => s.show);
  const [family, setFamily] = useState<Awaited<ReturnType<typeof familiesApi.getMyFamily>> | null | undefined>(undefined);
  const [nameInput, setNameInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    familiesApi.getMyFamily().then(setFamily);
  }, []);

  useEffect(load, [load]);

  async function handleCreate() {
    setBusy(true);
    const result = await familiesApi.createFamily(nameInput);
    setBusy(false);
    if (!result.ok) {
      showToast(result.message);
      return;
    }
    setNameInput('');
    load();
  }

  async function handleJoin() {
    setBusy(true);
    const result = await familiesApi.joinFamily(codeInput);
    setBusy(false);
    if (!result.ok) {
      showToast(result.message);
      return;
    }
    setCodeInput('');
    load();
  }

  function handleLeave() {
    if (!family) return;
    confirmAction({ title: `Leave ${family.family.name}?`, confirmLabel: 'Leave', destructive: true }, async () => {
      const result = await familiesApi.leaveFamily(family.family.id);
      if (!result.ok) showToast(result.message);
      load();
    });
  }

  function handleChallengeFamily() {
    router.push({ pathname: '/markets/portfolio/social/new-duel', params: { kind: 'family' } });
  }

  if (family === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.text3} />
      </View>
    );
  }

  if (!family) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={{ gap: spacing.sm }}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Create a family</Text>
          <TextInput
            value={nameInput}
            onChangeText={setNameInput}
            placeholder="Family name"
            placeholderTextColor={colors.text3}
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface2 }]}
          />
          <Button label="Create" loading={busy} disabled={!nameInput.trim()} onPress={handleCreate} />
        </Card>
        <Card style={{ gap: spacing.sm }}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Join a family</Text>
          <Text style={[styles.muted, { color: colors.text3 }]}>Paste the invite code someone in the family shared with you.</Text>
          <TextInput
            value={codeInput}
            onChangeText={setCodeInput}
            placeholder="Invite code"
            placeholderTextColor={colors.text3}
            autoCapitalize="none"
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface2 }]}
          />
          <Button label="Join" variant="ghost" loading={busy} disabled={!codeInput.trim()} onPress={handleJoin} />
        </Card>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Card style={{ gap: spacing.sm }}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{family.family.name}</Text>
        <Text style={[styles.muted, { color: colors.text3 }]}>Invite code — share this so someone can join:</Text>
        <View style={[styles.codeBox, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
          <Text style={{ color: colors.text, fontSize: 12.5 }} selectable numberOfLines={1}>
            {family.family.id}
          </Text>
        </View>
        <Button label="Challenge another family" onPress={handleChallengeFamily} />
        <Button label="Leave family" variant="ghost" onPress={handleLeave} />
      </Card>

      <View>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Members ({family.members.length})</Text>
        <Card style={{ padding: 0, marginTop: spacing.sm }}>
          {family.members.map((m, i) => (
            <View key={m.id} style={[styles.listRow, i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
              <Text style={{ color: colors.text }}>{m.displayName}</Text>
              {m.id === family.family.ownerId ? <PillBadge label="Owner" /> : null}
            </View>
          ))}
        </Card>
      </View>
    </ScrollView>
  );
}

function DuelsSection() {
  const { colors } = useTheme();
  const [rows, setRows] = useState<{ duel: duelsApi.Duel; names: Map<string, string>; myId: string }[] | null>(null);

  const load = useCallback(async () => {
    const me = useAuthStore.getState().session?.user.id;
    if (!me) return;
    const duels = await duelsApi.listDuels();
    const allIds = [...new Set(duels.flatMap((d) => d.participantIds))];
    const profiles = await friendsApi.profilesByIds(allIds);
    const names = new Map<string, string>();
    for (const [id, p] of profiles) names.set(id, p.displayName);
    setRows(duels.map((duel) => ({ duel, names, myId: me })));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (rows === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.text3} />
      </View>
    );
  }

  if (rows.length === 0) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <EmptyState icon="⚔️" title="No duels yet" message="Challenge a friend or a family to see who grows their net worth more." />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Card style={{ padding: 0 }}>
        {rows.map(({ duel, names, myId }, i) => {
          const opponents = duel.participantIds.filter((id) => id !== myId).map((id) => names.get(id) ?? '…');
          const myNw = duel.liveNetWorths[myId] ?? duel.baselineNetWorths[myId];
          const myBase = duel.baselineNetWorths[myId];
          const myPct = myBase ? ((myNw - myBase) / myBase) * 100 : 0;
          return (
            <Pressable
              feedbackCategory="navigation"
              key={duel.id}
              style={[styles.listRowPress, i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}
              onPress={() => router.push(`/markets/portfolio/social/duel/${duel.id}`)}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>vs {opponents.join(', ')}</Text>
                <Text style={[styles.muted, { color: colors.text3 }]}>
                  {duel.status === 'pending' ? 'Awaiting response' : duel.status === 'completed' ? 'Completed' : duel.status === 'declined' ? 'Declined' : 'Active'}
                </Text>
              </View>
              {duel.status === 'active' || duel.status === 'completed' ? (
                <Text style={{ color: myPct >= 0 ? colors.success : colors.danger, fontWeight: '700' }}>{signedPct(myPct)}</Text>
              ) : (
                <PillBadge label={duel.status} />
              )}
            </Pressable>
          );
        })}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  switchWrap: { paddingHorizontal: spacing.xl, marginBottom: spacing.md },
  content: { padding: spacing.xl, paddingTop: 0, gap: spacing.lg, paddingBottom: spacing.xxl },
  sectionTitle: { fontSize: 15, letterSpacing: trackingFor(15), fontWeight: '700' },
  muted: { fontSize: 12, letterSpacing: trackingFor(12), marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    letterSpacing: trackingFor(14),
  },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  listRowPress: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  codeBox: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.sm, padding: spacing.md },
});
