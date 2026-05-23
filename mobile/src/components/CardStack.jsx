import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import ItemCard, { CARD_WIDTH, getCardHeight } from './ItemCard';
import MatchEffect from './MatchEffect';
import { colors, fonts, radii, space } from '../theme/tokens';

const SWIPE_X = 100;
const SWIPE_Y = 80;
const MAX_ROT = 10;
const VISIBLE = 3;

function BehindCard({ idx, tx, ty }) {
  const baseOffset = idx * 8;
  const baseNarrower = idx * 16;

  const animStyle = useAnimatedStyle(() => {
    const drag = Math.sqrt(tx.value * tx.value + ty.value * ty.value);
    const progress = interpolate(drag, [0, SWIPE_X], [0, 1], Extrapolation.CLAMP);

    const offset = baseOffset - progress * 8;
    const narrower = CARD_WIDTH - baseNarrower + progress * 16;
    return {
      zIndex: VISIBLE - idx,
      width: narrower,
      left: (CARD_WIDTH - narrower) / 2,
      bottom: -offset,
      height: 24,
      borderBottomLeftRadius: 14,
      borderBottomRightRadius: 14,
    };
  });

  return <Animated.View style={[styles.behindCard, animStyle]} />;
}

export default function CardStack({ items = [], onRespond, matchItem, onUndo, availableHeight = 0 }) {
  const [localItems, setLocalItems] = useState(items);
  const [exiting, setExiting] = useState(false);
  const itemsRef = useRef(items);
  const respondingRef = useRef(false);

  const tx = useSharedValue(0);
  const ty = useSharedValue(0);

  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => {
    if (!respondingRef.current) setLocalItems(items);
  }, [items]);

  function doRespond(response) {
    if (respondingRef.current || localItems.length === 0) return;
    respondingRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setExiting(true);
    onRespond?.(localItems[0]?.id, response);

    const targetX = response === 'yes' ? 500 : response === 'no' ? -500 : 0;
    const targetY = response === 'maybe' ? -500 : 0;

    // Put the completion callback on the axis that actually moves,
    // so finishExit fires only after the card has left the screen.
    if (response === 'maybe') {
      tx.value = withTiming(targetX, { duration: 300 });
      ty.value = withTiming(targetY, { duration: 300 }, () => {
        runOnJS(finishExit)();
      });
    } else {
      ty.value = withTiming(targetY, { duration: 300 });
      tx.value = withTiming(targetX, { duration: 300 }, () => {
        runOnJS(finishExit)();
      });
    }
  }

  const exitTimer = useRef(null);

  function finishExit() {
    // Reset shared values BEFORE updating items so the new card
    // never inherits the exit position (which would flash the overlay).
    tx.value = 0;
    ty.value = 0;
    setLocalItems([...itemsRef.current]);
    clearTimeout(exitTimer.current);
    exitTimer.current = setTimeout(() => {
      respondingRef.current = false;
      setExiting(false);
    }, 16);
  }

  useEffect(() => {
    const id = setInterval(() => {
      if (respondingRef.current && !exiting) respondingRef.current = false;
    }, 2000);
    return () => { clearInterval(id); clearTimeout(exitTimer.current); };
  }, [exiting]);

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      tx.value = e.translationX;
      ty.value = e.translationY;
    })
    .onEnd((e) => {
      const { translationX: x, translationY: y, velocityX } = e;
      const yUp = -y;
      if (yUp > SWIPE_Y && yUp > Math.abs(x)) runOnJS(doRespond)('maybe');
      else if (x > SWIPE_X || velocityX > 500) runOnJS(doRespond)('yes');
      else if (x < -SWIPE_X || velocityX < -500) runOnJS(doRespond)('no');
      else {
        tx.value = withSpring(0);
        ty.value = withSpring(0);
      }
    });

  const topCardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { rotate: `${interpolate(tx.value, [-200, 0, 200], [-MAX_ROT, 0, MAX_ROT])}deg` },
    ],
  }));

  // Hint overlays driven entirely by shared values — no JS re-renders
  const yesOverlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(tx.value, [0, SWIPE_X * 0.5, SWIPE_X], [0, 0, 0.88], Extrapolation.CLAMP),
  }));
  const noOverlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(tx.value, [-SWIPE_X, -SWIPE_X * 0.5, 0], [0.88, 0, 0], Extrapolation.CLAMP),
  }));
  const maybeOverlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ty.value, [-SWIPE_Y * 1.5, -SWIPE_Y * 0.6, 0], [0.88, 0, 0], Extrapolation.CLAMP),
  }));

  if (localItems.length === 0 && !exiting) {
    return (
      <View style={styles.empty}>
        <View style={styles.emptyIconRow}>
          <Text style={styles.emptyIconSmall}>🎉</Text>
          <Text style={styles.emptyIconLarge}>✓</Text>
          <Text style={styles.emptyIconSmall}>🎉</Text>
        </View>
        <Text style={styles.emptyTitle}>All caught up</Text>
        <Text style={styles.emptySub}>Try another category or check your matches</Text>
      </View>
    );
  }

  const cardH = getCardHeight(availableHeight);

  return (
    <View style={styles.wrapper}>
      {matchItem && <MatchEffect item={matchItem} />}

      {/* Card stack */}
      <View style={[styles.stack, { width: CARD_WIDTH, height: cardH }]}>
        {!exiting && localItems.slice(1, VISIBLE).map((item, i) => {
          const idx = i + 1;
          return (
            <BehindCard key={item.id} idx={idx} tx={tx} ty={ty} />
          );
        })}
        {localItems.length > 0 && (
          <GestureDetector key={localItems[0].id} gesture={panGesture}>
            <Animated.View style={[styles.cardPos, { zIndex: VISIBLE }, topCardStyle]}>
              <ItemCard item={localItems[0]} cardHeight={availableHeight} />
              <Animated.View style={[styles.hintOverlay, styles.hintYes, yesOverlayStyle]}>
                <Text style={styles.hintText}>YES</Text>
              </Animated.View>
              <Animated.View style={[styles.hintOverlay, styles.hintNo, noOverlayStyle]}>
                <Text style={styles.hintText}>NOPE</Text>
              </Animated.View>
              <Animated.View style={[styles.hintOverlay, styles.hintMaybe, maybeOverlayStyle]}>
                <Text style={styles.hintText}>MAYBE</Text>
              </Animated.View>
            </Animated.View>
          </GestureDetector>
        )}
      </View>

      {/* Action buttons */}
      <View style={styles.buttons}>
        <TouchableOpacity
          style={[styles.btn, styles.btnUndo, !onUndo && styles.btnDisabled]}
          onPress={onUndo}
          disabled={!onUndo}
        >
          <Text style={styles.btnUndo_icon}>↩</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.btnNo]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); doRespond('no'); }}
        >
          <Text style={styles.btnNo_icon}>✕</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.btnMaybe]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); doRespond('maybe'); }}
        >
          <Text style={styles.btnMaybe_icon}>~</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.btnYes]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); doRespond('yes'); }}
        >
          <Text style={styles.btnYes_icon}>✓</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', justifyContent: 'center', gap: space[4] },

  stack: { position: 'relative' },
  cardPos: { position: 'absolute', top: 0, left: 0 },
  behindCard: {
    position: 'absolute',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: colors.border,
  },

  hintOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.xl,
    overflow: 'hidden',
  },
  hintYes:   { backgroundColor: 'rgba(155,128,212,0.88)' },
  hintNo:    { backgroundColor: 'rgba(240,122,106,0.88)' },
  hintMaybe: { backgroundColor: 'rgba(232,168,192,0.88)' },
  hintText: {
    fontFamily: fonts.serifBold,
    fontSize: 48,
    color: '#fff',
    letterSpacing: 4,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },

  buttons: {
    flexDirection: 'row',
    gap: space[3],
    alignItems: 'center',
    paddingTop: space[4],
    paddingBottom: space[2],
  },

  btn: {
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  btnUndo: {
    width: 44,
    height: 44,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  btnUndo_icon: {
    fontSize: 18,
    color: colors.textLight,
  },
  btnNo: {
    width: 58,
    height: 58,
    backgroundColor: colors.no,
  },
  btnNo_icon: {
    fontSize: 22,
    color: '#fff',
    fontWeight: '700',
  },
  btnMaybe: {
    width: 52,
    height: 52,
    backgroundColor: colors.maybeSoft,
    borderWidth: 2,
    borderColor: colors.maybe,
  },
  btnMaybe_icon: {
    fontSize: 22,
    color: colors.maybe,
    fontWeight: '800',
  },
  btnYes: {
    width: 66,
    height: 66,
    backgroundColor: colors.yes,
  },
  btnYes_icon: {
    fontSize: 26,
    color: '#fff',
    fontWeight: '700',
  },
  btnDisabled: { opacity: 0.3 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[3] },
  emptyIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  emptyIconLarge: {
    fontSize: 44,
    color: colors.yes,
    fontFamily: fonts.serifBold,
  },
  emptyIconSmall: { fontSize: 28 },
  emptyTitle: { fontFamily: fonts.serifBold, fontSize: 20, color: colors.text },
  emptySub: { fontFamily: fonts.sansLight, fontSize: 14, color: colors.textMuted, textAlign: 'center' },
});
