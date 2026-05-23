import { createContext, useState, useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client, { clearSession, storeTokens, setOnUnauthorized } from '../api/client';

const SOLO_KEY = 'vn_solo';

export const AuthContext = createContext(null);

function toUser(raw) {
  if (!raw) return null;
  return {
    id: raw.id,
    username: raw.username,
    displayName: raw.display_name,
    avatarColor: raw.avatar_color,
    coupleId: raw.couple_id ?? null,
    partnerName: raw.partner_name ?? null,
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isSolo, setIsSolo] = useState(false);
  const [isPendingPair, setIsPendingPair] = useState(false);
  const [loading, setLoading] = useState(true);
  const [logoutReason, setLogoutReason] = useState(null);

  useEffect(() => {
    let initialLoadDone = false;

    // Force logout on any 401 from API calls. During the initial /auth/me
    // probe, suppress the "session expired" banner — stale tokens from a
    // previous install shouldn't greet a fresh app open with an error. Only
    // surface the reason when the user was actively using the app.
    setOnUnauthorized((reason) => {
      setUser(null);
      setIsSolo(false);
      if (initialLoadDone) {
        setLogoutReason(reason || 'session_expired');
      }
    });

    Promise.all([
      client.get('/auth/me').then((raw) => {
        const u = toUser(raw);
        if (u) setUser(u);
      }).catch(() => {}),
      AsyncStorage.getItem(SOLO_KEY).then((v) => { if (v) setIsSolo(true); }).catch(() => {}),
    ]).finally(() => {
      setLoading(false);
      initialLoadDone = true;
    });
  }, []);

  // Revalidate session when app comes to foreground. Only update on a
  // successful response — failures (network, 401, etc.) are handled centrally
  // by the _onUnauthorized callback registered above. Clearing the user here
  // would kick people out for transient network blips or expired access tokens
  // that the client will silently refresh on the next real request.
  const appState = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        client.get('/auth/me')
          .then((raw) => {
            const u = toUser(raw);
            if (u) setUser(u);
          })
          .catch(() => {});
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, []);

  const resetLocalFlags = useCallback(async () => {
    await AsyncStorage.removeItem(SOLO_KEY).catch(() => {});
    setIsSolo(false);
    setIsPendingPair(false);
  }, []);

  const login = useCallback(async (username, password) => {
    setLogoutReason(null);
    const raw = await client.post('/auth/token', { username, password });
    await storeTokens(raw.access_token, raw.refresh_token);
    await resetLocalFlags();
    const u = toUser(raw.user);
    setUser(u);
    return u;
  }, [resetLocalFlags]);

  const socialLogin = useCallback(async (provider, idToken, displayName) => {
    setLogoutReason(null);
    const raw = await client.post('/auth/social', {
      provider,
      id_token: idToken,
      display_name: displayName || undefined,
    });
    await storeTokens(raw.access_token, raw.refresh_token);
    await resetLocalFlags();
    const u = toUser(raw.user);
    setUser(u);
    return u;
  }, [resetLocalFlags]);

  const register = useCallback(async (username, password, displayName) => {
    // Register first, then exchange credentials for JWT tokens
    await client.post('/auth/register', { username, password, display_name: displayName });
    const raw = await client.post('/auth/token', { username, password });
    await storeTokens(raw.access_token, raw.refresh_token);
    await resetLocalFlags();
    const u = toUser(raw.user);
    setUser(u);
    await AsyncStorage.setItem('vn_show_onboarding', '1').catch(() => {});
    return u;
  }, [resetLocalFlags]);

  const enterSolo = useCallback(async () => {
    await AsyncStorage.setItem(SOLO_KEY, '1').catch(() => {});
    setIsSolo(true);
  }, []);

  const logout = useCallback(async () => {
    await client.post('/auth/logout').catch(() => {});
    await clearSession();
    await AsyncStorage.removeItem(SOLO_KEY).catch(() => {});
    setUser(null);
    setIsSolo(false);
  }, []);

  const pair = useCallback(async (code) => {
    setLoading(true);
    try {
      const raw = await client.post('/pairing/join', { code });
      await AsyncStorage.removeItem(SOLO_KEY).catch(() => {});
      setIsSolo(false);
      setUser(toUser(raw));
    } finally {
      setLoading(false);
    }
  }, []);

  const createPairingCode = useCallback(async () => {
    const data = await client.post('/pairing/create');
    return { code: data.code, emailSent: data.email_sent === true };
  }, []);

  const enterPendingPair = useCallback(() => {
    setIsPendingPair(true);
  }, []);


  const updateProfile = useCallback(async (displayName) => {
    const raw = await client.patch('/auth/profile', { display_name: displayName });
    setUser(toUser(raw));
  }, []);

  return (
    <AuthContext.Provider value={{ user, isSolo, isPendingPair, loading, logoutReason, login, socialLogin, register, logout, pair, createPairingCode, enterSolo, enterPendingPair, setUser, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}
