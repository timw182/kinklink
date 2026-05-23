import { useEffect, useRef } from 'react';
import { TouchableOpacity, Text, View, StyleSheet, Dimensions, ScrollView, Animated } from 'react-native';
import { CATEGORIES } from '../lib/constants';
import { colors, fonts, radii, space } from '../theme/tokens';

const { width } = Dimensions.get('window');
const IS_TABLET = width >= 768;

// Per-category accent tints for the phone picker pill
const CATEGORY_TINT = {
  foreplay:    { bg: 'rgba(242,184,204,0.22)', border: 'rgba(242,184,204,0.7)' },
  positions:   { bg: 'rgba(196,176,232,0.22)', border: 'rgba(196,176,232,0.7)' },
  settings:    { bg: 'rgba(176,196,232,0.22)', border: 'rgba(176,196,232,0.7)' },
  roleplay:    { bg: 'rgba(232,200,160,0.22)', border: 'rgba(232,200,160,0.7)' },
  'toys-gear': { bg: 'rgba(176,212,192,0.22)', border: 'rgba(176,212,192,0.7)' },
  adventurous: { bg: 'rgba(240,192,160,0.22)', border: 'rgba(240,192,160,0.7)' },
};

export default function CategoryPicker({ active, onChange, progress = {}, overlayTag = null }) {
  if (IS_TABLET) return <TabletPicker active={active} onChange={onChange} progress={progress} overlayTag={overlayTag} />;
  return <PhonePicker active={active} onChange={onChange} progress={progress} overlayTag={overlayTag} />;
}

/* ── Pill-shaped swipe-response overlay ──────────────────────── */
function PillOverlay({ label, color, borderRadius }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.94)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 140, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, stiffness: 240, damping: 22, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFillObject,
        {
          backgroundColor: color,
          borderRadius,
          alignItems: 'center',
          justifyContent: 'center',
          opacity,
          transform: [{ scale }],
          shadowColor: color,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.35,
          shadowRadius: 10,
          elevation: 4,
        },
      ]}
    >
      <Text style={overlayStyles.label}>{label}</Text>
    </Animated.View>
  );
}

const overlayStyles = StyleSheet.create({
  label: {
    fontFamily: fonts.serifBold,
    fontSize: 16,
    color: '#fff',
    letterSpacing: 1.2,
  },
});

/* ── Tablet: all categories visible as horizontal pills ──────── */
function TabletPicker({ active, onChange, progress, overlayTag }) {
  return (
    <View style={tabletStyles.row}>
      {CATEGORIES.map((cat) => {
        const isActive = cat.key === active;
        const prog = progress[cat.key] || {};
        return (
          <TouchableOpacity
            key={cat.key}
            style={[tabletStyles.pill, isActive && tabletStyles.pillActive]}
            onPress={() => onChange(cat.key)}
            activeOpacity={0.7}
          >
            <Text style={tabletStyles.emoji}>{cat.emoji}</Text>
            <Text style={[tabletStyles.label, isActive && tabletStyles.labelActive]}>{cat.label}</Text>
            {prog.total > 0 && (
              <Text style={[tabletStyles.count, isActive && tabletStyles.countActive]}>
                {prog.done}/{prog.total}
              </Text>
            )}
            {isActive && overlayTag && (
              <PillOverlay
                key={overlayTag.id}
                label={overlayTag.label}
                color={overlayTag.color}
                borderRadius={radii.full}
              />
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const tabletStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: space[6],
    paddingVertical: space[3],
    flexWrap: 'wrap',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radii.full,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  pillActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  emoji: { fontSize: 16 },
  label: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.textMuted },
  labelActive: { color: colors.accent },
  count: {
    fontFamily: fonts.sans, fontSize: 11, color: colors.textLight,
    backgroundColor: colors.surfaceAlt, paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: radii.full, overflow: 'hidden',
  },
  countActive: { backgroundColor: 'rgba(196,84,122,0.1)', color: colors.accent },
});

/* ── Phone: styled carousel with progress + dots ─────────────── */
function PhonePicker({ active, onChange, progress, overlayTag }) {
  const activeIdx = CATEGORIES.findIndex((c) => c.key === active);
  const cat = CATEGORIES[activeIdx] || CATEGORIES[0];
  const prog = progress[cat.key] || {};
  const tint = CATEGORY_TINT[cat.key] || { bg: colors.surfaceAlt, border: colors.border };
  const progressPct = prog.total > 0 ? prog.done / prog.total : 0;

  function prev() {
    onChange(CATEGORIES[(activeIdx - 1 + CATEGORIES.length) % CATEGORIES.length].key);
  }
  function next() {
    onChange(CATEGORIES[(activeIdx + 1) % CATEGORIES.length].key);
  }

  return (
    <View style={phoneStyles.wrapper}>
      <View style={phoneStyles.row}>
        <TouchableOpacity onPress={prev} style={phoneStyles.arrow} activeOpacity={0.6}>
          <Text style={phoneStyles.arrowText}>‹</Text>
        </TouchableOpacity>

        <View style={[phoneStyles.center, { backgroundColor: tint.bg, borderColor: tint.border }]}>
          <Text style={phoneStyles.emoji}>{cat.emoji}</Text>
          <View style={phoneStyles.labelCol}>
            <Text style={phoneStyles.label}>{cat.label}</Text>
            {prog.total > 0 && (
              <View style={phoneStyles.progressTrack}>
                <View style={[phoneStyles.progressFill, { width: `${Math.round(progressPct * 100)}%` }]} />
              </View>
            )}
          </View>
          {prog.total > 0 && (
            <Text style={phoneStyles.count}>{prog.done}/{prog.total}</Text>
          )}
          {overlayTag && (
            <PillOverlay
              key={overlayTag.id}
              label={overlayTag.label}
              color={overlayTag.color}
              borderRadius={radii.xl}
            />
          )}
        </View>

        <TouchableOpacity onPress={next} style={phoneStyles.arrow} activeOpacity={0.6}>
          <Text style={phoneStyles.arrowText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Category position dots */}
      <View style={phoneStyles.dots}>
        {CATEGORIES.map((c, i) => (
          <TouchableOpacity
            key={c.key}
            onPress={() => onChange(c.key)}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            <View style={[phoneStyles.dot, i === activeIdx && phoneStyles.dotActive]} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const phoneStyles = StyleSheet.create({
  wrapper: { paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: space[1], gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  arrow: {
    width: 40, height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  arrowText: { fontSize: 22, color: colors.textMuted, lineHeight: 26 },

  center: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radii.xl,
    borderWidth: 1.5,
  },
  emoji: { fontSize: 20 },
  labelCol: { flex: 1, gap: 4 },
  label: {
    fontFamily: fonts.serifBold,
    fontSize: 15,
    color: colors.text,
  },
  progressTrack: {
    height: 3,
    backgroundColor: 'rgba(45,31,61,0.08)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 3,
    backgroundColor: colors.accent,
    borderRadius: 2,
  },
  count: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.textMuted,
  },

  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.accent,
    width: 14,
  },
});
