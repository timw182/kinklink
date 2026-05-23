import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, Animated, Easing } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, fonts, radii, space } from '../theme/tokens';
import { useAuth } from '../context/useAuth';

const { width: SW } = Dimensions.get('window');

// Circle sizing — tuned so the two circles plus overlap fit comfortably
// inside the card area on the smallest phones.
const CIRCLE_SIZE = Math.min(SW * 0.4, 150);
const OVERLAP = CIRCLE_SIZE * 0.42; // lens width
const DIAGRAM_WIDTH = CIRCLE_SIZE * 2 - OVERLAP;

export default function MatchEffect({ item }) {
  const { user } = useAuth();
  const partnerLabel = (user?.partnerName || '').trim().toLowerCase() || 'your person';
  const backdrop = useRef(new Animated.Value(0)).current;
  const leftX = useRef(new Animated.Value(-CIRCLE_SIZE * 2)).current;
  const rightX = useRef(new Animated.Value(CIRCLE_SIZE * 2)).current;
  const leftLabel = useRef(new Animated.Value(0)).current;
  const rightLabel = useRef(new Animated.Value(0)).current;
  const emojiScale = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentY = useRef(new Animated.Value(14)).current;
  const lensPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 480);

    // Backdrop
    Animated.timing(backdrop, {
      toValue: 1,
      duration: 260,
      useNativeDriver: true,
    }).start();

    // Circles drift in from off-screen to settled overlap position
    Animated.parallel([
      Animated.timing(leftX, {
        toValue: 0,
        duration: 720,
        delay: 160,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(rightX, {
        toValue: 0,
        duration: 720,
        delay: 160,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    // Labels appear with their circles
    Animated.timing(leftLabel, {
      toValue: 1,
      duration: 320,
      delay: 380,
      useNativeDriver: true,
    }).start();
    Animated.timing(rightLabel, {
      toValue: 1,
      duration: 320,
      delay: 460,
      useNativeDriver: true,
    }).start();

    // Emoji pops in the intersection just as circles settle
    Animated.spring(emojiScale, {
      toValue: 1,
      stiffness: 200,
      damping: 12,
      delay: 700,
      useNativeDriver: true,
    }).start();

    // Title + caption rise in
    Animated.parallel([
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 360,
        delay: 820,
        useNativeDriver: true,
      }),
      Animated.spring(contentY, {
        toValue: 0,
        stiffness: 150,
        damping: 16,
        delay: 820,
        useNativeDriver: true,
      }),
    ]).start();

    // Gentle lens pulse — keeps the intersection alive while overlay sits
    Animated.loop(
      Animated.sequence([
        Animated.timing(lensPulse, { toValue: 1.06, duration: 1100, useNativeDriver: true }),
        Animated.timing(lensPulse, { toValue: 1, duration: 1100, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View style={[styles.overlay, { opacity: backdrop }]}>
      <View style={styles.diagramArea}>
        {/* Party labels */}
        <View style={styles.labelRow}>
          <Animated.Text
            style={[
              styles.partyLabel,
              styles.partyLeft,
              { opacity: leftLabel, transform: [{ translateY: leftLabel.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }] },
            ]}
          >
            you
          </Animated.Text>
          <Animated.Text
            style={[
              styles.partyLabel,
              styles.partyRight,
              { opacity: rightLabel, transform: [{ translateY: rightLabel.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }] },
            ]}
          >
            {partnerLabel}
          </Animated.Text>
        </View>

        {/* Venn diagram */}
        <View style={styles.diagramRow}>
          <Animated.View
            style={[styles.circle, styles.circleLeft, { transform: [{ translateX: leftX }] }]}
          />
          <Animated.View
            style={[styles.circle, styles.circleRight, { transform: [{ translateX: rightX }] }]}
          />

          {/* Lens highlight + emoji at the intersection */}
          <Animated.View style={[styles.lens, { transform: [{ scale: lensPulse }] }]}>
            <Animated.Text style={[styles.emoji, { transform: [{ scale: emojiScale }] }]}>
              {item.emoji}
            </Animated.Text>
          </Animated.View>
        </View>
      </View>

      {/* Title + caption */}
      <Animated.View
        style={[styles.content, { opacity: contentOpacity, transform: [{ translateY: contentY }] }]}
      >
        <Text style={styles.overlapKicker}>your overlap</Text>
        <Text style={styles.title}>{item.title}</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    borderRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: colors.overlay,
  },

  diagramArea: {
    width: DIAGRAM_WIDTH,
    alignItems: 'center',
    marginBottom: space[6],
  },

  labelRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: space[3],
    paddingHorizontal: CIRCLE_SIZE * 0.22,
  },
  partyLabel: {
    fontFamily: fonts.sansLight,
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 2.2,
    textTransform: 'lowercase',
  },
  partyLeft: { color: 'rgba(220,210,245,0.85)' },
  partyRight: { color: 'rgba(245,210,225,0.85)' },

  diagramRow: {
    width: DIAGRAM_WIDTH,
    height: CIRCLE_SIZE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  circle: {
    position: 'absolute',
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    top: 0,
  },
  circleLeft: {
    left: 0,
    backgroundColor: 'rgba(155,128,212,0.50)',
    borderWidth: 1.5,
    borderColor: 'rgba(155,128,212,0.85)',
  },
  circleRight: {
    right: 0,
    backgroundColor: 'rgba(196,84,122,0.50)',
    borderWidth: 1.5,
    borderColor: 'rgba(196,84,122,0.85)',
  },
  lens: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: OVERLAP * 1.15,
    height: CIRCLE_SIZE * 0.9,
  },
  emoji: {
    fontSize: Math.min(OVERLAP * 0.78, 48),
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },

  content: {
    alignItems: 'center',
    paddingHorizontal: space[5],
  },
  overlapKicker: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 2.6,
    textTransform: 'uppercase',
    marginBottom: space[2],
  },
  title: {
    fontFamily: fonts.serifBold,
    fontSize: 24,
    color: '#fff',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
});
