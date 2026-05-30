import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import client from "../api/client";
import { useAuth } from "./useAuth";
import { STORAGE_KEYS } from "../lib/constants";

const MatchContext = createContext(null);

const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/api/ws`;
const RECONNECT_BASE = 2000;
const RECONNECT_MAX  = 30000;
const PING_INTERVAL  = 25000;  // send keepalive every 25s
const PONG_TIMEOUT   = 10000;  // declare the socket dead if no pong within 10s

export function MatchProvider({ children }) {
  const { user, setUser } = useAuth();
  const [matches, setMatches]           = useState([]);
  const [latestNewMatch, setLatestNewMatch] = useState(null);
  const [resetState, setResetState]       = useState("none"); // none | pending_mine | pending_partner
  const [partnerMood, setPartnerMood]       = useState(null);
  const [partnerMessage, setPartnerMessage] = useState(null);
  const [partnerExpression, setPartnerExpression] = useState(null);
  const [swipeAlert, setSwipeAlert]         = useState(null);
  const timerRef    = useRef(null);
  const wsRef       = useRef(null);
  const retryRef    = useRef(0);
  const retryTimer  = useRef(null);
  const knownIds    = useRef(new Set());
  const userRef     = useRef(user);

  // Keep userRef in sync so stable callbacks always see the latest user
  useEffect(() => { userRef.current = user; });

  // fetchMatches is stable (no user dep) — reads userRef at call time
  // Debounced: collapses multiple rapid calls, defers rather than drops
  const fetchTimer = useRef(null);
  const pendingRef = useRef(false);
  const fetchMatches = useCallback(async () => {
    if (!userRef.current?.coupleId) return;
    if (fetchTimer.current) { pendingRef.current = true; return; }
    fetchTimer.current = setTimeout(() => {
      fetchTimer.current = null;
      if (pendingRef.current) { pendingRef.current = false; fetchMatches(); }
    }, 500);
    try {
      const data = await client.get("/matches");
      setMatches(data);
      return data;
    } catch { return []; }
  }, []);

  const fetchMood = useCallback(async () => {
    try {
      const data = await client.get("/mood");
      setPartnerMood(data.partner || null);
    } catch {}
  }, []);

  // Initial fetch + reset status — re-runs when user changes (e.g. after pairing)
  useEffect(() => {
    if (!user?.coupleId) return;
    fetchMatches().then((data) => {
      (data || []).forEach((m) => knownIds.current.add(m.id));
    });
    client.get("/reset/status").then((s) => {
      if (s.status === "pending") {
        setResetState(s.requested_by_me ? "pending_mine" : "pending_partner");
      }
    }).catch(() => {});
    // Fetch any pending swipe-pattern alert
    client.get("/catalog/swipe-alerts").then((alert) => {
      if (alert && alert.id) setSwipeAlert(alert);
    }).catch(() => {});
  }, [user]);

  // showMatch is stable — no auto-dismiss timer here; Catalog owns the display lifecycle
  const showMatch = useCallback((item) => {
    setLatestNewMatch(item);
  }, []);

  // connect is stable — uses refs so it never needs to be recreated
  const connect = useCallback(() => {
    if (!userRef.current?.coupleId) return;
    const state = wsRef.current?.readyState;
    if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    // Keepalive timers, scoped to this socket so onclose can clear them
    let pingInterval = null;
    let pongTimeout  = null;
    const clearKeepalive = () => {
      clearInterval(pingInterval);
      clearTimeout(pongTimeout);
      pingInterval = pongTimeout = null;
    };

    ws.onopen = () => {
      const isReconnect = retryRef.current > 0;
      retryRef.current = 0;
      // Catch up on any matches/mood missed while disconnected (reconnects only)
      if (isReconnect) {
        Promise.all([
          fetchMatches().then((data) => {
            if (data) data.forEach((m) => knownIds.current.add(m.id));
          }),
          fetchMood(),
        ]);
      }
      // Keepalive: ping every 25s; if no pong (or any message) within 10s the
      // socket is dead even though readyState still reads OPEN — force-close to reconnect.
      pingInterval = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) return clearKeepalive();
        ws.send("ping");
        clearTimeout(pongTimeout);
        pongTimeout = setTimeout(() => ws.close(), PONG_TIMEOUT);
      }, PING_INTERVAL);
    };

    ws.onmessage = (event) => {
      // Any inbound traffic proves liveness; clear the pending pong timeout.
      clearTimeout(pongTimeout);
      if (event.data === "pong") return;
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "match" && msg.item) {
          fetchMatches().then((data) => {
            if (data) data.forEach((m) => knownIds.current.add(m.id));
          });
          // Triggerer sees the effect via HTTP response; no WS animation needed
        } else if (msg.type === "custom_message") {
          if (msg.from_user_id !== userRef.current?.id) {
            setPartnerMessage(msg.message || null);
            setTimeout(() => setPartnerMessage(null), 5000);
          }
        } else if (msg.type === "mood_update" || msg.type === "mood_cleared") {
          if (msg.from_user_id !== userRef.current?.id) {
            setPartnerMood(msg.mood || null);
          }
        } else if (msg.type === "expression") {
          // Skip echoes of our own sends; sender already got immediate UI feedback
          if (msg.from_user_id !== userRef.current?.id) {
            setPartnerExpression({
              id: msg.id,
              key: msg.key,
              sender_id: msg.from_user_id,
              sent_at: msg.sent_at,
              ts: Date.now(),  // nonce so toast/chat re-fire on repeat sends
            });
          }
        } else if (msg.type === "swipe_pattern_alert") {
          if (msg.about_user_id !== userRef.current?.id) {
            setSwipeAlert(msg);
          }
        } else if (msg.type === "reset_requested") {
          setResetState(msg.by === userRef.current?.id ? "pending_mine" : "pending_partner");
        } else if (msg.type === "reset_cancelled" || msg.type === "reset_declined") {
          setResetState("none");
        } else if (msg.type === "reset_done") {
          setResetState("none");
          try { localStorage.removeItem(STORAGE_KEYS.RESPONSES); } catch {}
          window.location.reload();
        } else if (msg.type === "partner_deleted") {
          // Partner deleted their account — clear couple state locally
          setMatches([]);
          setLatestNewMatch(null);
          setPartnerMood(null);
          setPartnerMessage(null);
          setPartnerExpression(null);
          setSwipeAlert(null);
          setResetState("none");
          knownIds.current.clear();
          try { localStorage.removeItem(STORAGE_KEYS.RESPONSES); } catch {}
          setUser((u) => (u ? { ...u, coupleId: null, partnerName: null } : u));
        }
      } catch {}
    };

    ws.onclose = () => {
      clearKeepalive();
      // If wsRef was replaced/cleared (intentional cleanup), don't reconnect
      if (wsRef.current !== ws) return;
      if (!userRef.current?.coupleId) return;
      // Exponential backoff with full jitter (50–100% of the ceiling) so reconnects
      // don't stampede the server when it comes back up.
      const ceiling = Math.min(RECONNECT_BASE * 2 ** retryRef.current, RECONNECT_MAX);
      const delay = ceiling * (0.5 + Math.random() * 0.5);
      retryRef.current++;
      retryTimer.current = setTimeout(connect, delay);
    };

    ws.onerror = () => ws.close();
  }, []); // stable — no deps, reads everything via refs

  // Only fires when paired status changes (unpaired→paired or paired→unpaired/logout)
  const paired = !!user?.coupleId;
  useEffect(() => {
    if (!paired) return;
    connect();
    return () => {
      clearTimeout(retryTimer.current);
      // Disown before closing so stale onclose handlers skip reconnect
      const ws = wsRef.current;
      wsRef.current = null;
      ws?.close();
    };
  }, [paired]);

  const dismissLatest = useCallback(() => {
    clearTimeout(timerRef.current);
    setLatestNewMatch(null);
  }, []);

  // Expose refetch so Catalog can refresh immediately after own swipe
  const refetch = useCallback(() => {
    fetchMatches().then((data) => {
      if (data) data.forEach((m) => knownIds.current.add(m.id));
    });
  }, [fetchMatches]);

  const newMatchCount = matches.filter((m) => !m.seen).length;

  return (
    <MatchContext.Provider value={{ matches, setMatches, latestNewMatch, newMatchCount, dismissLatest, refetch, resetState, setResetState, partnerMood, setPartnerMood, partnerMessage, partnerExpression, setPartnerExpression, swipeAlert, setSwipeAlert }}>
      {children}
    </MatchContext.Provider>
  );
}

export function useMatches() {
  return useContext(MatchContext);
}
