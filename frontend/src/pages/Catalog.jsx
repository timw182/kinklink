import { createPortal } from 'react-dom';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CategoryPicker from '../components/catalog/CategoryPicker';
import CardStack from '../components/catalog/CardStack';
import CardPile from '../components/catalog/CardPile';
import MatchEffect from '../components/matches/MatchEffect';
import PageLoader from '../components/shared/PageLoader';
import { CATEGORIES, STORAGE_KEYS } from '../lib/constants';
import client from '../api/client';
import { useMatches } from '../context/MatchContext';
import { useAuth } from '../context/useAuth';
import haptic from '../lib/haptics';
import './Catalog.css';

const MAX_PILE = 5;

function loadLocalResponses() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.RESPONSES) || '{}'); }
  catch { return {}; }
}

function saveLocalResponses(resps) {
  try { localStorage.setItem(STORAGE_KEYS.RESPONSES, JSON.stringify(resps)); } catch {}
}

const CONFETTI_COLORS = ['#F07A6A', '#9B80D4', '#C4547A', '#fa8e9e', '#f3c6d0', '#d4b8f0'];

export default function Catalog() {
  const { user } = useAuth();
  const isLocked = !user?.coupleId;

  const [activeCategory, setActiveCategory] = useState('foreplay');
  const [catalog, setCatalog]               = useState([]);
  const [responses, setResponses]           = useState(loadLocalResponses);
  const [matchItem, setMatchItem]           = useState(null);
  const [lastResponse, setLastResponse]     = useState(null);
  const [confetti, setConfetti]             = useState([]);
  const [loadError, setLoadError]           = useState(false);
  const [loading, setLoading]               = useState(true);
  const [swipeTag, setSwipeTag]             = useState(null);
  const swipeTagTimerRef                    = useRef(null);

  // Per-category piles
  const [recentYes, setRecentYes] = useState([]);
  const [recentNo, setRecentNo]   = useState([]);

  function applyPiles(items, resps, category) {
    const catItems = items.filter((i) => i.category === category);
    setRecentYes(catItems.filter((i) => resps[String(i.id)] === 'yes').slice(0, MAX_PILE));
    setRecentNo(catItems.filter((i)  => resps[String(i.id)] === 'no').slice(0, MAX_PILE));
  }

  // Re-seed piles when category changes (catalog already loaded at this point)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { applyPiles(catalog, responses, activeCategory); }, [activeCategory]);

  const matchTimerRef = useRef(null);
  const knownMatchIds = useRef(new Set());
  const { matches: allMatches, latestNewMatch, dismissLatest, refetch } = useMatches();

  // Seed known match IDs so we can detect new ones
  useEffect(() => {
    allMatches.forEach((m) => knownMatchIds.current.add(m.id));
  }, [allMatches]);

  // ── Data loading ────────────────────────────────────────────────────────────
  const loadCatalog = useCallback(() => {
    setLoadError(false);
    setLoading(true);
    Promise.all([client.get('/catalog'), client.get('/catalog/responses')])
      .then(([items, resps]) => {
        setCatalog(items);
        setResponses(() => {
          saveLocalResponses(resps);
          applyPiles(items, resps, activeCategory);
          return resps;
        });
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadCatalog();
  // activeCategory is stable at mount — intentional omission
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Confetti burst ──────────────────────────────────────────────────────────
  const burstConfetti = useCallback(() => {
    const pieces = Array.from({ length: 32 }, (_, i) => ({
      id:       i,
      x:        20 + Math.random() * 60,
      color:    CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size:     7 + Math.random() * 8,
      angle:    Math.random() * 360,
      delay:    Math.random() * 0.25,
      duration: 1.0 + Math.random() * 0.7,
      drift:    (Math.random() - 0.5) * 200,
      drop:     220 + Math.random() * 160,
    }));
    setConfetti(pieces);
    setTimeout(() => setConfetti([]), 2200);
  }, []);

  // ── React to partner-triggered matches ─────────────────────────────────────
  const handledMatchRef = useRef(null);
  useEffect(() => {
    if (!latestNewMatch) return;
    // Skip if we already handled this match (e.g. tab switch remount)
    if (handledMatchRef.current === latestNewMatch.id) return;
    handledMatchRef.current = latestNewMatch.id;
    haptic.success();
    setTimeout(burstConfetti, 650);
    const item = catalog.find((i) => i.id === latestNewMatch.id);
    if (item) {
      clearTimeout(matchTimerRef.current);
      setTimeout(() => {
        setMatchItem(item);
        matchTimerRef.current = setTimeout(() => {
          setMatchItem(null);
          dismissLatest();
        }, 4000);
      }, 200);
    }
  }, [latestNewMatch, burstConfetti]);

  // ── Derived state ───────────────────────────────────────────────────────────
  const categoryItems = useMemo(() =>
    catalog.filter((item) => item.category === activeCategory && !responses[String(item.id)]),
    [catalog, activeCategory, responses],
  );

  const progress = useMemo(() => {
    const result = {};
    for (const cat of CATEGORIES) {
      const catItems = catalog.filter((i) => i.category === cat.key);
      result[cat.key] = {
        total: catItems.length,
        done:  catItems.filter((i) => responses[String(i.id)]).length,
      };
    }
    return result;
  }, [catalog, responses]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleUndo = useCallback(() => {
    if (!lastResponse) return;
    const { item, response } = lastResponse;
    setLastResponse(null);
    if (response === 'yes') setRecentYes((prev) => prev.filter((i) => i.id !== item.id));
    if (response === 'no')  setRecentNo((prev)  => prev.filter((i) => i.id !== item.id));
    setResponses((prev) => {
      const next = { ...prev };
      delete next[String(item.id)];
      saveLocalResponses(next);
      return next;
    });
    // Sync undo to server
    client.delete(`/catalog/respond/${item.id}`).catch(() => {});
  }, [lastResponse]);

  const handleRespond = useCallback((itemId, response) => {
    const item = catalog.find((i) => i.id === itemId);
    if (item) {
      setLastResponse({ item, response });
      if (response === 'yes') setRecentYes((prev) => [item, ...prev].slice(0, MAX_PILE));
      if (response === 'no')  setRecentNo((prev)  => [item, ...prev].slice(0, MAX_PILE));
    }
    setResponses((prev) => {
      const next = { ...prev, [String(itemId)]: response };
      saveLocalResponses(next);
      return next;
    });
    client.post('/catalog/respond', { item_id: itemId, response })
      .then(async (data) => {
        if (response !== 'yes') return;
        // Check for new match — prefer inline HTTP response, fall back to refetch diff
        let matchedItem = data?.match || null;
        if (!matchedItem) {
          const updated = await client.get('/matches');
          const newMatch = updated.find(
            (m) => m.id === itemId && !knownMatchIds.current.has(m.id)
          );
          if (newMatch) matchedItem = newMatch;
        }
        refetch();
        if (matchedItem) {
          const display = catalog.find((i) => i.id === matchedItem.id) || matchedItem;
          knownMatchIds.current.add(matchedItem.id);
          haptic.success();
          setTimeout(burstConfetti, 650);
          clearTimeout(matchTimerRef.current);
          setTimeout(() => {
            setMatchItem(display);
            matchTimerRef.current = setTimeout(() => {
              setMatchItem(null);
              dismissLatest();
            }, 4000);
          }, 200);
        }
      })
      .catch(() => {
        // Roll back optimistic local state so user can retry this card
        if (item) {
          if (response === 'yes') setRecentYes((prev) => prev.filter((i) => i.id !== itemId));
          if (response === 'no')  setRecentNo((prev)  => prev.filter((i) => i.id !== itemId));
        }
        setResponses((prev) => {
          const next = { ...prev };
          delete next[String(itemId)];
          saveLocalResponses(next);
          return next;
        });
      });
  }, [catalog, refetch, burstConfetti, dismissLatest]);

  const handleMatchDismiss = useCallback(() => {
    clearTimeout(matchTimerRef.current);
    setMatchItem(null);
  }, []);

  const handleSwipePopup = useCallback((response) => {
    // CardStack fires onPopup(null) after its own short timeout — ignore it,
    // we own the dismissal window via swipeTagTimerRef.
    if (!response) return;
    clearTimeout(swipeTagTimerRef.current);
    const label = response === 'yes' ? '✓  Yes' : response === 'no' ? '✕  No' : '~  Maybe';
    setSwipeTag({ id: `${response}:${Date.now()}`, label, response });
    swipeTagTimerRef.current = setTimeout(() => setSwipeTag(null), 1200);
  }, []);

  const showPiles = categoryItems.length > 0;

  // ── Pile counts (from full response history, not just recent) ───────────────
  const pileCount = useMemo(() => ({
    yes: catalog.filter((i) => i.category === activeCategory && responses[String(i.id)] === 'yes').length,
    no:  catalog.filter((i) => i.category === activeCategory && responses[String(i.id)] === 'no').length,
  }), [catalog, activeCategory, responses]);

  return (
    <motion.div className="catalog" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>

      {confetti.length > 0 && createPortal(
        <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 99999 }}>
          {confetti.map((p) => (
            <motion.div
              key={p.id}
              style={{
                position: 'absolute', left: `${p.x}%`, top: '35%',
                width: p.size, height: p.size * 0.55,
                borderRadius: 2, backgroundColor: p.color,
              }}
              initial={{ y: 0, x: 0, opacity: 1, rotate: p.angle, scale: 1 }}
              animate={{ y: p.drop, x: p.drift, opacity: 0, rotate: p.angle + 540, scale: 0.3 }}
              transition={{ duration: p.duration, delay: p.delay, ease: 'easeOut' }}
            />
          ))}
        </div>,
        document.body,
      )}

      {createPortal(
        <AnimatePresence>
          {matchItem && (
            <MatchEffect item={matchItem} onDismiss={handleMatchDismiss} />
          )}
        </AnimatePresence>,
        document.body,
      )}

      <div className="catalog-inner">
        <div className="catalog-header">
          <h2 className="catalog-title serif">Browse...</h2>
          <p className="catalog-subtitle text-muted">200+ activities across 6 categories</p>
        </div>

        <div className="catalog-category-row">
          <CategoryPicker active={activeCategory} onChange={setActiveCategory} progress={progress} overlayTag={swipeTag} />
        </div>

        <div className="catalog-desktop-layout">
          {loading && catalog.length === 0 ? (
            <PageLoader label="Loading activities…" />
          ) : loadError && catalog.length === 0 ? (
            <div className="catalog-error">
              <p className="text-muted">Couldn't load activities</p>
              <button className="btn btn-secondary" onClick={loadCatalog}>Retry</button>
            </div>
          ) : (
            <>
              {showPiles && <CardPile items={recentNo}  side="no"  totalCount={pileCount.no} />}

              <CardStack
                locked={isLocked}
                items={categoryItems}
                onRespond={handleRespond}
                onUndo={lastResponse ? handleUndo : null}
                onPopup={handleSwipePopup}
              />

              {showPiles && <CardPile items={recentYes} side="yes" totalCount={pileCount.yes} />}
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
