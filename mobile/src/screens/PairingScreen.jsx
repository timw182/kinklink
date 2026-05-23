import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Keyboard,
  Dimensions, Modal, Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const IS_TABLET = Dimensions.get('window').width >= 768;

import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/useAuth';
import { usePurchase } from '../context/PurchaseContext';
import client from '../api/client';
import { SCREENS } from '../lib/constants';
import { colors, fonts, space, radii } from '../theme/tokens';
import Button from '../components/Button';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

export default function PairingScreen({ navigation, route }) {
  const [mode, setMode] = useState(route?.params?.initialMode ?? null); // null | 'join'
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [onboardingVisible, setOnboardingVisible] = useState(false);
  const [onboardingSlide, setOnboardingSlide] = useState(0);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const { pair, createPairingCode, enterSolo, logout, loading } = useAuth();
  const { credits, purchasePairingCode, refreshCredits } = usePurchase();

  useEffect(() => {
    refreshCredits();
  }, [refreshCredits]);

  useEffect(() => {
    AsyncStorage.getItem('vn_show_onboarding').then((v) => {
      if (v === '1') {
        setOnboardingVisible(true);
        AsyncStorage.removeItem('vn_show_onboarding').catch(() => {});
      }
    }).catch(() => {});
  }, []);

  function nextSlide() {
    Animated.timing(slideAnim, { toValue: -300, duration: 220, useNativeDriver: true }).start(() => {
      setOnboardingSlide(1);
      slideAnim.setValue(300);
      Animated.timing(slideAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start();
    });
  }

  async function handleCreate() {
    setError('');
    setCreating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      // Check if an active code already exists — no purchase needed then
      const status = await client.get('/pairing/status');
      const hasActiveCode = !!status?.pairing_code;
      const latestCredits = Number(status?.pairing_credits) || 0;
      if (!hasActiveCode && latestCredits <= 0) {
        const result = await purchasePairingCode();
        if (!result) {
          // User cancelled
          setCreating(false);
          return;
        }
      }
      const { code, emailSent } = await createPairingCode();
      navigation.replace(SCREENS.CODE_REVEAL, { code, emailSent });
    } catch (err) {
      setError(err.message || 'Could not create invite');
    } finally {
      setCreating(false);
    }
  }

  async function handleJoin() {
    setError('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await pair(joinCode);
      navigation.replace(SCREENS.CONNECTED);
    } catch (err) {
      setError(err.message || 'Invalid code');
    }
  }

  async function handleSolo() {
    Haptics.selectionAsync();
    await enterSolo();
    // State update is batched — let React commit isSolo=true before navigating
    setTimeout(() => navigation.reset({ index: 0, routes: [{ name: 'Main' }] }), 50);
  }

  // ── Join mode ──
  if (mode === 'join') {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="always">
        <View style={IS_TABLET ? styles.tabletInner : null}>
            <TouchableOpacity onPress={() => { Keyboard.dismiss(); setMode(null); setError(''); }} style={styles.backBtn}>
              <Feather name="arrow-left" size={20} color={colors.textMuted} />
              <Text style={styles.backText}>back</Text>
            </TouchableOpacity>

            <View style={styles.header}>
              <Text style={styles.title}>Enter the code</Text>
              <Text style={styles.subtitle}>Your partner's 8-character invite code</Text>
            </View>

            <TextInput
              style={styles.codeInput}
              value={joinCode}
              onChangeText={(t) => setJoinCode(t.toUpperCase())}
              placeholder="········"
              placeholderTextColor={colors.textLight}
              maxLength={8}
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
            />

            {!!error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Button
              variant="primary"
              size="lg"
              fullWidth
              onPress={handleJoin}
              loading={loading}
              disabled={loading || joinCode.length < 6}
            >
              Connect
            </Button>

            <TouchableOpacity onPress={handleSolo} style={styles.skipBtn}>
              <Text style={styles.skipText}>Connect later →</Text>
            </TouchableOpacity>
        </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Choice screen ──
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="always">
        <View style={IS_TABLET ? styles.tabletInner : null}>
        <TouchableOpacity onPress={logout} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.textMuted} />
          <Text style={styles.backText}>log out</Text>
        </TouchableOpacity>

        {/* Onboarding modal */}
        <Modal visible={onboardingVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Animated.View style={{ transform: [{ translateX: slideAnim }] }}>
                {onboardingSlide === 0 ? (
                  <View style={styles.modalSlide}>
                    <Text style={styles.modalEmoji}>🔒</Text>
                    <Text style={styles.modalTitle}>No rejection, ever</Text>
                    <Text style={styles.modalBody}>
                      You and your partner each swipe independently. Neither of you ever sees what the other said no to.{'\n\n'}Only mutual matches are revealed.
                    </Text>
                    <TouchableOpacity style={styles.modalBtn} onPress={nextSlide}>
                      <Text style={styles.modalBtnText}>Next →</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.modalSlide}>
                    <Text style={styles.modalEmoji}>💌</Text>
                    <Text style={styles.modalTitle}>Invite your partner</Text>
                    <Text style={styles.modalBody}>
                      Create an invite code below and share it with your partner. Once they enter it, you're connected and ready to discover your overlap.
                    </Text>
                    <TouchableOpacity style={styles.modalBtn} onPress={() => setOnboardingVisible(false)}>
                      <Text style={styles.modalBtnText}>Let's go</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </Animated.View>
              <View style={styles.modalDots}>
                <View style={[styles.modalDot, onboardingSlide === 0 && styles.modalDotActive]} />
                <View style={[styles.modalDot, onboardingSlide === 1 && styles.modalDotActive]} />
              </View>
            </View>
          </View>
        </Modal>

        <View style={styles.hero}>
          <Text style={styles.title}>Connect with{'\n'}your person.</Text>
          <Text style={styles.subtitle}>Find what you have in common.</Text>
        </View>

        <View style={styles.howItWorks}>
          {[
            { n: '1', text: 'Create or receive an invite code' },
            { n: '2', text: 'Both swipe independently — privately' },
            { n: '3', text: 'Only mutual matches are revealed' },
          ].map((s) => (
            <View key={s.n} style={styles.howStep}>
              <View style={styles.howBadge}>
                <Text style={styles.howNum}>{s.n}</Text>
              </View>
              <Text style={styles.howText}>{s.text}</Text>
            </View>
          ))}
        </View>

        {!!error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.cards}>

          {/* Create invite */}
          <TouchableOpacity
            style={[styles.card, styles.cardAccent]}
            onPress={handleCreate}
            activeOpacity={0.8}
            disabled={creating}
          >
            <View style={[styles.cardIconBox, styles.cardIconBoxAccent]}>
              {creating
                ? <ActivityIndicator size="small" color={colors.rose} />
                : <Text style={styles.cardEmoji}>💌</Text>
              }
            </View>
            <View style={styles.cardBody}>
              <Text style={[styles.cardTitle, { color: colors.rose }]}>Create an invite</Text>
              <Text style={styles.cardDesc}>Generate a code and share it with your partner</Text>
              {credits > 0
                ? <Text style={styles.cardPrice}><Text style={[styles.cardPriceValue, { color: colors.violet }]}>{credits} credit{credits === 1 ? '' : 's'} available ✓</Text></Text>
                : <Text style={styles.cardPrice}><Text style={styles.cardPriceValue}>€9.99</Text>  ·  one-time</Text>
              }
            </View>
          </TouchableOpacity>

          <View style={styles.orRow}>
            <View style={styles.orLine} />
            <Text style={styles.orText}>or</Text>
            <View style={styles.orLine} />
          </View>

          {/* Enter code */}
          <TouchableOpacity
            style={styles.card}
            onPress={() => { setMode('join'); setError(''); }}
            activeOpacity={0.8}
          >
            <View style={styles.cardIconBox}>
              <Text style={styles.cardEmoji}>🔑</Text>
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>I have a code</Text>
              <Text style={styles.cardDesc}>Enter the code your partner shared with you</Text>
            </View>
          </TouchableOpacity>

        </View>

        <View style={{ flex: 1 }} />

        <TouchableOpacity onPress={handleSolo} style={styles.soloBtn}>
          <Text style={styles.soloText}>Explore solo for now →</Text>
        </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: IS_TABLET ? space[8] : space[6],
    paddingTop: space[8],
    paddingBottom: space[10],
    alignItems: IS_TABLET ? 'center' : undefined,
  },
  tabletInner: {
    width: '100%',
    maxWidth: 460,
  },

  // Brand
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: space[10] },
  logoMark: { flexDirection: 'row', alignItems: 'center' },
  logoName: { fontFamily: fonts.serifBold, fontSize: 20, color: colors.text },

  // Hero
  hero: { marginBottom: space[10] },
  title: { fontFamily: fonts.serifBold, fontSize: 28, color: colors.text, lineHeight: 36, letterSpacing: -0.3 },
  subtitle: { fontFamily: fonts.sansLight, fontSize: 14, color: colors.textMuted, marginTop: 6, lineHeight: 20 },

  // Cards
  cards: { gap: space[3] },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[4],
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: space[4],
  },
  cardAccent: {
    borderColor: 'rgba(196,84,122,0.3)',
    backgroundColor: 'rgba(196,84,122,0.04)',
  },
  cardIconBox: {
    width: 40, height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardIconBoxAccent: {
    backgroundColor: 'rgba(196,84,122,0.1)',
    borderColor: 'rgba(196,84,122,0.25)',
  },
  cardEmoji: { fontSize: 18 },
  cardBody: { flex: 1 },
  cardTitle: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.text,
    marginBottom: 3,
    letterSpacing: 0.2,
  },
  cardDesc: {
    fontFamily: fonts.sansLight,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
  },
  cardPrice: {
    fontFamily: fonts.sansLight,
    fontSize: 11,
    color: colors.textLight,
    marginTop: 2,
  },
  cardPriceValue: {
    fontFamily: fonts.sansMedium,
    color: colors.rose,
  },

  // How it works
  howItWorks: { gap: space[2], marginBottom: space[6] },
  howStep: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  howBadge: {
    width: 22, height: 22,
    borderRadius: radii.full,
    backgroundColor: colors.accentSoft,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  howNum: { fontFamily: fonts.sansMedium, fontSize: 11, color: colors.rose },
  howText: { fontFamily: fonts.sansLight, fontSize: 13, color: colors.textMuted, flex: 1, lineHeight: 18 },

  // Onboarding modal
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space[6],
  },
  modalCard: {
    backgroundColor: colors.bg,
    borderRadius: radii.xl,
    padding: space[8],
    width: '100%',
    maxWidth: 360,
    overflow: 'hidden',
  },
  modalSlide: { alignItems: 'center' },
  modalEmoji: { fontSize: 44, marginBottom: space[5] },
  modalTitle: {
    fontFamily: fonts.serifBold,
    fontSize: 22,
    color: colors.text,
    textAlign: 'center',
    marginBottom: space[4],
    letterSpacing: -0.3,
  },
  modalBody: {
    fontFamily: fonts.sansLight,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: space[8],
  },
  modalBtn: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.lg,
    paddingVertical: 13,
    paddingHorizontal: space[8],
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  modalBtnText: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.rose },
  modalDots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: space[5] },
  modalDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  modalDotActive: { backgroundColor: colors.rose, width: 18 },

  // Or divider
  orRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], marginVertical: 2 },
  orLine: { flex: 1, height: 1, backgroundColor: colors.border },
  orText: { fontFamily: fonts.sansLight, fontSize: 11, color: colors.textLight, letterSpacing: 0.5 },

  // Solo
  soloBtn: { alignSelf: 'center', paddingVertical: space[3] },
  soloText: { fontFamily: fonts.sansLight, fontSize: 13, color: colors.textLight },

  // Skip in join mode
  skipBtn: { alignSelf: 'center', paddingVertical: space[3], marginTop: space[2] },
  skipText: { fontFamily: fonts.sansLight, fontSize: 13, color: colors.textLight },

  // Join mode
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: space[8] },
  backText: { fontFamily: fonts.sans, fontSize: 14, color: colors.textMuted },
  codeInput: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: 16,
    paddingHorizontal: space[5],
    fontFamily: fonts.serifBold,
    fontSize: 28,
    letterSpacing: 8,
    color: colors.violet,
    textAlign: 'center',
    marginBottom: space[4],
  },
  errorBox: { backgroundColor: colors.noSoft, borderRadius: radii.sm, padding: space[3], marginBottom: space[3] },
  errorText: { fontFamily: fonts.sans, fontSize: 13, color: colors.no, textAlign: 'center' },
});
