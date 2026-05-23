import { useState, useEffect, useMemo, useCallback, useRef } from 'react';

import { View, Text, Pressable, StyleSheet, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CategoryPicker from '../components/CategoryPicker';
import CardStack from '../components/CardStack';
import CardPile from '../components/CardPile';
import { CATEGORIES } from '../lib/constants';
import { colors, fonts, space } from '../theme/tokens';
import { useMatches } from '../context/MatchContext';
import client from '../api/client';
import SlideView from '../components/SlideView';

const IS_TABLET = Dimensions.get('window').width >= 768;

export default function BrowseScreen() {
  const [activeCategory, setActiveCategory] = useState('foreplay');
  const [catalog, setCatalog] = useState([]);
  const [responses, setResponses] = useState({});
  const [matchItem, setMatchItem] = useState(null);
  const [lastResponse, setLastResponse] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [stackHeight, setStackHeight] = useState(0);
  const [swipeTag, setSwipeTag] = useState(null);
  const matchTimerRef = useRef(null);
  const matchDelayRef = useRef(null);
  const handledMatchRef = useRef(null);
  const swipeTagTimerRef = useRef(null);

  const { latestNewMatch, dismissLatest, refetch, resetState } = useMatches();

  // Load catalog + responses on mount, and reload after a reset
  const prevResetState = useRef(resetState);
  useEffect(() => {
    const wasReset = prevResetState.current !== 'none' && resetState === 'none';
    prevResetState.current = resetState;

    if (wasReset) {
      // Reset just completed — clear local responses
      setResponses({});
    }

    setLoadError(false);
    Promise.all([client.get('/catalog'), client.get('/catalog/responses')])
      .then(([items, resps]) => {
        setCatalog(items);
        setResponses(resps);
      })
      .catch(() => setLoadError(true));
  }, [resetState]);

  // React to match from WS (triggered_by check is in MatchContext)
  useEffect(() => {
    if (!latestNewMatch) return;
    if (handledMatchRef.current === latestNewMatch.id) return;
    handledMatchRef.current = latestNewMatch.id;
    const item = catalog.find((i) => i.id === latestNewMatch.id) || latestNewMatch;
    clearTimeout(matchTimerRef.current);
    clearTimeout(matchDelayRef.current);
    matchDelayRef.current = setTimeout(() => {
      setMatchItem(item);
      matchTimerRef.current = setTimeout(() => {
        setMatchItem(null);
        dismissLatest();
      }, 3000);
    }, 300);
    return () => { clearTimeout(matchDelayRef.current); clearTimeout(matchTimerRef.current); };
  }, [latestNewMatch, catalog, dismissLatest]);

  const categoryItems = useMemo(() => {
    return catalog.filter((item) => item.category === activeCategory && !responses[String(item.id)]);
  }, [catalog, activeCategory, responses]);

  // Items swiped yes/no in the active category (for side piles)
  const yesItems = useMemo(() => {
    return catalog.filter((i) => i.category === activeCategory && responses[String(i.id)] === 'yes');
  }, [catalog, activeCategory, responses]);

  const noItems = useMemo(() => {
    return catalog.filter((i) => i.category === activeCategory && responses[String(i.id)] === 'no');
  }, [catalog, activeCategory, responses]);

  const progress = useMemo(() => {
    const prog = {};
    for (const cat of CATEGORIES) {
      const total = catalog.filter((i) => i.category === cat.key).length;
      const done = catalog.filter((i) => i.category === cat.key && responses[String(i.id)]).length;
      prog[cat.key] = { total, done };
    }
    return prog;
  }, [catalog, responses]);

  // Auto-clear undo after 30 seconds
  useEffect(() => {
    if (!lastResponse) return;
    const t = setTimeout(() => setLastResponse(null), 30000);
    return () => clearTimeout(t);
  }, [lastResponse]);

  const handleUndo = useCallback(() => {
    if (!lastResponse) return;
    const { item } = lastResponse;
    setLastResponse(null);
    setResponses((prev) => {
      const next = { ...prev };
      delete next[String(item.id)];
      return next;
    });
    client.delete(`/catalog/respond/${item.id}`).catch(() => {});
  }, [lastResponse]);

  const handleRespond = useCallback((itemId, response) => {
    const item = catalog.find((i) => i.id === itemId);
    if (item) setLastResponse({ item, response });
    setResponses((prev) => ({ ...prev, [String(itemId)]: response }));

    // Surface the swipe response as an overlay on the category pill
    const label = response === 'yes' ? '✓  Yes' : response === 'no' ? '✕  No' : '~  Maybe';
    const color = response === 'yes' ? colors.yes : response === 'no' ? colors.no : colors.maybe;
    clearTimeout(swipeTagTimerRef.current);
    setSwipeTag({ id: itemId + ':' + response + ':' + Date.now(), label, color });
    swipeTagTimerRef.current = setTimeout(() => setSwipeTag(null), 1200);

    client.post('/catalog/respond', { item_id: itemId, response })
      .then((data) => {
        if (response === 'yes') refetch();
        if (data?.match) {
          const matched = catalog.find((i) => i.id === data.match.id) || data.match;
          clearTimeout(matchTimerRef.current);
          clearTimeout(matchDelayRef.current);
          matchDelayRef.current = setTimeout(() => {
            setMatchItem(matched);
            matchTimerRef.current = setTimeout(() => {
              setMatchItem(null);
              dismissLatest();
            }, 3000);
          }, 300);
        }
      })
      .catch(() => {
        // Roll back optimistic state so user can retry
        setResponses((prev) => {
          const next = { ...prev };
          delete next[String(itemId)];
          return next;
        });
      });
  }, [catalog, refetch, dismissLatest]);

  return (
    <SlideView>
      <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Explore</Text>
        <Text style={styles.headerSub}>200+ activities across 6 categories</Text>
      </View>
      <CategoryPicker active={activeCategory} onChange={setActiveCategory} progress={progress} overlayTag={swipeTag} />
      <View style={styles.stackArea} onLayout={(e) => setStackHeight(e.nativeEvent.layout.height)}>
        {loadError && catalog.length === 0 ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>Couldn't load activities</Text>
            <Pressable onPress={() => {
              setLoadError(false);
              Promise.all([client.get('/catalog'), client.get('/catalog/responses')])
                .then(([items, resps]) => { setCatalog(items); setResponses(resps); })
                .catch(() => setLoadError(true));
            }}>
              <Text style={styles.retryText}>Tap to retry</Text>
            </Pressable>
          </View>
        ) : IS_TABLET ? (
          <View style={styles.tabletRow}>
            <CardPile items={noItems.slice(-5)} side="no" totalCount={noItems.length} />
            <CardStack
              items={categoryItems}
              onRespond={handleRespond}
              matchItem={matchItem}
              onUndo={lastResponse ? handleUndo : null}
              availableHeight={stackHeight}
            />
            <CardPile items={yesItems.slice(-5)} side="yes" totalCount={yesItems.length} />
          </View>
        ) : (
          <CardStack
            items={categoryItems}
            onRespond={handleRespond}
            matchItem={matchItem}
            onUndo={lastResponse ? handleUndo : null}
            availableHeight={stackHeight}
          />
        )}
      </View>
    </SafeAreaView>
    </SlideView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  header: {
    paddingHorizontal: space[5],
    paddingTop: space[4],
    paddingBottom: space[2],
  },
  headerTitle: {
    fontFamily: fonts.serifBold,
    fontSize: 24,
    color: colors.text,
  },
  headerSub: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  stackArea: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: space[6] },
  errorBox: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  errorText: { fontFamily: fonts.sans, fontSize: 15, color: colors.textMuted, marginBottom: 8 },
  retryText: { fontFamily: fonts.sans, fontSize: 15, color: colors.accent, fontWeight: '600' },
  tabletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
});
