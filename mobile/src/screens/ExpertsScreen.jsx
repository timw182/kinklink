import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Polyline } from 'react-native-svg';
import { colors, fonts, space, radii } from '../theme/tokens';

const QUOTES = [
  { emoji: '🔬', text: 'We asked a scientist but they said they were busy swiping.' },
  { emoji: '🎓', text: '"Venn is the most important discovery since gravity." — Someone, probably.' },
  { emoji: '📋', text: 'Our clinical trials consisted of two people on a couch. Results were positive.' },
  { emoji: '🧠', text: '"Communication is key." We just made the lock a little more fun.' },
  { emoji: '🏆', text: 'Winner of zero awards. But we believe in ourselves.' },
];

export default function ExpertsScreen({ navigation }) {
  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} activeOpacity={0.7}>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Polyline points="15 18 9 12 15 6" stroke={colors.textMuted} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          <Text style={s.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={s.title}>What Experts Say</Text>
        <Text style={s.subtitle}>...once we find some</Text>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={s.heroCard}>
          <Text style={s.heroEmoji}>🧑‍🔬</Text>
          <Text style={s.heroTitle}>Still looking for experts</Text>
          <Text style={s.heroBody}>
            Turns out, nobody has a PhD in "couple swiping dynamics" yet. If you know someone, send them our way.
          </Text>
        </View>

        {QUOTES.map((q, i) => (
          <View key={i} style={s.card}>
            <Text style={s.cardEmoji}>{q.emoji}</Text>
            <Text style={s.cardText}>{q.text}</Text>
          </View>
        ))}

        <View style={s.whyCard}>
          <Text style={s.whyTitle}>Why we built Venn</Text>
          <Text style={s.whyBody}>Most couples have shared interests they never quite get around to talking about — not because they don't trust each other, but because the conversation itself feels awkward. What if they say no? What if it gets weird?</Text>

          <Text style={s.whyBody}>We built Venn to take that pressure away. Both of you swipe independently, and only the things you both said yes to ever surface. No one sees a rejection. No one feels judged.</Text>
          <Text style={s.whyBody}>It's not about fixing something that's broken. It's about giving couples a low-stakes way to discover what they already have in common — and maybe be surprised by it.</Text>
          <Text style={s.whyBody}>No algorithms trying to keep you scrolling. No ads. No data sold. Just you two, finding your overlap.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: space[5], paddingTop: space[3], paddingBottom: space[4] },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: space[3] },
  backText: { fontFamily: fonts.sans, fontSize: 14, color: colors.textMuted },
  title: { fontFamily: fonts.serifBold, fontSize: 28, color: colors.text, fontStyle: 'italic', marginBottom: 2 },
  subtitle: { fontFamily: fonts.sans, fontSize: 14, color: colors.textLight, fontStyle: 'italic' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: space[5], paddingBottom: space[10], gap: space[3] },
  heroCard: {
    backgroundColor: 'rgba(155,128,212,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(155,128,212,0.2)',
    borderRadius: radii.xl,
    padding: space[6],
    alignItems: 'center',
    gap: space[3],
    marginBottom: space[2],
  },
  heroEmoji: { fontSize: 48 },
  heroTitle: { fontFamily: fonts.serifBold, fontSize: 20, color: colors.text, textAlign: 'center' },
  heroBody: { fontFamily: fonts.sans, fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 21 },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[3],
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: space[4],
  },
  cardEmoji: { fontSize: 24 },
  cardText: { flex: 1, fontFamily: fonts.sans, fontSize: 14, color: colors.textMuted, lineHeight: 21, fontStyle: 'italic' },
  whyCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: space[5],
    gap: space[3],
    marginTop: space[3],
  },
  whyTitle: {
    fontFamily: fonts.serifBold,
    fontSize: 18,
    color: colors.text,
    fontStyle: 'italic',
  },
  whyBody: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 21,
  },
});
