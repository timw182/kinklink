import 'react-native-gesture-handler';
import React, { Component } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { useFonts,
  Comfortaa_400Regular,
  Comfortaa_600SemiBold,
  Comfortaa_700Bold,
} from '@expo-google-fonts/comfortaa';
import {
  DMSans_300Light,
  DMSans_400Regular,
  DMSans_500Medium,
} from '@expo-google-fonts/dm-sans';
import * as Updates from 'expo-updates';
import { AuthProvider } from './src/context/AuthContext';
import { MatchProvider } from './src/context/MatchContext';
import { PurchaseProvider } from './src/context/PurchaseContext';
import AppNavigator from './src/navigation/AppNavigator';
import { colors, fonts, radii, space } from './src/theme/tokens';

// ── Error Boundary ───────────────────────────────────────────────────────────

class ErrorBoundary extends Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    if (__DEV__) console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  handleRestart = async () => {
    try {
      await Updates.reloadAsync();
    } catch {
      // Fallback: reset state so the app re-renders
      this.setState({ hasError: false, error: null });
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={ebStyles.container}>
          <Text style={ebStyles.title}>Something went wrong</Text>
          <Text style={ebStyles.message}>
            An unexpected error occurred. Please restart the app.
          </Text>
          <TouchableOpacity style={ebStyles.button} onPress={this.handleRestart}>
            <Text style={ebStyles.buttonText}>Restart app</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const ebStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space[6],
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 22,
    color: colors.text,
    marginBottom: space[3],
    textAlign: 'center',
  },
  message: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: space[6],
    lineHeight: 20,
  },
  button: {
    backgroundColor: colors.accent,
    paddingVertical: space[3],
    paddingHorizontal: space[6],
    borderRadius: radii.full,
  },
  buttonText: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.textInverse,
  },
});

// ── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [fontsLoaded] = useFonts({
    Comfortaa_400Regular,
    Comfortaa_600SemiBold,
    Comfortaa_700Bold,
    DMSans_300Light,
    DMSans_400Regular,
    DMSans_500Medium,
  });

  if (!fontsLoaded) return null;

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={styles.root}>
        <PurchaseProvider>
          <AuthProvider>
            <MatchProvider>
              <AppNavigator />
            </MatchProvider>
          </AuthProvider>
        </PurchaseProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
