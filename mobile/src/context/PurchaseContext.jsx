import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import { useIAP, isUserCancelledError } from 'expo-iap';
import client from '../api/client';

const PRODUCT_ID = 'lu.venn.pairingcode_v2';

const PurchaseContext = createContext(null);

export function PurchaseProvider({ children }) {
  const [credits, setCredits] = useState(0);
  const [iapAccountToken, setIapAccountToken] = useState(null);
  const mountedRef = useRef(true);
  // In-flight purchase: { resolve, reject } resolved when StoreKit fires onPurchaseSuccess/Error.
  const pendingRef = useRef(null);

  const fetchCredits = useCallback(async () => {
    try {
      const res = await client.get('/pairing/status');
      const n = Number(res?.pairing_credits) || 0;
      if (mountedRef.current) {
        setCredits(n);
        if (res?.iap_account_token) setIapAccountToken(res.iap_account_token);
      }
      return n;
    } catch (e) {
      if (__DEV__) console.warn('Fetch credits error:', e);
      return null;
    }
  }, []);

  const verifyWithBackend = async (purchase) => {
    try {
      const res = await client.post('/pairing/verify-purchase', {
        platform: Platform.OS,
        purchase_token: purchase.purchaseToken || '',
        transaction_id: String(purchase.id || ''),
        product_id: purchase.productId || PRODUCT_ID,
      });
      const n = Number(res?.credits) || 0;
      if (mountedRef.current) setCredits(n);
      return n;
    } catch {
      const err = new Error(
        "Payment received but we couldn't confirm it on our side. Please contact support and we'll fix it."
      );
      err.verificationFailed = true;
      throw err;
    }
  };

  const { connected, requestPurchase, finishTransaction, fetchProducts } = useIAP({
    onPurchaseSuccess: async (purchase) => {
      try {
        if (purchase?.productId !== PRODUCT_ID) {
          // Foreign product (shouldn't happen) — close the transaction so it isn't replayed.
          await finishTransaction({ purchase, isConsumable: false }).catch(() => {});
          return;
        }
        await verifyWithBackend(purchase);
        await finishTransaction({ purchase, isConsumable: true });
        if (pendingRef.current) {
          pendingRef.current.resolve(purchase);
          pendingRef.current = null;
        }
      } catch (err) {
        if (pendingRef.current) {
          pendingRef.current.reject(err);
          pendingRef.current = null;
        }
      }
    },
    onPurchaseError: (error) => {
      if (!pendingRef.current) return;
      if (isUserCancelledError(error)) {
        pendingRef.current.resolve(null);
      } else {
        pendingRef.current.reject(new Error(error?.message || 'Purchase failed'));
      }
      pendingRef.current = null;
    },
  });

  useEffect(() => {
    mountedRef.current = true;
    fetchCredits();
    return () => { mountedRef.current = false; };
  }, [fetchCredits]);

  // Pre-fetch the product so the StoreKit sheet opens without a delay.
  useEffect(() => {
    if (!connected) return;
    fetchProducts({ skus: [PRODUCT_ID], type: 'in-app' }).catch(() => {});
  }, [connected, fetchProducts]);

  const purchasePairingCode = useCallback(async () => {
    if (!connected) {
      throw new Error('Store not ready. Please try again in a moment.');
    }
    // Make sure we have the per-user token before purchase — the backend uses
    // it to bind the StoreKit transaction to this account, blocking JWS replay.
    let token = iapAccountToken;
    if (!token) {
      await fetchCredits();
      token = iapAccountToken;
    }
    if (!token) {
      throw new Error('Could not prepare purchase. Please try again.');
    }
    if (pendingRef.current) {
      throw new Error('A purchase is already in progress.');
    }
    return new Promise((resolve, reject) => {
      pendingRef.current = { resolve, reject };
      requestPurchase({
        request: {
          apple: { sku: PRODUCT_ID, appAccountToken: token },
          google: { skus: [PRODUCT_ID] },
        },
        type: 'in-app',
      }).catch((err) => {
        if (pendingRef.current) {
          if (isUserCancelledError(err)) {
            pendingRef.current.resolve(null);
          } else {
            pendingRef.current.reject(err);
          }
          pendingRef.current = null;
        }
      });
    });
  }, [connected, requestPurchase, iapAccountToken, fetchCredits]);

  const refreshCredits = useCallback(async () => {
    return await fetchCredits();
  }, [fetchCredits]);

  return (
    <PurchaseContext.Provider
      value={{ isReady: connected, credits, purchasePairingCode, refreshCredits }}
    >
      {children}
    </PurchaseContext.Provider>
  );
}

export function usePurchase() {
  const ctx = useContext(PurchaseContext);
  if (!ctx) throw new Error('usePurchase must be used within PurchaseProvider');
  return ctx;
}
