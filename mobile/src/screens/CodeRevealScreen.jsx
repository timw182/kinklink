import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, ScrollView, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../context/useAuth';
import { SCREENS } from '../lib/constants';
import { colors, fonts, space, radii } from '../theme/tokens';
import Button from '../components/Button';
import client from '../api/client';

export default function CodeRevealScreen({ navigation, route }) {
  const { code, emailSent = true } = route.params;
  const { setUser, enterPendingPair } = useAuth();
  const [copied, setCopied] = useState(false);

  // Poll for partner joining (stop after 30 minutes)
  const [pollExpired, setPollExpired] = useState(false);
  useEffect(() => {
    let attempts = 0;
    const maxAttempts = 450; // 30min at 4s intervals
    const poll = setInterval(async () => {
      attempts++;
      if (attempts >= maxAttempts) {
        clearInterval(poll);
        setPollExpired(true);
        return;
      }
      try {
        const raw = await client.get('/auth/me');
        if (raw?.couple_id) {
          clearInterval(poll);
          setUser({
            id: raw.id,
            username: raw.username,
            displayName: raw.display_name,
            avatarColor: raw.avatar_color,
            coupleId: raw.couple_id ?? null,
            partnerName: raw.partner_name ?? null,
          });
          navigation.replace(SCREENS.CONNECTED);
        }
      } catch {}
    }, 4000);
    return () => clearInterval(poll);
  }, []);

  // Pulse animation
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.6, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  async function handleCopy() {
    await Clipboard.setStringAsync(code);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  async function handleShare() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Share.share({
        message: `Join me on Venn! Enter my invite code: ${code}\n\nhttps://venn.lu`,
      });
    } catch {}
  }

  const chars = code.split('');

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="always">

        <TouchableOpacity onPress={() => navigation.navigate(SCREENS.PAIRING)} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.textMuted} />
          <Text style={styles.backText}>back</Text>
        </TouchableOpacity>

        <View style={styles.successRing}>
          <Text style={styles.successEmoji}>🎉</Text>
        </View>

        <Text style={styles.title}>Your invite code</Text>
        <Text style={styles.subtitle}>Share this with your partner — they enter it to join you.</Text>

        {/* OTP boxes */}
        <View style={styles.otpRow}>
          {chars.map((char, i) => (
            <View key={i} style={styles.otpCell}>
              <Text style={styles.otpChar}>{char}</Text>
            </View>
          ))}
        </View>

        {/* Email confirmation */}
        <View style={styles.emailPill}>
          <Feather name={emailSent ? 'mail' : 'bookmark'} size={14} color={colors.deepViolet} />
          <Text style={styles.emailText}>
            {emailSent
              ? <>Sent to your email — also findable in <Text style={styles.emailEm}>Settings → Pairing</Text></>
              : <>Keep this code somewhere safe — also findable in <Text style={styles.emailEm}>Settings → Pairing</Text></>}
          </Text>
        </View>

        <Button variant="primary" size="lg" fullWidth onPress={handleCopy}>
          {copied ? '✓  Copied!' : '⎘  Copy code'}
        </Button>

        <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.7}>
          <Feather name="share" size={16} color={colors.violet} />
          <Text style={styles.shareBtnText}>Share with your partner</Text>
        </TouchableOpacity>

        <Text style={styles.shareNote}>
          Or send it however you like — voice note, written on a napkin…{'\n'}
          <Text style={styles.shareNoteEm}>Your partner enters it under Settings → Pairing.</Text>
        </Text>

        <View style={{ flex: 1 }} />

        {/* Waiting indicator */}
        <View style={styles.waitingRow}>
          <Animated.View style={[styles.pulseDot, { transform: [{ scale: pulseAnim }] }]} />
          <Text style={styles.waitingText}>Waiting for your person to join…</Text>
        </View>

        <TouchableOpacity
          onPress={() => {
            enterPendingPair();
            setTimeout(() => navigation.reset({ index: 0, routes: [{ name: 'Main' }] }), 50);
          }}
          style={styles.switchBtn}
        >
          <Text style={styles.switchText}>Match later with the code →</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: space[6],
    paddingTop: space[6],
    paddingBottom: space[10],
    alignItems: 'center',
  },

  backBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', marginBottom: space[8],
  },
  backText: { fontFamily: fonts.sans, fontSize: 14, color: colors.textMuted },

  successRing: {
    width: 64, height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(196,84,122,0.1)',
    borderWidth: 2,
    borderColor: 'rgba(196,84,122,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space[5],
  },
  successEmoji: { fontSize: 28 },

  title: {
    fontFamily: fonts.serifBold,
    fontSize: 26,
    color: colors.text,
    letterSpacing: -0.3,
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fonts.sansLight,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: space[7],
  },

  otpRow: {
    flexDirection: 'row',
    gap: 7,
    marginBottom: space[5],
  },
  otpCell: {
    width: 38, height: 50,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpChar: {
    fontFamily: fonts.serifBold,
    fontSize: 20,
    color: colors.violet,
  },

  emailPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(155,128,212,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(155,128,212,0.22)',
    borderRadius: radii.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: space[4],
    alignSelf: 'stretch',
  },
  emailText: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.deepViolet,
    flex: 1,
    lineHeight: 17,
  },
  emailEm: { fontWeight: '500' },

  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'stretch',
    paddingVertical: 13,
    borderWidth: 1.5,
    borderColor: 'rgba(155,128,212,0.3)',
    borderRadius: radii.lg,
    backgroundColor: 'rgba(155,128,212,0.06)',
    marginTop: space[3],
  },
  shareBtnText: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.violet,
  },

  shareNote: {
    fontFamily: fonts.sansLight,
    fontSize: 12,
    color: colors.textLight,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: space[4],
    paddingHorizontal: space[2],
  },
  shareNoteEm: {
    fontFamily: fonts.sans,
    color: colors.textMuted,
  },

  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: space[8],
  },
  pulseDot: {
    width: 8, height: 8,
    borderRadius: 4,
    backgroundColor: colors.rose,
    opacity: 0.7,
  },
  waitingText: {
    fontFamily: fonts.sansLight,
    fontSize: 12,
    color: colors.textLight,
  },

  switchBtn: { marginTop: space[5], alignSelf: 'center', padding: space[2] },
  switchText: { fontFamily: fonts.sansLight, fontSize: 13, color: colors.textLight },
});
