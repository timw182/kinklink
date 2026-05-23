import { useState, useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Animated, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const IS_TABLET = Dimensions.get('window').width >= 768;
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../context/useAuth';
import { useMatches } from '../context/MatchContext';
import { TabDirectionProvider, useTabDirection } from '../context/TabDirectionContext';
import { SCREENS } from '../lib/constants';
import FloatingParticles from '../components/FloatingParticles';
import { colors, fonts, radii } from '../theme/tokens';
import client from '../api/client';

import LandingScreen from '../screens/LandingScreen';
import PairingScreen from '../screens/PairingScreen';
import CodeRevealScreen from '../screens/CodeRevealScreen';
import ConnectedScreen from '../screens/ConnectedScreen';
import BrowseScreen from '../screens/BrowseScreen';
import MatchesScreen from '../screens/MatchesScreen';
import MoodScreen from '../screens/MoodScreen';
import SettingsScreen from '../screens/SettingsScreen';
import PrivacyScreen from '../screens/PrivacyScreen';
import ImpressumScreen from '../screens/ImpressumScreen';
import ExpertsScreen from '../screens/ExpertsScreen';
import TermsScreen from '../screens/TermsScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const TABS = [
  { name: SCREENS.BROWSE,   label: 'Explore',  icon: 'grid'   },
  { name: SCREENS.MATCHES,  label: 'Matches', icon: 'link-2' },
  { name: SCREENS.MOOD,     label: 'Mood',    icon: 'smile'  },
  { name: SCREENS.SETTINGS, label: 'Settings',icon: 'sun'    },
];

import { MOODS, EXPRESSIONS } from '../lib/constants';
const MOOD_LABELS = Object.fromEntries(MOODS.map((m) => [m.key, m]));
const EXPRESSION_LABELS = Object.fromEntries(EXPRESSIONS.map((e) => [e.key, e]));

function MoodToast({ moodData, partnerName }) {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    if (!moodData) return;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -20, duration: 300, useNativeDriver: true }),
      ]).start();
    }, 4000);
    return () => clearTimeout(t);
  }, [moodData]);

  if (!moodData || !moodData.mood) return null;
  const m = MOOD_LABELS[moodData.mood] || { emoji: '💫', label: moodData.mood };
  const text = moodData.isSelf
    ? `You're now feeling ${m.emoji} ${m.label}`
    : `${partnerName} is feeling ${m.emoji} ${m.label}`;

  return (
    <Animated.View style={[styles.toast, { top: insets.top + 8, opacity, transform: [{ translateY }] }]}>
      <Text style={styles.toastText}>{text}</Text>
    </Animated.View>
  );
}

function ExpressionToast({ expression, partnerName }) {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    if (!expression) return;
    opacity.setValue(0);
    translateY.setValue(-20);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, stiffness: 180, damping: 16, useNativeDriver: true }),
    ]).start();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -20, duration: 300, useNativeDriver: true }),
      ]).start();
    }, 4200);
    return () => clearTimeout(t);
  }, [expression?.ts]);

  if (!expression) return null;
  const e = EXPRESSION_LABELS[expression.key];
  if (!e) return null;

  return (
    <Animated.View style={[styles.expressionToast, { top: insets.top + 8, opacity, transform: [{ translateY }] }]}>
      <Text style={styles.expressionEmoji}>{e.emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.expressionFrom}>{partnerName}</Text>
        <Text style={styles.expressionLabel}>{e.label}</Text>
      </View>
    </Animated.View>
  );
}

function CustomTabBar({ state, descriptors, navigation, matchCount }) {
  const directionRef = useTabDirection();
  return (
    <View style={[styles.tabBar, IS_TABLET && styles.tabBarTablet]}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const tab = TABS.find((t) => t.name === route.name);
        const iconColor = focused ? colors.accent : colors.textLight;
        const badge = route.name === SCREENS.MATCHES ? matchCount : 0;

        return (
          <TouchableOpacity
            key={route.key}
            style={[styles.tabItem, IS_TABLET && styles.tabItemTablet, IS_TABLET && focused && styles.tabItemTabletActive]}
            onPress={() => {
              Haptics.selectionAsync();
              if (!focused) {
                if (directionRef) directionRef.current = index > state.index ? 'right' : 'left';
                navigation.navigate(route.name);
              }
            }}
            activeOpacity={0.7}
          >
            <View style={styles.iconWrap}>
              <Feather name={tab.icon} size={IS_TABLET ? 24 : 22} color={iconColor} />
              {badge > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.tabLabel, IS_TABLET && styles.tabLabelTablet, focused && styles.tabLabelActive]}>{tab.label}</Text>
            {focused && !IS_TABLET && <View style={styles.activeDot} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function ResetBanner() {
  const { resetState, setResetState } = useMatches();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  if (resetState !== 'pending_partner') return null;

  async function handleConfirm() {
    try {
      await client.post('/reset/confirm');
    } catch {}
  }

  async function handleDecline() {
    try {
      await client.post('/reset/decline');
    } catch {}
    setResetState('none');
  }

  return (
    <View style={[styles.popup, { top: insets.top + 8 }]}>
      <Text style={[styles.popupText, styles.popupTextCenter]}>
        {user?.partnerName || 'Your partner'} wants to reset all swipes & matches.
      </Text>
      <View style={styles.popupActions}>
        <TouchableOpacity style={styles.popupBtnConfirm} onPress={handleConfirm}>
          <Text style={styles.popupBtnConfirmText}>Confirm</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.popupBtnCancel} onPress={handleDecline}>
          <Text style={styles.popupBtnCancelText}>Decline</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function SwipeAlertBanner() {
  const { swipeAlert, setSwipeAlert, resetState } = useMatches();
  const insets = useSafeAreaInsets();

  if (!swipeAlert || resetState !== 'none') return null;

  return (
    <View style={[styles.popup, styles.popupRow, { top: insets.top + 8 }]}>
      <Text style={styles.popupIcon}>{swipeAlert.pattern === 'yes' ? '👀' : '🤔'}</Text>
      <Text style={styles.popupText}>
        <Text style={styles.popupBold}>{swipeAlert.partner_name}</Text>
        {' '}seems to be swiping {swipeAlert.pattern === 'yes' ? 'yes' : 'no'} on everything.
      </Text>
      <TouchableOpacity
        onPress={() => {
          if (swipeAlert.id) client.post(`/catalog/swipe-alerts/${swipeAlert.id}/dismiss`).catch(() => {});
          setSwipeAlert(null);
        }}
        hitSlop={8}
      >
        <Text style={styles.popupDismiss}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

function MainTabs() {
  const { newMatchCount, partnerMood, partnerExpression } = useMatches();
  const { user } = useAuth();

  return (
    <TabDirectionProvider>
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Tab.Navigator
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }}
        tabBar={(props) => <CustomTabBar {...props} matchCount={newMatchCount} />}
      >
        <Tab.Screen name={SCREENS.BROWSE}   component={BrowseScreen}   />
        <Tab.Screen name={SCREENS.MATCHES}  component={MatchesScreen}  />
        <Tab.Screen name={SCREENS.MOOD}     component={MoodScreen}     />
        <Tab.Screen name={SCREENS.SETTINGS} component={SettingsScreen} />
      </Tab.Navigator>
      <FloatingParticles />
      <SwipeAlertBanner />
      <ResetBanner />
      {partnerMood && (
        <MoodToast moodData={partnerMood} partnerName={user?.partnerName || 'Your partner'} />
      )}
      {partnerExpression && (
        <ExpressionToast expression={partnerExpression} partnerName={user?.partnerName || 'Your partner'} />
      )}
    </View>
    </TabDirectionProvider>
  );
}

export default function AppNavigator() {
  const { user, isSolo, isPendingPair, loading } = useAuth();

  if (loading) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        {!user ? (
          <>
            <Stack.Screen name={SCREENS.LANDING}   component={LandingScreen}   />
            <Stack.Screen name={SCREENS.PRIVACY}   component={PrivacyScreen}   />
            <Stack.Screen name={SCREENS.IMPRESSUM} component={ImpressumScreen} />
            <Stack.Screen name={SCREENS.TERMS}     component={TermsScreen}     />
          </>
        ) : !user.coupleId && !isSolo && !isPendingPair ? (
          <>
            <Stack.Screen name={SCREENS.PAIRING}      component={PairingScreen}     />
            <Stack.Screen name={SCREENS.CODE_REVEAL}  component={CodeRevealScreen}  />
            <Stack.Screen name={SCREENS.CONNECTED}    component={ConnectedScreen}   />
          </>
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name={SCREENS.PAIRING}     component={PairingScreen}    />
            <Stack.Screen name={SCREENS.CODE_REVEAL} component={CodeRevealScreen} />
            <Stack.Screen name={SCREENS.CONNECTED}   component={ConnectedScreen}  />
            <Stack.Screen name={SCREENS.PRIVACY}   component={PrivacyScreen}   />
            <Stack.Screen name={SCREENS.IMPRESSUM} component={ImpressumScreen} />
            <Stack.Screen name={SCREENS.TERMS}     component={TermsScreen}     />
            <Stack.Screen name={SCREENS.EXPERTS}   component={ExpertsScreen}   />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    height: 72,
    paddingBottom: 8,
  },
  tabBarTablet: {
    height: 80,
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 40,
    paddingBottom: 12,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingTop: 8,
  },
  tabItemTablet: {
    flex: 0,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: radii.full,
  },
  tabItemTabletActive: {
    backgroundColor: colors.accentSoft,
  },
  iconWrap: { position: 'relative' },
  tabLabel: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.textLight,
    letterSpacing: 0.3,
  },
  tabLabelTablet: {
    fontSize: 14,
    fontFamily: fonts.sansMedium,
  },
  tabLabelActive: { color: colors.accent },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -10,
    backgroundColor: colors.rose,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    color: '#fff',
    lineHeight: 14,
  },
  toast: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    backgroundColor: colors.deepViolet,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    zIndex: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  toastText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: '#fff',
  },
  expressionToast: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: 'rgba(196, 84, 122, 0.35)',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 14,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 8,
  },
  expressionEmoji: { fontSize: 32 },
  expressionFrom: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    color: colors.textLight,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  expressionLabel: {
    fontFamily: fonts.serifBold,
    fontSize: 17,
    color: colors.text,
    letterSpacing: -0.2,
  },
  // Shared popup base
  popup: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 998,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(240, 122, 106, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  popupRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  popupIcon: { fontSize: 20 },
  popupText: { flex: 1, fontFamily: fonts.sans, fontSize: 13, color: colors.text, lineHeight: 18 },
  popupTextCenter: { textAlign: 'center', fontSize: 14, lineHeight: 20 },
  popupBold: { fontFamily: fonts.sansMedium },
  popupDismiss: { fontSize: 16, color: colors.textMuted, padding: 4 },
  popupActions: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  popupBtnConfirm: {
    backgroundColor: 'rgba(240, 122, 106, 0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(240, 122, 106, 0.3)',
    borderRadius: radii.full,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  popupBtnConfirmText: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.no },
  popupBtnCancel: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.full,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  popupBtnCancelText: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.textMuted },
});
