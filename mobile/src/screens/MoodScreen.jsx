import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MOODS } from '../lib/constants';
import { colors, fonts, space, radii } from '../theme/tokens';
import { useAuth } from '../context/useAuth';
import { useMatches } from '../context/MatchContext';
import client from '../api/client';
import SlideView from '../components/SlideView';
import ChatOverlay from '../components/ChatOverlay';

const IS_TABLET = Dimensions.get('window').width >= 768;

export default function MoodScreen() {
  const { user } = useAuth();
  const { partnerMood: wsMood, setPartnerMood } = useMatches();

  const [myMood, setMyMood] = useState(null);
  const [partnerMood, setPartnerMoodLocal] = useState(null);
  const [picking, setPicking] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const toastTimer = useRef(null);

  useEffect(() => {
    client.get('/mood')
      .then((data) => {
        setMyMood(data.mine || null);
        setPartnerMoodLocal(data.partner || null);
      })
      .catch(() => {});
  }, []);

  // WS push — update partner mood display (ignore self updates here)
  useEffect(() => {
    if (!wsMood) return;
    if (!wsMood.isSelf) setPartnerMoodLocal(wsMood.mood);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setPartnerMood(null), 4000);
    return () => clearTimeout(toastTimer.current);
  }, [wsMood]);

  async function handleSet() {
    if (!picking || loading) return;
    setLoading(true);
    setError(null);
    try {
      const data = await client.put('/mood', { mood: picking, expires_hours: 24 });
      setMyMood(data.mine || null);
      setPartnerMoodLocal(data.partner || null);
      setPicking(null);
    } catch (e) {
      const msg = e?.message || '';
      if (msg.includes('Wait')) setError(msg);
      else if (msg.includes('Not paired')) setError('Pair with a partner to share moods.');
      else setError("Couldn't update mood. Try again.");
    }
    setLoading(false);
  }

  async function handleClear() {
    await client.delete('/mood').catch(() => {});
    setMyMood(null);
    setPicking(null);
  }


  const myMoodObj = MOODS.find((m) => m.key === myMood);
  const partnerMoodObj = MOODS.find((m) => m.key === partnerMood);
  const partnerName = user?.partnerName || 'Partner';

  return (
    <SlideView>
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.inner}>

            <View style={styles.header}>
              <Text style={styles.title}>Mood</Text>
              <Text style={styles.subtitle}>Let your partner know how you're feeling.</Text>
            </View>

            {/* Chat trigger — opens preset-expression overlay */}
            {user?.coupleId && (
              <TouchableOpacity
                style={styles.chatTrigger}
                onPress={() => setChatOpen(true)}
                activeOpacity={0.85}
              >
                <View style={styles.chatTriggerIconWrap}>
                  <Text style={styles.chatTriggerIcon}>💬</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.chatTriggerTitle}>Chat with {partnerName}</Text>
                  <Text style={styles.chatTriggerHint}>Send a quick note — no typing</Text>
                </View>
                <Text style={styles.chatTriggerChevron}>→</Text>
              </TouchableOpacity>
            )}

            {/* Two-column layout on tablet: your mood + partner mood side by side */}
            <View style={IS_TABLET ? styles.tabletRow : styles.phoneCol}>

              {/* Your mood */}
              <View style={[styles.section, IS_TABLET && styles.sectionTablet]}>
                <Text style={styles.sectionLabel}>Your mood</Text>

                {myMood && !picking ? (
                  <TouchableOpacity style={styles.currentCard} onPress={() => setPicking(myMood)} activeOpacity={0.8}>
                    <Text style={styles.currentEmoji}>{myMoodObj?.emoji}</Text>
                    <Text style={styles.currentLabel}>{myMoodObj?.label}</Text>
                    <Text style={styles.tapHint}>Tap to change</Text>
                  </TouchableOpacity>
                ) : (
                  <>
                    <View style={styles.moodGrid}>
                      {MOODS.map((m) => {
                        const active = picking === m.key;
                        return (
                          <TouchableOpacity
                            key={m.key}
                            style={[styles.moodTile, active && styles.moodTileActive]}
                            onPress={() => setPicking(m.key)}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.moodEmoji, active && styles.moodEmojiActive]}>{m.emoji}</Text>
                            <Text style={[styles.moodLabel, active && styles.moodLabelActive]} numberOfLines={1}>
                              {m.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {picking && (
                      <View style={styles.confirmCol}>
                        <TouchableOpacity
                          style={[styles.setBtn, loading && styles.setBtnDisabled]}
                          onPress={handleSet}
                          disabled={loading}
                        >
                          <Text style={styles.setBtnText}>{loading ? 'Sending…' : 'Send to partner'}</Text>
                        </TouchableOpacity>
                        {myMood && (
                          <TouchableOpacity onPress={() => setPicking(null)} style={styles.cancelBtn}>
                            <Text style={styles.cancelText}>Cancel</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}


                  </>
                )}
              </View>

              {/* Partner mood */}
              <View style={[styles.section, IS_TABLET && styles.sectionTablet]}>
                <Text style={styles.sectionLabel}>{partnerName}'s mood</Text>
                {partnerMoodObj ? (
                  <View style={styles.partnerDisplay}>
                    <Text style={styles.partnerEmoji}>{partnerMoodObj.emoji}</Text>
                    <Text style={styles.partnerLabel}>{partnerMoodObj.label}</Text>
                  </View>
                ) : (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyIcon}>💭</Text>
                    <Text style={styles.emptyText}>Nothing set yet</Text>
                  </View>
                )}
              </View>

            </View>

          </View>
        </ScrollView>

        <ChatOverlay
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          partnerName={partnerName}
        />
      </SafeAreaView>
    </SlideView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  scroll: { flexGrow: 1 },
  inner: {
    width: '100%',
    maxWidth: IS_TABLET ? 640 : undefined,
    alignSelf: 'center',
    padding: space[5],
    gap: space[5],
  },

  header: { gap: space[1] },
  title: { fontFamily: fonts.serifBold, fontSize: 26, color: colors.text },
  subtitle: { fontFamily: fonts.sans, fontSize: 14, color: colors.textMuted },

  phoneCol: { gap: space[4] },
  tabletRow: { flexDirection: 'row', gap: space[4] },

  section: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space[5],
    gap: space[4],
  },
  sectionTablet: { flex: 1 },
  sectionLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textLight,
  },

  moodGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: space[2],
  },
  moodTile: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    width: '23%',
    aspectRatio: 1,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  moodTileActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
    transform: [{ scale: 1.08 }],
  },
  moodEmoji: { fontSize: 26 },
  moodEmojiActive: { fontSize: 30 },
  moodLabel: { fontFamily: fonts.sans, fontSize: 10, color: colors.textMuted },
  moodLabelActive: { fontFamily: fonts.sansMedium, color: colors.accent },

  confirmCol: { alignItems: 'center', gap: space[3] },
  setBtn: {
    backgroundColor: 'rgba(196, 84, 122, 0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(196, 84, 122, 0.3)',
    borderRadius: radii.full,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  setBtnDisabled: { opacity: 0.5 },
  setBtnText: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.accent, letterSpacing: 0.3 },
  cancelBtn: { paddingVertical: space[2] },
  cancelText: { fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted },

  currentCard: {
    alignItems: 'center',
    gap: space[2],
    paddingVertical: space[5],
  },
  currentEmoji: { fontSize: 56 },
  currentLabel: { fontFamily: fonts.serifBold, fontSize: 22, color: colors.text },
  tapHint: {
    fontFamily: fonts.sansMedium, fontSize: 13, color: colors.accent,
    marginTop: space[2],
    backgroundColor: 'rgba(196, 84, 122, 0.1)',
    paddingVertical: 6, paddingHorizontal: 14,
    borderRadius: radii.full,
    overflow: 'hidden',
  },

  partnerDisplay: {
    alignItems: 'center',
    gap: space[2],
    paddingVertical: space[4],
  },
  partnerEmoji: { fontSize: 48 },
  partnerLabel: {
    fontFamily: fonts.serifBold,
    fontSize: 20,
    color: colors.text,
  },

  emptyState: {
    alignItems: 'center',
    gap: space[2],
    paddingVertical: space[4],
  },
  emptyIcon: { fontSize: 32 },
  emptyText: { fontFamily: fonts.sans, fontSize: 14, color: colors.textMuted, fontStyle: 'italic' },

  errorText: { fontFamily: fonts.sans, fontSize: 13, color: colors.no },

  chatTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[4],
    paddingHorizontal: space[5],
    paddingVertical: space[4],
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chatTriggerIconWrap: {
    width: 44,
    height: 44,
    borderRadius: radii.full,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatTriggerIcon: { fontSize: 22 },
  chatTriggerTitle: {
    fontFamily: fonts.serifBold,
    fontSize: 16,
    color: colors.text,
    letterSpacing: -0.2,
  },
  chatTriggerHint: {
    fontFamily: fonts.sansLight,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  chatTriggerChevron: {
    fontFamily: fonts.sansMedium,
    fontSize: 22,
    color: colors.accent,
    marginLeft: space[1],
  },
});
