export const CATEGORIES = [
  { key: 'foreplay', label: 'Connection', emoji: '💗' },
  { key: 'positions', label: 'Together', emoji: '🌀' },
  { key: 'settings', label: 'Settings', emoji: '🌙' },
  { key: 'roleplay', label: 'Themes', emoji: '🎭' },
  { key: 'toys-gear', label: 'Extras', emoji: '🎁' },
  { key: 'adventurous', label: 'Adventurous', emoji: '✨' },
];

export const MOODS = [
  { key: 'passionate', label: 'Affectionate', emoji: '💗' },
  { key: 'tender', label: 'Tender', emoji: '🫶' },
  { key: 'playful', label: 'Playful', emoji: '🎈' },
  { key: 'curious', label: 'Curious', emoji: '✨' },
  { key: 'lazy', label: 'Lazy', emoji: '😴' },
  { key: 'romantic', label: 'Romantic', emoji: '🌹' },
  { key: 'confident', label: 'Confident', emoji: '😎' },
  { key: 'nervous', label: 'Nervous', emoji: '🫣' },
  { key: 'cuddly', label: 'Cuddly', emoji: '🧸' },
  { key: 'flirty', label: 'Flirty', emoji: '🙂' },
  { key: 'dreamy', label: 'Dreamy', emoji: '🌙' },
  { key: 'cheeky', label: 'Cheeky', emoji: '🙃' },
];

// Preset expressions partners can send from the Mood tab. Keys must match
// VALID_EXPRESSIONS in backend/models.py — server rejects anything else.
export const EXPRESSIONS = [
  // Affection
  { key: 'thinking',     label: 'thinking of you', emoji: '💗' },
  { key: 'love',         label: 'love you',        emoji: '🫶' },
  { key: 'kiss',         label: 'kiss',            emoji: '😘' },
  { key: 'miss',         label: 'miss you',        emoji: '🤗' },
  { key: 'hug',          label: 'hug',             emoji: '🫂' },
  { key: 'proud',        label: 'proud of you',    emoji: '🥰' },
  // Daily rhythm
  { key: 'good_morning', label: 'good morning',    emoji: '🌅' },
  { key: 'goodnight',    label: 'goodnight',       emoji: '🌙' },
  { key: 'on_my_way',    label: 'on my way',       emoji: '🚗' },
  { key: 'home_soon',    label: 'home soon',       emoji: '🏠' },
  // Invitations
  { key: 'coffee',       label: 'coffee?',         emoji: '☕' },
  { key: 'dinner',       label: 'dinner?',         emoji: '🍷' },
];

export const SCREENS = {
  LANDING: 'Landing',
  PAIRING: 'Pairing',
  CODE_REVEAL: 'CodeReveal',
  CONNECTED: 'Connected',
  BROWSE: 'Browse',
  MATCHES: 'Matches',
  MOOD: 'Mood',
  SETTINGS: 'Settings',
  PRIVACY: 'Privacy',
  IMPRESSUM: 'Impressum',
  EXPERTS: 'Experts',
  TERMS: 'Terms',
};
