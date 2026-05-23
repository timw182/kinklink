import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Modal, View, Text, TouchableOpacity, Pressable, ScrollView,
  StyleSheet, Animated, Dimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Line } from 'react-native-svg';
import { EXPRESSIONS } from '../lib/constants';
import { colors, fonts, space, radii } from '../theme/tokens';
import { useAuth } from '../context/useAuth';
import { useMatches } from '../context/MatchContext';
import client from '../api/client';

const { height: SH } = Dimensions.get('window');
const EXPRESSION_BY_KEY = Object.fromEntries(EXPRESSIONS.map((e) => [e.key, e]));

export default function ChatOverlay({ open, onClose, partnerName }) {
  const { user } = useAuth();
  const { partnerExpression } = useMatches();

  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(SH)).current;
  const [visible, setVisible] = useState(false);

  // Chronological message log, oldest → newest.
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(null); // key currently in-flight
  // Fallback "this is me" id captured from the server's send response, so
  // bubbles stay on the right side even if useAuth().user.id is unhydrated.
  const [knownSelfId, setKnownSelfId] = useState(null);
  const scrollRef = useRef(null);
  const selfId = user?.id ?? knownSelfId;

  // Open/close animation
  useEffect(() => {
    if (open) {
      setVisible(true);
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(slide, { toValue: 0, stiffness: 200, damping: 26, useNativeDriver: true }),
      ]).start();
    } else if (visible) {
      Animated.parallel([
        Animated.timing(fade, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(slide, { toValue: SH, duration: 220, useNativeDriver: true }),
      ]).start(({ finished }) => { if (finished) setVisible(false); });
    }
  }, [open]);

  // Fetch history on open
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    client.get('/mood/expressions')
      .then((data) => { if (!cancelled) setMessages(data || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open]);

  // Append incoming partner messages while open
  useEffect(() => {
    if (!open || !partnerExpression?.id) return;
    setMessages((prev) => {
      if (prev.some((m) => m.id === partnerExpression.id)) return prev;
      return [...prev, {
        id: partnerExpression.id,
        sender_id: partnerExpression.sender_id,
        key: partnerExpression.key,
        sent_at: partnerExpression.sent_at,
      }];
    });
  }, [open, partnerExpression?.ts]);

  // Auto-scroll to bottom whenever the message count changes
  useEffect(() => {
    if (!visible || messages.length === 0) return;
    const t = requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd?.({ animated: true });
    });
    return () => cancelAnimationFrame(t);
  }, [messages.length, visible]);

  const handleSend = useCallback(async (key) => {
    if (sending) return;
    setSending(key);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    // Optimistic: insert a temp row immediately so the bubble appears.
    // We don't gate on user.id — the server determines sender_id from the
    // auth token, so the POST works even if the local user state is stale.
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [...prev, {
      id: tempId,
      sender_id: user?.id ?? null,
      key,
      sent_at: new Date().toISOString(),
      pending: true,
    }]);

    try {
      const msg = await client.post('/mood/expression', { key });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (msg && msg.sender_id) setKnownSelfId(msg.sender_id);
      setMessages((prev) => prev.map((m) => {
        if (m.id !== tempId) return m;
        // Only swap in the server row when it actually carries an id; otherwise
        // keep the optimistic bubble visible so the UI doesn't end up with a
        // null hole in the list (e.g. backend running an older 204 endpoint).
        return msg && msg.id ? msg : { ...m, pending: false };
      }));
    } catch {
      // Roll the optimistic bubble back on failure (rate limit, network, etc.)
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    }
    setSending(null);
  }, [sending, user?.id]);

  if (!visible && !open) return null;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View
          style={[styles.backdrop, { opacity: fade, backgroundColor: colors.overlay }]}
        />
      </Pressable>

      <Animated.View
        style={[styles.card, { opacity: fade, transform: [{ translateY: slide }] }]}
      >
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(partnerName || 'P').charAt(0).toUpperCase()}
              </Text>
            </View>
            <View>
              <Text style={styles.kicker}>chat with</Text>
              <Text style={styles.title}>{partnerName}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={8}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Line x1="18" y1="6"  x2="6"  y2="18" stroke={colors.textMuted} strokeWidth={2.2} strokeLinecap="round" />
              <Line x1="6"  y1="6"  x2="18" y2="18" stroke={colors.textMuted} strokeWidth={2.2} strokeLinecap="round" />
            </Svg>
          </TouchableOpacity>
        </View>

        {/* Message list */}
        <ScrollView
          ref={scrollRef}
          style={styles.messages}
          contentContainerStyle={styles.messagesInner}
          showsVerticalScrollIndicator={false}
        >
          {messages.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>💬</Text>
              <Text style={styles.emptyText}>
                Tap a note below to start the chat.
              </Text>
            </View>
          ) : (
            messages.map((m) => {
              // Pending optimistic bubbles are always mine; otherwise compare
              // against selfId (useAuth's user.id or the fallback captured
              // from a server send response).
              const isMine = m.pending || (selfId != null && m.sender_id === selfId);
              const expr = EXPRESSION_BY_KEY[m.key];
              if (!expr) return null;
              return (
                <View
                  key={m.id}
                  style={[styles.bubbleRow, isMine ? styles.rowMine : styles.rowTheirs]}
                >
                  <View
                    style={[
                      styles.bubble,
                      isMine ? styles.bubbleMine : styles.bubbleTheirs,
                      m.pending && { opacity: 0.6 },
                    ]}
                  >
                    <Text style={styles.bubbleEmoji}>{expr.emoji}</Text>
                    <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>
                      {expr.label}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        {/* "Input" — horizontally scrollable preset chips */}
        <View style={styles.inputArea}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.inputScroll}
            keyboardShouldPersistTaps="handled"
          >
            {EXPRESSIONS.map((e) => {
              const isSending = sending === e.key;
              return (
                <TouchableOpacity
                  key={e.key}
                  style={[styles.chip, isSending && { opacity: 0.5 }]}
                  onPress={() => handleSend(e.key)}
                  disabled={!!sending}
                  activeOpacity={0.75}
                >
                  <Text style={styles.chipEmoji}>{e.emoji}</Text>
                  <Text style={styles.chipLabel} numberOfLines={1}>{e.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject },
  card: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    height: SH * 0.88,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 24,
  },
  handle: {
    alignSelf: 'center',
    width: 40, height: 4,
    backgroundColor: colors.borderStrong,
    borderRadius: 2,
    marginTop: space[3],
    marginBottom: space[2],
    opacity: 0.6,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space[5],
    paddingTop: space[3],
    paddingBottom: space[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  avatar: {
    width: 38, height: 38,
    borderRadius: radii.full,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: fonts.serifBold,
    fontSize: 16,
    color: colors.accent,
  },
  kicker: {
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    color: colors.textLight,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: 1,
  },
  title: {
    fontFamily: fonts.serifBold,
    fontSize: 18,
    color: colors.text,
    letterSpacing: -0.2,
  },
  closeBtn: {
    width: 32, height: 32,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },

  messages: { flex: 1 },
  messagesInner: {
    padding: space[5],
    gap: space[3],
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space[10],
    gap: space[3],
  },
  emptyEmoji: { fontSize: 36, opacity: 0.6 },
  emptyText: {
    fontFamily: fonts.sansLight,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: space[5],
    lineHeight: 20,
  },

  bubbleRow: { flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    borderRadius: 20,
    maxWidth: '75%',
  },
  bubbleMine: {
    backgroundColor: colors.accent,
    borderBottomRightRadius: 6,
  },
  bubbleTheirs: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 6,
  },
  bubbleEmoji: { fontSize: 22 },
  bubbleText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.text,
  },
  bubbleTextMine: { color: '#fff' },

  inputArea: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
    paddingTop: space[3],
    paddingBottom: space[8],
  },
  inputScroll: {
    paddingHorizontal: space[4],
    gap: space[2],
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: space[3],
    paddingRight: space[4],
    paddingVertical: space[3],
    borderRadius: radii.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipEmoji: { fontSize: 20 },
  chipLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.text,
    letterSpacing: 0.1,
  },
});
