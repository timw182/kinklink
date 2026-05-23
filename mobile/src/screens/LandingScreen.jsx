import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, ScrollView, StyleSheet,
  KeyboardAvoidingView, Platform, TouchableOpacity,
  Animated, Dimensions, Image, Linking,
} from 'react-native';
import Svg, { Rect, Circle, Path } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';

const { width: SW, height: SH } = Dimensions.get('window');
const IS_TABLET = SW >= 768;

const HEART_COLORS = ['#F07A6A', '#9B80D4', '#C4547A', '#9B80D4', '#F07A6A', '#C4547A', '#9B80D4', '#F07A6A'];

const HEARTS = [
  { id: 0, x: SW * 0.02, size: 12, duration: 11000, start: 0.1,  opacity: 0.18 },
  { id: 1, x: SW * 0.14, size: 20, duration: 14000, start: 0.55, opacity: 0.14 },
  { id: 2, x: SW * 0.28, size: 10, duration: 9500,  start: 0.35, opacity: 0.20 },
  { id: 3, x: SW * 0.42, size: 16, duration: 13000, start: 0.75, opacity: 0.16 },
  { id: 4, x: SW * 0.56, size: 22, duration: 10500, start: 0.20, opacity: 0.12 },
  { id: 5, x: SW * 0.68, size: 14, duration: 12000, start: 0.60, opacity: 0.18 },
  { id: 6, x: SW * 0.80, size: 18, duration: 15000, start: 0.40, opacity: 0.15 },
  { id: 7, x: SW * 0.92, size: 11, duration: 10000, start: 0.85, opacity: 0.20 },
];

function FloatingHeart({ x, size, duration, start, opacity: maxOpacity, color }) {
  const prog = useRef(new Animated.Value(start)).current;

  useEffect(() => {
    const first = Animated.timing(prog, {
      toValue: 1,
      duration: duration * (1 - start),
      useNativeDriver: true,
    });
    const loop = Animated.loop(
      Animated.timing(prog, { toValue: 1, duration, useNativeDriver: true })
    );
    first.start(() => { prog.setValue(0); loop.start(); });
    return () => { first.stop(); loop.stop(); };
  }, []);

  return (
    <Animated.Text
      style={{
        position: 'absolute',
        left: x,
        bottom: -20,
        fontSize: size,
        color: color || colors.accent,
        opacity: prog.interpolate({ inputRange: [0, 0.06, 0.88, 1], outputRange: [0, maxOpacity, maxOpacity, 0] }),
        transform: [{ translateY: prog.interpolate({ inputRange: [0, 1], outputRange: [0, -(SH + 60)] }) }],
      }}
    >
      ♥
    </Animated.Text>
  );
}

function FloatingHearts() {
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: SW, height: SH }} pointerEvents="none">
      {HEARTS.map((h, i) => <FloatingHeart key={h.id} {...h} color={HEART_COLORS[i]} />)}
    </View>
  );
}
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  interpolate,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as AppleAuthentication from 'expo-apple-authentication';
import Constants from 'expo-constants';

import { TurboModuleRegistry } from 'react-native';

// Guard: only require if native module is actually linked in this build.
// Google Sign-In is a TurboModule (RNGoogleSignin).
const _hasGoogle = (() => { try { return !!TurboModuleRegistry.get('RNGoogleSignin'); } catch { return false; } })();

function getGoogleSignin() {
  if (!_hasGoogle) return null;
  return require('@react-native-google-signin/google-signin').GoogleSignin;
}
import { useAuth } from '../context/useAuth';
import client from '../api/client';
import * as Haptics from 'expo-haptics';
import { colors, fonts, space, radii } from '../theme/tokens';
import Button from '../components/Button';
import { SCREENS } from '../lib/constants';
import LogoMark from '../components/LogoMark';
import VennAnimatedLogo from '../components/VennAnimatedLogo';
import { LockKeyIcon, MoonStarsIcon, UsersIcon } from '../components/FeatureIcons';

const FEATURE_ICONS = [LockKeyIcon, MoonStarsIcon, UsersIcon];

const features = [
  { title: 'No rejection', body: "Neither of you ever sees what the other said no to. Only matches surface." },
  { title: 'Blind matching', body: "Both swipe independently. A match only appears when you both say yes." },
  { title: 'Just you two', body: "Fully private. No ads, no strangers, no data harvesting." },
];

function GlitterIcon({ Icon }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    const glitter = () => {
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1.18, duration: 180, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1,    duration: 180, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1,    duration: 250, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.85, duration: 250, useNativeDriver: true }),
        ]),
      ]).start();
    };
    const initial = setTimeout(glitter, Math.random() * 3000);
    const interval = setInterval(glitter, 3500 + Math.random() * 1500);
    return () => { clearTimeout(initial); clearInterval(interval); };
  }, []);

  return (
    <Animated.View style={{ transform: [{ scale }], opacity }}>
      <Icon size={36} />
    </Animated.View>
  );
}

export default function LandingScreen({ navigation }) {
  const [mode, setMode] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login, socialLogin, register, logoutReason } = useAuth();
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'ios') {
      AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});
    }
    const gs = getGoogleSignin();
    if (gs) {
      const extra = Constants.expoConfig?.extra || {};
      gs.configure({
        webClientId: extra.googleWebClientId,
        iosClientId: extra.googleIosClientId,
      });
    }
  }, []);

  // Auto-dismiss success toast
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(''), 4000);
    return () => clearTimeout(t);
  }, [success]);

  // Forgot password state
  const [resetStep, setResetStep] = useState(0); // 0=email, 1=code+new pw
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // ── Swipe-back gesture for form view ────────────────────────────────────────
  const formX = useSharedValue(SW * 0.35);
  const formOpacity = useSharedValue(0);

  useEffect(() => {
    if (mode !== null) {
      formX.value = SW * 0.35;
      formOpacity.value = 0;
      formX.value = withTiming(0, { duration: 280 });
      formOpacity.value = withTiming(1, { duration: 220 });
    }
  }, [mode]);

  function goBack() {
    formX.value = withTiming(SW * 0.6, { duration: 220 });
    formOpacity.value = withTiming(0, { duration: 180 }, () => {
      runOnJS(setMode)(null);
    });
  }

  const panGesture = Gesture.Pan()
    .activeOffsetX(20)
    .failOffsetY([-15, 15])
    .onUpdate((e) => {
      if (e.translationX > 0) {
        formX.value = e.translationX;
        formOpacity.value = interpolate(e.translationX, [0, SW * 0.4], [1, 0.2]);
      }
    })
    .onEnd((e) => {
      if (e.translationX > 60 || e.velocityX > 400) {
        formX.value = withTiming(SW, { duration: 200 });
        formOpacity.value = withTiming(0, { duration: 150 }, () => {
          runOnJS(setMode)(null);
        });
      } else {
        formX.value = withSpring(0);
        formOpacity.value = withSpring(1);
      }
    });

  const formAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: formX.value }],
    opacity: formOpacity.value,
  }));

  async function handleSubmit() {
    setError('');
    if (mode === 'register' && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(username, password);
      } else {
        await register(username, password, displayName);
      }
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgotSubmit() {
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      if (resetStep === 0) {
        await client.post('/auth/forgot-password', { email: resetEmail });
        setResetStep(1);
        setSuccess('Code sent to your email');
      } else {
        if (newPassword !== confirmNewPassword) {
          setError('Passwords do not match');
          setSubmitting(false);
          return;
        }
        await client.post('/auth/reset-password', {
          email: resetEmail,
          code: resetCode,
          new_password: newPassword,
        });
        setSuccess('Password reset! You can now sign in.');
        setTimeout(() => openForm('login'), 1500);
      }
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAppleSignIn() {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        ],
      });
      const displayName = [credential.fullName?.givenName, credential.fullName?.familyName]
        .filter(Boolean).join(' ') || '';
      await socialLogin('apple', credential.identityToken, displayName);
    } catch (e) {
      if (e.code !== 'ERR_REQUEST_CANCELED') {
        setError(e.message || 'Apple sign-in failed');
      }
    }
  }

  async function handleGoogleSignIn() {
    const gs = getGoogleSignin();
    if (!gs) { setError('Google sign-in requires a new app build'); return; }
    try {
      await gs.hasPlayServices();
      const response = await gs.signIn();
      const idToken = response.data?.idToken;
      if (!idToken) throw new Error('No ID token from Google');
      const name = response.data?.user?.name || '';
      await socialLogin('google', idToken, name);
    } catch (e) {
      if (e.code !== 'SIGN_IN_CANCELLED') {
        setError(e.message || 'Google sign-in failed');
      }
    }
  }

  function openForm(m) {
    setMode(m);
    setError('');
    setSuccess('');
    setUsername('');
    setPassword('');
    setConfirmPassword('');
    setDisplayName('');
    setResetStep(0);
    setResetEmail('');
    setResetCode('');
    setNewPassword('');
    setConfirmNewPassword('');
  }

  if (mode === 'forgot') {
    return (
      <SafeAreaView style={styles.container}>
        {!!success && (
          <TouchableOpacity
            style={styles.successToast}
            activeOpacity={0.8}
            onPress={() => setSuccess('')}
          >
            <Feather name="check-circle" size={18} color="#2E7D32" />
            <Text style={styles.successToastText}>{success}</Text>
          </TouchableOpacity>
        )}
        <GestureDetector gesture={panGesture}>
          <Reanimated.View style={[{ flex: 1 }, formAnimStyle]}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
              <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
                <View style={IS_TABLET ? styles.tabletInner : null}>
                  <TouchableOpacity onPress={() => openForm('login')} style={styles.backBtn}>
                    <Text style={styles.backText}>← back to login</Text>
                  </TouchableOpacity>

                  <View style={styles.formBrand}>
                    <LogoMark size="md" />
                    <Text style={styles.formHeading}>Reset password</Text>
                    <Text style={styles.subtitle}>
                      {resetStep === 0
                        ? "Enter your email and we'll send you a code"
                        : 'Enter the code and your new password'}
                    </Text>
                  </View>

                  <View style={styles.form}>
                    {resetStep === 0 ? (
                      <View style={[styles.field, { marginTop: space[4] }]}>
                        <Text style={styles.label}>Email</Text>
                        <TextInput
                          style={[styles.input, !resetEmail && styles.inputEmpty]}
                          value={resetEmail}
                          onChangeText={setResetEmail}
                          placeholder="your@email.com..."
                          placeholderTextColor={colors.textLight}
                          autoCapitalize="none"
                          autoCorrect={false}
                          keyboardType="email-address"
                          textContentType="emailAddress"
                          autoFocus
                        />
                      </View>
                    ) : (
                      <>
                        <View style={[styles.field, { marginTop: space[4] }]}>
                          <Text style={styles.label}>Reset Code</Text>
                          <TextInput
                            style={[styles.input, !resetCode && styles.inputEmpty]}
                            value={resetCode}
                            onChangeText={setResetCode}
                            placeholder="Paste code from email..."
                            placeholderTextColor={colors.textLight}
                            autoCapitalize="none"
                            autoCorrect={false}
                            autoFocus
                          />
                        </View>
                        <View style={styles.field}>
                          <Text style={styles.label}>New Password</Text>
                          <View style={styles.inputRow}>
                            <TextInput
                              style={[styles.inputFlex, !newPassword && styles.inputEmpty]}
                              value={newPassword}
                              onChangeText={setNewPassword}
                              placeholder="At least 8 characters..."
                              placeholderTextColor={colors.textLight}
                              secureTextEntry={!showPw}
                              textContentType="newPassword"
                            />
                            <TouchableOpacity onPress={() => setShowPw(!showPw)} style={styles.eyeBtn} hitSlop={8}>
                              <Feather name={showPw ? 'eye' : 'eye-off'} size={18} color={colors.textLight} />
                            </TouchableOpacity>
                          </View>
                        </View>
                        <View style={styles.field}>
                          <Text style={styles.label}>Confirm Password</Text>
                          <View style={styles.inputRow}>
                            <TextInput
                              style={[styles.inputFlex, !confirmNewPassword && styles.inputEmpty]}
                              value={confirmNewPassword}
                              onChangeText={setConfirmNewPassword}
                              placeholder="Type it again..."
                              placeholderTextColor={colors.textLight}
                              secureTextEntry={!showPw}
                              textContentType="newPassword"
                            />
                            <TouchableOpacity onPress={() => setShowPw(!showPw)} style={styles.eyeBtn} hitSlop={8}>
                              <Feather name={showPw ? 'eye' : 'eye-off'} size={18} color={colors.textLight} />
                            </TouchableOpacity>
                          </View>
                        </View>
                      </>
                    )}

                    {!!error && (
                      <View style={styles.errorBox}>
                        <Text style={styles.errorText}>{error}</Text>
                      </View>
                    )}
                    <Button
                      variant="primary"
                      size="lg"
                      fullWidth
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleForgotSubmit(); }}
                      loading={submitting}
                      disabled={resetStep === 0 ? !resetEmail : (!resetCode || !newPassword)}
                    >
                      {resetStep === 0 ? 'Send reset code' : 'Set new password'}
                    </Button>
                  </View>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </Reanimated.View>
        </GestureDetector>
      </SafeAreaView>
    );
  }

  if (mode === null) {
    return (
      <SafeAreaView style={styles.container}>
        <FloatingHearts />
        <ScrollView contentContainerStyle={styles.heroScroll} keyboardShouldPersistTaps="handled">
        <View style={IS_TABLET ? styles.tabletInner : null}>
          <View style={styles.brand}>
            <VennAnimatedLogo width={IS_TABLET ? Math.min(SW * 0.55, 420) : SW} height={140} />
            <Text style={styles.tagline}>Find your overlap.</Text>
          </View>

          {logoutReason === 'another_device' && (
            <View style={styles.kickedBanner}>
              <Text style={styles.kickedText}>
                You were logged out because your account was signed in on another device.
              </Text>
            </View>
          )}
          {logoutReason === 'session_expired' && (
            <View style={styles.kickedBanner}>
              <Text style={styles.kickedText}>
                Your session expired. Please sign in again.
              </Text>
            </View>
          )}

          <View style={styles.featuresAndCta}>
            <View style={styles.features}>
              {features.map((f) => (
                <View key={f.title} style={styles.featureCard}>
                  <GlitterIcon Icon={FEATURE_ICONS[features.indexOf(f)]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.featureTitle}>{f.title}</Text>
                    <Text style={styles.featureBody}>{f.body}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.cta}>
              <Button variant="primary" size="lg" fullWidth onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); openForm('register'); }}>
                Get started
              </Button>
              <TouchableOpacity onPress={() => openForm('login')} style={styles.toggleBtn}>
                <Text style={styles.toggleText}>Already have an account? <Text style={styles.toggleLink}>Sign in</Text></Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.footer}>
            <View style={styles.footerLinks}>
              <Text style={styles.footerCopy}>© 2026 Kern Studio</Text>
              <Text style={styles.footerDot}>·</Text>
              <TouchableOpacity onPress={() => navigation.navigate(SCREENS.IMPRESSUM)}>
                <Text style={styles.footerLinkText}>Impressum</Text>
              </TouchableOpacity>
              <Text style={styles.footerDot}>·</Text>
              <TouchableOpacity onPress={() => navigation.navigate(SCREENS.PRIVACY)}>
                <Text style={styles.footerLinkText}>Privacy</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.footerSocial}>
              <TouchableOpacity onPress={() => Linking.openURL('https://www.instagram.com/kernstudio.dev/')} style={styles.footerIcon}>
                <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.textLight} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <Rect x={2} y={2} width={20} height={20} rx={5} />
                  <Circle cx={12} cy={12} r={5} />
                  <Circle cx={17.5} cy={6.5} r={1.2} fill={colors.textLight} stroke="none" />
                </Svg>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => Linking.openURL('https://www.facebook.com/profile.php?id=61590415018284')} style={styles.footerIcon}>
                <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.textLight} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
                </Svg>
              </TouchableOpacity>
            </View>
          </View>

        </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <GestureDetector gesture={panGesture}>
        <Reanimated.View style={[{ flex: 1 }, formAnimStyle]}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
              <View style={IS_TABLET ? styles.tabletInner : null}>
              <TouchableOpacity onPress={goBack} style={styles.backBtn}>
                <Text style={styles.backText}>← back</Text>
              </TouchableOpacity>

          <View style={styles.formBrand}>
            <LogoMark size="md" />
            <Text style={styles.formHeading}>
              {mode === 'login' ? 'Log in to Venn' : 'Create your account'}
            </Text>
            <Text style={styles.subtitle}>
              {mode === 'login' ? 'Welcome back' : 'Get started in seconds'}
            </Text>
          </View>

          <View style={styles.form}>
            {mode === 'register' && (
              <View style={styles.field}>
                <Text style={styles.label}>Your Name</Text>
                <TextInput
                  style={[styles.input, !displayName && styles.inputEmpty]}
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="What should they call you?..."
                  placeholderTextColor={colors.textLight}
                  autoCapitalize="words"
                  textContentType="name"
                />
              </View>
            )}

            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={[styles.input, !username && styles.inputEmpty]}
                value={username}
                onChangeText={setUsername}
                placeholder="your@email.com..."
                placeholderTextColor={colors.textLight}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.inputFlex, !password && styles.inputEmpty]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Keep it secret..."
                  placeholderTextColor={colors.textLight}
                  secureTextEntry={!showPw}
                  textContentType={mode === 'login' ? 'password' : 'newPassword'}
                  autoComplete={mode === 'login' ? 'password' : 'password-new'}
                />
                <TouchableOpacity onPress={() => setShowPw(!showPw)} style={styles.eyeBtn} hitSlop={8}>
                  <Feather name={showPw ? 'eye' : 'eye-off'} size={18} color={colors.textLight} />
                </TouchableOpacity>
              </View>
            </View>

            {mode === 'register' && (
              <View style={styles.field}>
                <Text style={styles.label}>Confirm Password</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={[styles.inputFlex, !confirmPassword && styles.inputEmpty]}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Type it again..."
                    placeholderTextColor={colors.textLight}
                    secureTextEntry={!showPw}
                    textContentType="newPassword"
                    autoComplete="password-new"
                  />
                  <TouchableOpacity onPress={() => setShowPw(!showPw)} style={styles.eyeBtn} hitSlop={8}>
                    <Feather name={showPw ? 'eye' : 'eye-off'} size={18} color={colors.textLight} />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {!!error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Button variant="primary" size="lg" fullWidth onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleSubmit(); }} loading={submitting}>
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </Button>

            <View style={styles.orRow}>
              <View style={styles.orLine} />
              <Text style={styles.orText}>or continue with</Text>
              <View style={styles.orLine} />
            </View>
            <View style={styles.socialRow}>
              {appleAvailable && (
                <TouchableOpacity style={styles.socialBtn} onPress={handleAppleSignIn}>
                  <Svg width={20} height={20} viewBox="0 0 24 24" fill={colors.text}>
                    <Path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                  </Svg>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.socialBtn} onPress={handleGoogleSignIn}>
                <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                  <Path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <Path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <Path d="M5.84 14.09a6.97 6.97 0 0 1 0-4.17V7.08H2.18a11.01 11.01 0 0 0 0 9.84l3.66-2.84z" fill="#FBBC05" />
                  <Path d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.09 14.97 0 12 0 7.7 0 3.99 2.47 2.18 6.08l3.66 2.84c.87-2.6 3.3-4.17 6.16-4.17z" fill="#EA4335" />
                </Svg>
              </TouchableOpacity>
            </View>
          </View>

          {mode === 'login' && (
            <TouchableOpacity onPress={() => openForm('forgot')} style={styles.forgotBtn}>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={() => openForm(mode === 'login' ? 'register' : 'login')}
            style={styles.toggleBtn}
          >
            <Text style={styles.toggleText}>
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <Text style={styles.toggleLink}>{mode === 'login' ? 'Create one' : 'Sign in'}</Text>
            </Text>
          </TouchableOpacity>

          <Text style={styles.termsText}>
            By signing in, you agree to our{' '}
            <Text style={styles.termsLink} onPress={() => navigation.navigate(SCREENS.TERMS)}>Terms</Text>
            {' '}and{' '}
            <Text style={styles.termsLink} onPress={() => navigation.navigate(SCREENS.PRIVACY)}>Privacy Policy</Text>.
          </Text>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </Reanimated.View>
      </GestureDetector>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  kickedBanner: {
    marginHorizontal: space[4],
    marginBottom: space[3],
    padding: space[3],
    backgroundColor: 'rgba(240, 122, 106, 0.1)',
    borderWidth: 1.5,
    borderColor: 'rgba(240, 122, 106, 0.3)',
    borderRadius: 12,
  },
  kickedText: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
    textAlign: 'center',
  },

  heroScroll: {
    flexGrow: 1,
    paddingHorizontal: IS_TABLET ? space[8] : space[6],
    paddingTop: space[4],
    paddingBottom: space[6],
    gap: space[8],
    alignItems: IS_TABLET ? 'center' : undefined,
  },
  tabletInner: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },

  brand: { alignItems: 'center', gap: space[2], marginHorizontal: -space[6], marginBottom: space[4] },
  tagline: { fontFamily: fonts.sansLight, fontSize: 18, color: colors.textMuted, letterSpacing: 0.3 },
  taglineEm: { fontFamily: fonts.serif, color: colors.accent },

  featuresAndCta: { gap: space[3] },
  features: { gap: space[3] },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[4],
    padding: space[4],
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  featureIcon: { fontSize: 22, lineHeight: 28 },
  featureTitle: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.text, marginBottom: 3, letterSpacing: 0.2 },
  featureBody: { fontFamily: fonts.sansLight, fontSize: 13, color: colors.textMuted, lineHeight: 19 },

  orRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  orLine: { flex: 1, height: 1, backgroundColor: colors.border },
  orText: { fontFamily: fonts.sansLight, fontSize: 11, color: colors.textLight, letterSpacing: 0.5 },
  socialRow: { flexDirection: 'row', justifyContent: 'center', gap: space[4] },
  socialBtn: {
    width: 52,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cta: { gap: space[4], alignItems: 'center' },
  toggleBtn: { paddingHorizontal: space[2], paddingVertical: space[4] },
  toggleText: { fontFamily: fonts.sans, fontSize: 14, color: colors.textMuted, letterSpacing: 0.2, textAlign: 'center' },
  toggleLink: { color: colors.accent },

  footer: {
    alignItems: 'center',
    gap: space[3],
    marginTop: space[8],
    paddingTop: space[4],
  },
  footerLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  footerCopy: { fontFamily: fonts.sans, fontSize: 11, color: colors.textLight, letterSpacing: 0.3 },
  footerDot: { fontSize: 11, color: colors.textLight, opacity: 0.4 },
  footerLinkText: { fontFamily: fonts.sans, fontSize: 11, color: colors.textLight, letterSpacing: 0.3 },
  footerSocial: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[5],
  },
  footerIcon: {
    padding: space[1],
  },

  formScroll: {
    flexGrow: 1,
    paddingHorizontal: space[6],
    paddingTop: space[6],
    paddingBottom: space[6],
    gap: space[7],
  },

  backBtn: { alignSelf: 'flex-start', paddingVertical: space[1] },
  backText: { fontFamily: fonts.sans, fontSize: 14, color: colors.textMuted, letterSpacing: 0.3 },

  formBrand: { alignItems: 'center', gap: space[2] },
  formHeading: {
    fontFamily: fonts.serif,
    fontSize: 26,
    color: colors.text,
    letterSpacing: -0.3,
    textAlign: 'center',
    marginTop: space[2],
  },
  subtitle: { fontFamily: fonts.sans, fontSize: 14, color: colors.textMuted, letterSpacing: 0.3 },

  form: { gap: space[5] },
  field: { gap: space[2] },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
  },
  inputFlex: {
    flex: 1,
    paddingVertical: 13,
    paddingHorizontal: space[4],
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.text,
  },
  inputEmpty: {
    fontFamily: fonts.sansLight,
    fontSize: 14,
    fontStyle: 'italic',
  },
  eyeBtn: {
    paddingHorizontal: space[3],
    paddingVertical: 12,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: 13,
    paddingHorizontal: space[4],
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.text,
    letterSpacing: 0,
  },

  errorBox: {
    backgroundColor: colors.noSoft,
    borderRadius: radii.sm,
    padding: space[3],
  },
  errorText: { fontFamily: fonts.sans, fontSize: 13, color: colors.no, textAlign: 'center' },

  successToast: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    zIndex: 9999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: 'rgba(76, 175, 80, 0.35)',
    borderRadius: radii.lg,
    padding: space[4],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    shadowColor: '#2E7D32',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  successToastText: { fontFamily: fonts.sansMedium, fontSize: 14, color: '#2E7D32', flex: 1 },

  forgotBtn: { alignSelf: 'center', paddingVertical: space[1] },
  forgotText: { fontFamily: fonts.sans, fontSize: 13, color: colors.textLight, textDecorationLine: 'underline' },

  termsText: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.textLight,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: space[4],
    paddingBottom: space[6],
  },
  termsLink: {
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
});