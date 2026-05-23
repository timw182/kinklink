import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Linking,
  Modal,
  Animated,
  Pressable,
  Dimensions,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path, Circle, Rect, G, Line } from "react-native-svg";
import { useAuth } from "../context/useAuth";
import { useMatches } from "../context/MatchContext";
import { colors, fonts, space, radii } from "../theme/tokens";
import { SCREENS } from "../lib/constants";
import Button from "../components/Button";
import client from "../api/client";
import SlideView from "../components/SlideView";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";

const { width: SW, height: SH } = Dimensions.get("window");
const IS_TABLET = SW >= 768;
const COLS = IS_TABLET ? 3 : 2;
const GRID_W = IS_TABLET ? Math.min(SW - 80, 520) : SW - space[5] * 2;
const TILE_SIZE = (GRID_W - space[3] * (COLS - 1)) / COLS;

/* ── Tile icons ───────────────────────────────────────────────────────── */
function ProfileIcon({ size = 32 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 256 256" fill="none">
      <Circle cx="128" cy="96" r="44" fill={colors.violet} opacity={0.8} />
      <Path
        d="M56 224c0-39.8 32.2-72 72-72s72 32.2 72 72"
        stroke={colors.violet}
        strokeWidth="16"
        strokeLinecap="round"
        fill="none"
        opacity={0.6}
      />
    </Svg>
  );
}

function DataIcon({ size = 32 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 256 256" fill="none">
      <Path
        d="M176 104l-48 48-48-48"
        stroke={colors.coral}
        strokeWidth="16"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity={0.8}
      />
      <Path
        d="M80 152l48-48 48 48"
        stroke={colors.violet}
        strokeWidth="16"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity={0.6}
        transform="translate(0, 56) scale(1, -1) translate(0, -152)"
      />
    </Svg>
  );
}

function SupportIcon({ size = 32 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 256 256" fill="none">
      <Path
        d="M128 232c57.4 0 104-36.6 104-80s-46.6-80-104-80S24 108.6 24 152c0 20.2 10 38.6 26.4 52.4L40 232l36-16"
        fill={colors.rose}
        opacity={0.2}
      />
      <Path
        d="M128 232c57.4 0 104-36.6 104-80s-46.6-80-104-80S24 108.6 24 152c0 20.2 10 38.6 26.4 52.4L40 232l36-16"
        stroke={colors.rose}
        strokeWidth="12"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity={0.7}
      />
    </Svg>
  );
}

function PairingIcon({ size = 32 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 256 256" fill="none">
      <Circle cx="88" cy="128" r="44" stroke={colors.rose} strokeWidth="14" fill="none" opacity={0.7} />
      <Circle cx="168" cy="128" r="44" stroke={colors.violet} strokeWidth="14" fill="none" opacity={0.7} />
    </Svg>
  );
}

function AboutIcon({ size = 32 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 256 256" fill="none">
      <Circle cx="128" cy="128" r="88" fill={colors.violet} opacity={0.15} />
      <Circle cx="128" cy="128" r="88" stroke={colors.violet} strokeWidth="12" fill="none" opacity={0.5} />
      <Circle cx="128" cy="100" r="8" fill={colors.violet} opacity={0.9} />
      <Rect x="120" y="120" width="16" height="48" rx="6" fill={colors.violet} opacity={0.9} />
    </Svg>
  );
}

const ALL_TILES = [
  { id: "profile", label: "Profile", Icon: ProfileIcon },
  { id: "pairing", label: "Pairing", Icon: PairingIcon, unpairedOnly: true },
  { id: "data", label: "Data", Icon: DataIcon },
  { id: "support", label: "Support", Icon: SupportIcon },
  { id: "about", label: "About", Icon: AboutIcon },
];

const TILE_TINTS = {
  profile:  'rgba(155,128,212,0.12)',
  pairing:  'rgba(196,84,122,0.10)',
  data:     'rgba(240,122,106,0.10)',
  support:  'rgba(196,84,122,0.10)',
  about:    'rgba(155,128,212,0.12)',
};

/* ── Bottom sheet ─────────────────────────────────────────────────────── */
function Sheet({ open, onClose, title, children }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.92)).current;
  const [visible, setVisible] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  useEffect(() => {
    if (open) {
      setVisible(true);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, stiffness: 400, damping: 28 }),
      ]).start();
    } else if (visible) {
      const anim = Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 160, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 0.92, duration: 160, useNativeDriver: true }),
      ]);
      anim.start(() => { if (mountedRef.current) setVisible(false); });
      return () => anim.stop();
    }
  }, [open]);

  if (!visible && !open) return null;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Pressable style={sheetStyles.backdrop} onPress={onClose}>
        <Animated.View style={[sheetStyles.backdrop, { opacity: fadeAnim, backgroundColor: colors.overlay }]} />
      </Pressable>
      <Animated.View style={[sheetStyles.card, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
        <View style={sheetStyles.header}>
          <Text style={sheetStyles.title}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={sheetStyles.closeBtn}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Line x1="18" y1="6" x2="6" y2="18" stroke={colors.textMuted} strokeWidth={2.2} strokeLinecap="round" />
              <Line x1="6" y1="6" x2="18" y2="18" stroke={colors.textMuted} strokeWidth={2.2} strokeLinecap="round" />
            </Svg>
          </TouchableOpacity>
        </View>
        <View style={sheetStyles.body}>{children}</View>
      </Animated.View>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center" },
  card: {
    position: "absolute",
    alignSelf: "center",
    top: Math.round(SH * 0.18),
    width: SW - space[8],
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    paddingHorizontal: space[6],
    paddingBottom: space[6],
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 32,
    elevation: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: space[5],
    paddingBottom: space[4],
  },
  title: { fontFamily: fonts.sansMedium, fontSize: 17, color: colors.text, letterSpacing: 0.2 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  body: { gap: space[5] },
});

/* ── Main component ──────────────────────────────────────────────────── */
export default function SettingsScreen({ navigation }) {
  const { user, logout, updateProfile, setUser } = useAuth();
  const { resetState, setResetState, matches: allMatches } = useMatches();
  const [hasResponses, setHasResponses] = useState(true); // assume yes until checked
  const TILES = ALL_TILES.filter((t) => !t.unpairedOnly || !user?.coupleId);

  const [activeSheet, setActiveSheet] = useState(null);

  // Pairing
  const [pairingCode, setPairingCode] = useState(null);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  useEffect(() => {
    if (activeSheet === "pairing" && !user?.coupleId) {
      client.get("/pairing/status").then((r) => {
        if (r.pairing_code) setPairingCode(r.pairing_code);
      }).catch(() => {});
    }
  }, [activeSheet]);

  async function handleCopyCode() {
    if (!pairingCode) return;
    await Clipboard.setStringAsync(pairingCode);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2500);
  }

  async function handleJoinCode() {
    if (joinCode.length < 6) return;
    setJoinError("");
    setJoining(true);
    try {
      const result = await client.post("/pairing/join", { code: joinCode.trim().toUpperCase() });
      setUser({
        id: result.id,
        username: result.username,
        displayName: result.display_name,
        avatarColor: result.avatar_color,
        coupleId: result.couple_id ?? null,
        partnerName: result.partner_name ?? null,
      });
      closeSheet();
    } catch (err) {
      setJoinError(err.message || "Invalid code");
    } finally {
      setJoining(false);
    }
  }

  // Profile
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState(null);

  // Change password
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmNewPw, setConfirmNewPw] = useState("");
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwChanging, setPwChanging] = useState(false);
  const [showPwFields, setShowPwFields] = useState(false);

  // Check if there's anything to reset
  useEffect(() => {
    client.get('/catalog/responses').then((resps) => {
      setHasResponses(Object.keys(resps || {}).length > 0);
    }).catch(() => {});
  }, []);

  const nothingToReset = !hasResponses && allMatches.length === 0;

  // Data
  const [resetConfirm, setResetConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Support
  const [ticketMsg, setTicketMsg] = useState("");
  const [ticketSent, setTicketSent] = useState(false);
  const [ticketError, setTicketError] = useState("");
  const [ticketSending, setTicketSending] = useState(false);

  function openSheet(id) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveSheet(id);
  }
  function closeSheet() {
    setActiveSheet(null);
    setResetConfirm(false);
  }

  async function handleSave() {
    setSaveError("");
    try {
      await updateProfile(displayName);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(err.message || "Could not save");
    }
  }

  async function handleChangePassword() {
    setPwError("");
    if (newPw !== confirmNewPw) {
      setPwError("Passwords do not match");
      return;
    }
    setPwChanging(true);
    try {
      await client.post("/auth/change-password", {
        current_password: currentPw,
        new_password: newPw,
      });
      setPwSaved(true);
      setCurrentPw("");
      setNewPw("");
      setConfirmNewPw("");
      setShowPwFields(false);
      setTimeout(() => setPwSaved(false), 3000);
    } catch (err) {
      setPwError(err.message || "Could not change password");
    } finally {
      setPwChanging(false);
    }
  }

  async function handleLogout() {
    await logout();
  }

  async function handleDisconnect() {
    Alert.alert("Disconnect partner", "Disconnect from your partner? You can reconnect with a new pairing code.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect",
        style: "destructive",
        onPress: async () => {
          setDisconnecting(true);
          setDisconnectError(null);
          try {
            await client.post("/auth/disconnect");
            await logout();
          } catch (e) {
            setDisconnectError(e?.message || "Couldn't disconnect. Try again.");
          }
          setDisconnecting(false);
        },
      },
    ]);
  }

  async function handleRequestReset() {
    try {
      await client.post("/reset/request");
      setResetState("pending_mine");
      setResetConfirm(false);
    } catch (e) {
      Alert.alert("Error", e.message || "Could not send reset request");
    }
  }
  async function handleConfirmReset() {
    try {
      await client.post("/reset/confirm");
    } catch (e) {
      Alert.alert("Error", e.message || "Could not confirm reset");
    }
  }
  async function handleDeclineReset() {
    try {
      await client.post("/reset/decline");
    } catch (e) {
      Alert.alert("Error", e.message || "Could not decline reset");
    }
    setResetState("none");
  }
  async function handleCancelReset() {
    try {
      await client.post("/reset/cancel");
      setResetState("none");
    } catch {
      setResetState("none");
    }
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      await client.delete('/auth/account');
      await logout();
    } catch (e) {
      Alert.alert("Error", e.message || "Could not delete account");
      setDeleting(false);
    }
  }

  async function handleTicketSubmit() {
    if (!ticketMsg.trim()) return;
    setTicketSending(true);
    setTicketError("");
    try {
      await client.post("/tickets", { message: ticketMsg.trim() });
      setTicketSent(true);
      setTicketMsg("");
      setTimeout(() => setTicketSent(false), 4000);
    } catch (err) {
      setTicketError(err.message || "Could not send. Try again.");
    } finally {
      setTicketSending(false);
    }
  }

  // Stagger tile entrances
  const tileAnims = useRef(TILES.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    Animated.stagger(
      60,
      tileAnims.map((a) => Animated.spring(a, { toValue: 1, useNativeDriver: true, stiffness: 300, damping: 22 })),
    ).start();
  }, []);

  return (
    <SlideView>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.page}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Settings</Text>
            <View style={styles.headerActions}>
              <Button
                variant="secondary"
                size="sm"
                onPress={handleLogout}
                style={{ borderColor: 'rgba(240,122,106,0.35)', backgroundColor: 'rgba(240,122,106,0.06)', color: colors.no }}
              >
                Sign out
              </Button>
            </View>
          </View>

          {/* ── 2×2 tile grid ── */}
          <View style={styles.grid}>
            {TILES.map((tile, i) => (
              <Animated.View
                key={tile.id}
                style={{
                  width: TILE_SIZE,
                  height: TILE_SIZE,
                  opacity: tileAnims[i],
                  transform: [{ translateY: tileAnims[i].interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
                }}
              >
                <TouchableOpacity style={styles.tile} activeOpacity={0.72} onPress={() => openSheet(tile.id)}>
                  <View style={[styles.tileIconWell, TILE_TINTS[tile.id] && { backgroundColor: TILE_TINTS[tile.id] }]}>
                    <tile.Icon size={30} />
                  </View>
                  <Text style={styles.tileLabel}>{tile.label}</Text>
                </TouchableOpacity>
              </Animated.View>
            ))}
          </View>

          <Text style={styles.version}>v0.1 · Venn</Text>
        </View>

        {/* ── Profile sheet ── */}
        <Sheet open={activeSheet === "profile"} onClose={closeSheet} title="Profile">
          <View style={styles.field}>
            <Text style={styles.label}>Display Name</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Your name"
                placeholderTextColor={colors.textLight}
              />
              <Button variant="secondary" size="sm" onPress={handleSave}>
                {saved ? "Saved!" : "Save"}
              </Button>
            </View>
            {!!saveError && <Text style={styles.errorText}>{saveError}</Text>}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <View style={[styles.input, styles.inputReadonly]}>
              <Text style={styles.inputReadonlyText}>{user?.username}</Text>
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            {pwSaved && <Text style={styles.successText}>Password updated!</Text>}
            {!showPwFields ? (
              <Button variant="secondary" size="sm" onPress={() => setShowPwFields(true)}>
                Change password
              </Button>
            ) : (
              <View style={{ gap: space[3] }}>
                <TextInput
                  style={styles.input}
                  value={currentPw}
                  onChangeText={setCurrentPw}
                  placeholder="Current password"
                  placeholderTextColor={colors.textLight}
                  secureTextEntry
                />
                <TextInput
                  style={styles.input}
                  value={newPw}
                  onChangeText={setNewPw}
                  placeholder="New password"
                  placeholderTextColor={colors.textLight}
                  secureTextEntry
                />
                <TextInput
                  style={styles.input}
                  value={confirmNewPw}
                  onChangeText={setConfirmNewPw}
                  placeholder="Confirm new password"
                  placeholderTextColor={colors.textLight}
                  secureTextEntry
                />
                {!!pwError && <Text style={styles.errorText}>{pwError}</Text>}
                <View style={styles.sheetActions}>
                  <Button
                    variant="primary"
                    size="sm"
                    onPress={handleChangePassword}
                    loading={pwChanging}
                    disabled={!currentPw || !newPw || !confirmNewPw}
                  >
                    Update password
                  </Button>
                  <Button variant="ghost" size="sm" onPress={() => { setShowPwFields(false); setPwError(""); }}>
                    Cancel
                  </Button>
                </View>
              </View>
            )}
          </View>

          {user?.coupleId ? (
            <View style={styles.field}>
              <Text style={styles.label}>Connected to</Text>
              <View style={styles.inputRow}>
                <View style={[styles.input, styles.inputReadonly]}>
                  <Text style={styles.inputReadonlyText}>{user.partnerName}</Text>
                </View>
                <Button
                  variant="secondary"
                  size="sm"
                  onPress={handleDisconnect}
                  disabled={disconnecting}
                  loading={disconnecting}
                >
                  Disconnect
                </Button>
              </View>
              {!!disconnectError && <Text style={styles.errorText}>{disconnectError}</Text>}
            </View>
          ) : (
            <View style={styles.field}>
              <Text style={styles.muted}>You're browsing solo. Use the Pairing tile to connect with your partner.</Text>
            </View>
          )}
        </Sheet>

        {/* ── Pairing sheet ── */}
        <Sheet open={activeSheet === "pairing"} onClose={closeSheet} title="Pairing">
          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
            <View style={{ gap: space[5], paddingBottom: space[2] }}>
              {user?.coupleId ? (
                <View style={styles.field}>
                  <Text style={styles.label}>Connected to</Text>
                  <View style={[styles.input, styles.inputReadonly]}>
                    <Text style={styles.inputReadonlyText}>{user.partnerName}</Text>
                  </View>
                  <Button variant="danger" size="sm" onPress={handleDisconnect} disabled={disconnecting} loading={disconnecting}>
                    Disconnect
                  </Button>
                </View>
              ) : (
                <>
                  {!!pairingCode && (
                    <View style={styles.field}>
                      <Text style={styles.label}>Your active invite code</Text>
                      <View style={styles.codeChipsRow}>
                        {pairingCode.split("").map((char, i) => (
                          <View key={i} style={styles.codeChip}>
                            <Text style={styles.codeChipText}>{char}</Text>
                          </View>
                        ))}
                      </View>
                      <Button variant="secondary" size="sm" onPress={handleCopyCode}>
                        {codeCopied ? "Copied!" : "Copy code"}
                      </Button>
                      <Text style={styles.muted}>Waiting for your partner to enter this code…</Text>
                    </View>
                  )}

                  {!!pairingCode && <View style={styles.sectionDivider} />}

                  <View style={styles.field}>
                    <Text style={styles.label}>Enter a partner's code</Text>
                    <Text style={styles.muted}>Enter the 8-character code your partner shared with you.</Text>
                    <TextInput
                      style={styles.codeInputField}
                      value={joinCode}
                      onChangeText={(t) => setJoinCode(t.toUpperCase())}
                      placeholder="········"
                      placeholderTextColor={colors.textLight}
                      maxLength={8}
                      autoCapitalize="characters"
                      autoCorrect={false}
                    />
                    {!!joinError && <Text style={styles.errorText}>{joinError}</Text>}
                    <Button
                      variant="primary"
                      size="sm"
                      onPress={handleJoinCode}
                      loading={joining}
                      disabled={joinCode.length < 6}
                    >
                      Connect
                    </Button>
                  </View>
                </>
              )}
            </View>
          </ScrollView>
        </Sheet>

        {/* ── Data sheet ── */}
        <Sheet open={activeSheet === "data"} onClose={closeSheet} title="Data">
          <View style={styles.field}>
            <Text style={styles.label}>What we store</Text>
            <Text style={styles.muted}>
              Just your email (for login and payment) and a password — that's it. Your password is salted and scrambled with bcrypt (10 rounds of pure cryptographic chaos + a generous sprinkle of fairy dust) — so not even we can read it. Your display name? Call yourself whatever you want, as long as your partner still recognizes you. No real names, no phone numbers, no location, no tracking. Your swipes stay between you two — and only the mutual ones ever surface.
            </Text>
          </View>

          <View style={styles.sectionDivider} />

          {user?.coupleId && (
            <>
              <View style={styles.field}>
                <Text style={styles.label}>Reset swipes & matches</Text>
                <Text style={styles.muted}>
                  Clears all swipes and matches for both of you. Both partners must confirm.
                </Text>

                {resetState === "none" && !resetConfirm && (
                  <Button variant="secondary" size="sm" onPress={() => setResetConfirm(true)} disabled={nothingToReset}>
                    {nothingToReset ? 'Nothing to reset' : 'Request reset'}
                  </Button>
                )}

                {resetState === "none" && resetConfirm && (
                  <View style={{ gap: space[3] }}>
                    <Text style={styles.warning}>Are you sure? Your partner will also need to confirm.</Text>
                    <View style={styles.sheetActions}>
                      <Button variant="danger" size="sm" onPress={handleRequestReset}>
                        Yes, send request
                      </Button>
                      <Button variant="ghost" size="sm" onPress={() => setResetConfirm(false)}>
                        Cancel
                      </Button>
                    </View>
                  </View>
                )}

                {resetState === "pending_mine" && (
                  <View>
                    <Text style={styles.muted}>Waiting for your partner to confirm…</Text>
                    <Button variant="ghost" size="sm" onPress={handleCancelReset}>
                      Cancel request
                    </Button>
                  </View>
                )}

                {resetState === "pending_partner" && (
                  <View>
                    <Text style={styles.warning}>Your partner wants to reset all swipes and matches.</Text>
                    <View style={styles.sheetActions}>
                      <Button variant="danger" size="sm" onPress={handleConfirmReset}>
                        Confirm reset
                      </Button>
                      <Button variant="ghost" size="sm" onPress={handleDeclineReset}>
                        Decline
                      </Button>
                    </View>
                  </View>
                )}
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Delete account</Text>
                <Text style={styles.muted}>
                  Permanently deletes your account. Your partner will be unpaired and their swipes/matches cleared. This cannot be undone.
                </Text>
                {!deleteConfirm ? (
                  <Button variant="danger" size="sm" onPress={() => setDeleteConfirm(true)}>
                    Delete account
                  </Button>
                ) : (
                  <View style={{ gap: space[3] }}>
                    <Text style={styles.warning}>Are you sure? This is permanent.</Text>
                    <View style={styles.sheetActions}>
                      <Button variant="danger" size="sm" onPress={handleDeleteAccount} loading={deleting}>
                        Yes, delete
                      </Button>
                      <Button variant="ghost" size="sm" onPress={() => setDeleteConfirm(false)}>
                        Cancel
                      </Button>
                    </View>
                  </View>
                )}
              </View>
            </>
          )}

          {!user?.coupleId && (
            <View style={styles.field}>
              <Text style={styles.label}>Delete account</Text>
              <Text style={styles.muted}>
                Permanently deletes your account and all your data. This cannot be undone.
              </Text>
              {!deleteConfirm ? (
                <Button variant="danger" size="sm" onPress={() => setDeleteConfirm(true)}>
                  Delete account
                </Button>
              ) : (
                <View style={{ gap: space[3] }}>
                  <Text style={styles.warning}>Are you sure? This is permanent.</Text>
                  <View style={styles.sheetActions}>
                    <Button variant="danger" size="sm" onPress={handleDeleteAccount} loading={deleting}>
                      Yes, delete
                    </Button>
                    <Button variant="ghost" size="sm" onPress={() => setDeleteConfirm(false)}>
                      Cancel
                    </Button>
                  </View>
                </View>
              )}
            </View>
          )}
        </Sheet>

        {/* ── Support sheet ── */}
        <Sheet open={activeSheet === "support"} onClose={closeSheet} title="Support">
          <View style={styles.field}>
            <Text style={styles.label}>Send us a message</Text>
            <TextInput
              style={[styles.input, { height: 100, textAlignVertical: "top" }]}
              placeholder="Describe your issue or feedback…"
              placeholderTextColor={colors.textLight}
              value={ticketMsg}
              onChangeText={setTicketMsg}
              multiline
            />
            {!!ticketError && <Text style={styles.errorText}>{ticketError}</Text>}
            {ticketSent && <Text style={styles.successText}>Message sent! We'll look into it.</Text>}
            <Button
              variant="secondary"
              size="sm"
              onPress={handleTicketSubmit}
              disabled={ticketSending || !ticketMsg.trim()}
            >
              {ticketSending ? "Sending…" : "Send"}
            </Button>
          </View>
        </Sheet>

        {/* ── About sheet ── */}
        <Sheet open={activeSheet === "about"} onClose={closeSheet} title="About Venn">
          <View style={[styles.field, { alignItems: "center" }]}>
            <Text style={[styles.muted, { textAlign: "center" }]}>
              A private space to find shared interests with your partner. Your responses are never shared unless you both say
              yes.
            </Text>
            <View style={styles.aboutLinks}>
              <Button
                variant="secondary"
                size="sm"
                onPress={() => {
                  closeSheet();
                  navigation.navigate(SCREENS.PRIVACY);
                }}
              >
                Privacy Policy
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onPress={() => {
                  closeSheet();
                  navigation.navigate(SCREENS.IMPRESSUM);
                }}
              >
                Impressum
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onPress={() => {
                  closeSheet();
                  navigation.navigate(SCREENS.TERMS);
                }}
              >
                Terms of Service
              </Button>
              <Button variant="secondary" size="sm"
                onPress={() => { closeSheet(); navigation.navigate(SCREENS.EXPERTS); }}>
                What Experts say
              </Button>
            </View>
          </View>
        </Sheet>
      </SafeAreaView>
    </SlideView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  page: {
    flex: 1,
    paddingHorizontal: space[5],
    paddingTop: space[4],
    paddingBottom: space[2],
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space[4],
  },
  headerActions: { flexDirection: "row", gap: space[2] },
  title: { fontFamily: fonts.serifBold, fontSize: 26, color: colors.text, fontStyle: "italic" },

  /* ── tile grid ── */
  grid: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[3],
    alignContent: "center",
    justifyContent: "center",
    maxWidth: IS_TABLET ? GRID_W : undefined,
    alignSelf: "center",
    width: IS_TABLET ? GRID_W : undefined,
  },
  tile: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space[3],
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    shadowColor: '#2D1F3D',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  tileIconWell: {
    width: 56,
    height: 56,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.text,
    letterSpacing: 0.3,
  },

  version: {
    textAlign: "center",
    fontSize: 11,
    fontFamily: fonts.sans,
    color: colors.textLight,
    letterSpacing: 0.5,
    paddingVertical: space[2],
  },

  /* ── Sheet content ── */
  field: { gap: space[2] },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  inputRow: { flexDirection: "row", gap: space[3], alignItems: "center" },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radii.lg,
    paddingVertical: space[2],
    paddingHorizontal: space[3],
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.text,
  },
  inputReadonly: { justifyContent: "center" },
  inputReadonlyText: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.text },

  muted: { fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  warning: { fontFamily: fonts.sans, fontSize: 13, color: colors.no, lineHeight: 18 },
  errorText: { fontFamily: fonts.sans, fontSize: 12, color: colors.no },
  successText: { fontFamily: fonts.sans, fontSize: 13, color: "#4caf88" },

  sheetActions: { flexDirection: "row", gap: space[3], alignItems: "center", flexWrap: "wrap" },
  aboutLinks: { flexDirection: "row", gap: space[3], flexWrap: "wrap", marginTop: space[2] },

  codeChipsRow: { flexDirection: "row", gap: 5, justifyContent: "center" },
  codeChip: {
    width: 32, height: 40,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  codeChipText: { fontFamily: fonts.serifBold, fontSize: 16, color: colors.violet },

  codeInputField: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: 14,
    paddingHorizontal: space[4],
    fontFamily: fonts.serifBold,
    fontSize: 22,
    letterSpacing: 7,
    color: colors.violet,
    textAlign: "center",
  },

  sectionDivider: { height: 1, backgroundColor: colors.border },

  successText: { fontFamily: fonts.sans, fontSize: 13, color: "#4caf88" },
});
