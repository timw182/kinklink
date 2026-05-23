import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import client from "../api/client";
import { useAuth } from "./useAuth";

const MatchContext = createContext(null);

const WS_URL = Constants.expoConfig?.extra?.wsBase || "wss://api.venn.lu/api/ws";
const RECONNECT_BASE = 2000;
const RECONNECT_MAX  = 30000;

export function MatchProvider({ children }) {
  const { user, setUser } = useAuth();
  const [matches, setMatches]           = useState([]);
  const [latestNewMatch, setLatestNewMatch] = useState(null);
  const [resetState, setResetState]     = useState("none");
  const [partnerMood, setPartnerMood]   = useState(null);
  const [partnerExpression, setPartnerExpression] = useState(null);
  const [swipeAlert, setSwipeAlert]     = useState(null);
  const timerRef   = useRef(null);
  const wsRef      = useRef(null);
  const retryRef   = useRef(0);
  const retryTimer = useRef(null);
  const knownIds   = useRef(new Set());
  const userRef    = useRef(user);

  // Keep userRef in sync so stable callbacks see latest user
  useEffect(() => { userRef.current = user; });

  // Debounced fetchMatches — collapses rapid calls, defers rather than drops
  const fetchTimer = useRef(null);
  const pendingRef = useRef(false);
  const fetchMatches = useCallback(async () => {
    if (!userRef.current?.coupleId) return [];
    if (fetchTimer.current) { pendingRef.current = true; return []; }
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
      const data = await client.get('/mood');
      setPartnerMood(data.partner || null);
    } catch {}
  }, []);

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

  // showMatch — no auto-dismiss timer; screen owns display lifecycle
  const showMatch = useCallback((item) => {
    setLatestNewMatch(item);
  }, []);

  const connect = useCallback(async () => {
    if (!userRef.current?.coupleId) return;
    const state = wsRef.current?.readyState;
    if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) return;

    let ticket;
    try {
      const data = await client.get('/ws/ticket');
      if (typeof data.ticket === 'string' && data.ticket.length > 0) {
        ticket = data.ticket;
      }
    } catch {}
    if (!ticket) {
      // Ticket fetch failed; schedule retry via reconnect logic
      const delay = Math.min(RECONNECT_BASE * 2 ** retryRef.current, RECONNECT_MAX);
      retryRef.current++;
      retryTimer.current = setTimeout(connect, delay);
      return;
    }
    // Connect without ticket in URL to avoid proxy/CDN query-param logging
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = async () => {
      // Send ticket as first message instead of query param
      ws.send(`ticket:${ticket}`);
      const isReconnect = retryRef.current > 0;
      retryRef.current = 0;
      // Catch up on missed matches/mood (reconnects only)
      if (isReconnect) {
        await Promise.all([
          fetchMatches().then((data) => {
            if (data) data.forEach((m) => knownIds.current.add(m.id));
          }).catch(() => {}),
          fetchMood().catch(() => {}),
        ]);
      }
      // Keepalive ping every 25s with pong timeout
      ws._pongTimer = null;
      const ping = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send("ping");
          ws._pongTimer = setTimeout(() => {
            ws.close();
          }, 10000);
        } else {
          clearInterval(ping);
        }
      }, 25000);
    };

    const KNOWN_WS_TYPES = new Set([
      'match', 'mood_update', 'mood_cleared', 'expression', 'swipe_pattern_alert',
      'reset_requested', 'reset_cancelled', 'reset_declined', 'reset_done',
      'partner_deleted',
    ]);

    ws.onmessage = (event) => {
      // Any message means server is alive — clear pong timeout
      if (ws._pongTimer) { clearTimeout(ws._pongTimer); ws._pongTimer = null; }
      try {
        const msg = JSON.parse(event.data);
        if (typeof msg !== 'object' || msg === null || typeof msg.type !== 'string') return;
        if (!KNOWN_WS_TYPES.has(msg.type)) return;
        if (msg.type === "match" && msg.item) {
          fetchMatches().then((data) => {
            if (data) data.forEach((m) => knownIds.current.add(m.id));
          });
          // Triggerer sees the effect via HTTP response; no WS animation needed
        } else if (msg.type === "mood_update" || msg.type === "mood_cleared") {
          const isSelf = msg.from_user_id === userRef.current?.id;
          setPartnerMood({ mood: msg.mood || null, isSelf });
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
          setMatches([]);
          setLatestNewMatch(null);
          knownIds.current.clear();
          AsyncStorage.multiRemove(["vn_responses"]).catch(() => {});
        } else if (msg.type === "partner_deleted") {
          // Partner deleted their account — clear all couple state and un-pair locally
          setMatches([]);
          setLatestNewMatch(null);
          setPartnerMood(null);
          setPartnerExpression(null);
          setSwipeAlert(null);
          setResetState("none");
          knownIds.current.clear();
          AsyncStorage.multiRemove(["vn_responses"]).catch(() => {});
          setUser((u) => (u ? { ...u, coupleId: null, partnerName: null } : u));
        }
      } catch {}
    };

    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      if (!userRef.current?.coupleId) return;
      const delay = Math.min(RECONNECT_BASE * 2 ** retryRef.current, RECONNECT_MAX);
      retryRef.current++;
      retryTimer.current = setTimeout(connect, delay);
    };

    ws.onerror = () => ws.close();
  }, []);

  const paired = !!user?.coupleId;
  useEffect(() => {
    if (!paired) return;
    connect();
    return () => {
      clearTimeout(retryTimer.current);
      const ws = wsRef.current;
      wsRef.current = null;
      ws?.close();
    };
  }, [paired]);

  const dismissLatest = useCallback(() => {
    clearTimeout(timerRef.current);
    setLatestNewMatch(null);
  }, []);

  const refetch = useCallback(() => {
    fetchMatches().then((data) => {
      if (data) data.forEach((m) => knownIds.current.add(m.id));
    });
  }, [fetchMatches]);

  const newMatchCount = matches.filter((m) => !m.seen).length;

  return (
    <MatchContext.Provider value={{ matches, setMatches, latestNewMatch, newMatchCount, dismissLatest, refetch, resetState, setResetState, partnerMood, setPartnerMood, partnerExpression, setPartnerExpression, swipeAlert, setSwipeAlert }}>
      {children}
    </MatchContext.Provider>
  );
}

export function useMatches() {
  return useContext(MatchContext);
}
