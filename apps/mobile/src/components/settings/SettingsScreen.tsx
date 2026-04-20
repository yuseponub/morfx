/**
 * SettingsScreen — mobile app settings.
 *
 * Phase 43 Plan 14.
 *
 * Sections:
 *   - Cuenta (account): signed-in email + logout button.
 *   - Apariencia (theme): light / dark / system radio group — persists via
 *     `setThemeOverride` from Plan 04 (ThemeProvider already owns the
 *     AsyncStorage key `mobile:themeOverride`).
 *   - Notificaciones: two toggles, both persisted to AsyncStorage.
 *       * notify_all_messages (default true)
 *       * preview_show_content (default true)
 *     These are CLIENT-SIDE UX ONLY in v1 — the server still sends pushes
 *     with full content regardless. A disclaimer row states this. v1.1 will
 *     add a /api/mobile/push/preferences GET that the Inngest push function
 *     consults before sending.
 *   - Idioma: "Español" (disabled, placeholder for future i18n).
 *   - Acerca de: app version from expo-application (with a safe fallback if
 *     the native module fails to resolve).
 *
 * All text routes through `t()` — no hardcoded Spanish strings outside
 * `es.json`. Colors come from `useTheme()` for dark-mode parity.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { LogOut, Check } from 'lucide-react-native';
import { useEffect, useState, useCallback } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { signOut } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import {
  useTheme,
  type ThemeOverride,
} from '@/lib/theme';
import { useTranslation } from '@/lib/i18n';

// AsyncStorage keys — matching the plan text.
const KEY_NOTIFY_ALL = 'mobile:notify_all_messages';
const KEY_PREVIEW_CONTENT = 'mobile:preview_show_content';

// ---------------------------------------------------------------------------
// Safe app-version loader.
//
// expo-application is a transitive dep of expo-notifications (Plan 13), so
// the native module ships in the current APK. Still, we guard with a
// try/catch at import time so any future delta that drops it falls back
// gracefully to "1.0.0" instead of crashing Settings.
// ---------------------------------------------------------------------------
function loadAppVersion(): string {
  try {
    // Dynamic require — tsc still typechecks, but we catch missing modules.
    const Application = require('expo-application') as {
      nativeApplicationVersion?: string | null;
    };
    return Application.nativeApplicationVersion ?? '1.0.0';
  } catch (err) {
    console.warn('[SettingsScreen] expo-application unavailable:', err);
    return '1.0.0';
  }
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export function SettingsScreen() {
  const { colors, override, setOverride } = useTheme();
  const { t } = useTranslation();

  const [email, setEmail] = useState<string | null>(null);
  const [notifyAll, setNotifyAll] = useState<boolean>(true);
  const [previewContent, setPreviewContent] = useState<boolean>(true);
  const [appVersion] = useState<string>(() => loadAppVersion());

  // Load user email + push prefs on mount.
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setEmail(data.user?.email ?? null);
    })();
    (async () => {
      const [rawNotify, rawPreview] = await Promise.all([
        AsyncStorage.getItem(KEY_NOTIFY_ALL),
        AsyncStorage.getItem(KEY_PREVIEW_CONTENT),
      ]);
      if (!mounted) return;
      // Defaults are `true` — a missing key (null) means "not yet set" which
      // we treat as ON per CONTEXT "Push events default ON".
      if (rawNotify !== null) setNotifyAll(rawNotify === 'true');
      if (rawPreview !== null) setPreviewContent(rawPreview === 'true');
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const persistNotifyAll = useCallback(async (next: boolean) => {
    setNotifyAll(next);
    await AsyncStorage.setItem(KEY_NOTIFY_ALL, next ? 'true' : 'false');
  }, []);

  const persistPreviewContent = useCallback(async (next: boolean) => {
    setPreviewContent(next);
    await AsyncStorage.setItem(KEY_PREVIEW_CONTENT, next ? 'true' : 'false');
  }, []);

  const handleLogout = useCallback(() => {
    Alert.alert(
      t('settings.account.logoutConfirmTitle'),
      t('settings.account.logoutConfirmBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.logout'),
          style: 'destructive',
          onPress: () => {
            void signOut();
            // onAuthStateChange in _layout.tsx will route back to /(auth)/login.
          },
        },
      ]
    );
  }, [t]);

  const themeOptions: Array<{ key: ThemeOverride; label: string }> = [
    { key: 'light', label: t('settings.appearance.light') },
    { key: 'dark', label: t('settings.appearance.dark') },
    { key: 'system', label: t('settings.appearance.system') },
  ];

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.bg }]}
      edges={['top', 'left', 'right']}
    >
      <View
        style={[
          styles.header,
          { borderBottomColor: colors.border, backgroundColor: colors.bg },
        ]}
      >
        <Text
          style={[styles.headerTitle, { color: colors.text }]}
          accessibilityRole="header"
        >
          {t('settings.title')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Cuenta ------------------------------------------------------- */}
        <Section title={t('settings.account.title')} colors={colors}>
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: colors.textMuted }]}>
              {t('settings.account.email')}
            </Text>
            <Text
              style={[styles.rowValue, { color: colors.text }]}
              numberOfLines={1}
            >
              {email ?? '—'}
            </Text>
          </View>
          <Pressable
            onPress={handleLogout}
            style={({ pressed }) => [
              styles.logoutBtn,
              {
                backgroundColor: colors.surfaceAlt,
                borderColor: colors.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('common.logout')}
          >
            <LogOut size={18} color={colors.danger} />
            <Text style={[styles.logoutText, { color: colors.danger }]}>
              {t('common.logout')}
            </Text>
          </Pressable>
        </Section>

        {/* Apariencia --------------------------------------------------- */}
        <Section title={t('settings.appearance.title')} colors={colors}>
          {themeOptions.map((opt) => {
            const selected = override === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => {
                  void setOverride(opt.key);
                }}
                style={({ pressed }) => [
                  styles.radioRow,
                  {
                    backgroundColor: selected
                      ? colors.surfaceAlt
                      : 'transparent',
                    borderColor: colors.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={opt.label}
              >
                <Text style={[styles.radioLabel, { color: colors.text }]}>
                  {opt.label}
                </Text>
                {selected ? (
                  <Check size={18} color={colors.primary} />
                ) : null}
              </Pressable>
            );
          })}
        </Section>

        {/* Notificaciones ---------------------------------------------- */}
        <Section title={t('settings.notifications.title')} colors={colors}>
          <ToggleRow
            label={t('settings.notifications.notifyAll')}
            value={notifyAll}
            onChange={(v) => void persistNotifyAll(v)}
            colors={colors}
          />
          <ToggleRow
            label={t('settings.notifications.previewContent')}
            value={previewContent}
            onChange={(v) => void persistPreviewContent(v)}
            colors={colors}
          />
          <Text
            style={[styles.disclaimer, { color: colors.textMuted }]}
          >
            {t('settings.notifications.disclaimer')}
          </Text>
        </Section>

        {/* Idioma ------------------------------------------------------- */}
        <Section title={t('settings.language.title')} colors={colors}>
          <View style={[styles.row, { opacity: 0.6 }]}>
            <Text style={[styles.rowLabel, { color: colors.textMuted }]}>
              {t('settings.language.current')}
            </Text>
            <Text style={[styles.rowValue, { color: colors.text }]}>
              {t('settings.language.spanish')}
            </Text>
          </View>
        </Section>

        {/* Acerca de ---------------------------------------------------- */}
        <Section title={t('settings.about.title')} colors={colors}>
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: colors.textMuted }]}>
              {t('settings.about.version')}
            </Text>
            <Text style={[styles.rowValue, { color: colors.text }]}>
              {appVersion}
            </Text>
          </View>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Small shared pieces
// ---------------------------------------------------------------------------

function Section({
  title,
  children,
  colors,
}: {
  title: string;
  children: React.ReactNode;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
        {title}
      </Text>
      <View
        style={[
          styles.sectionBody,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
  colors,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <View style={styles.toggleRow}>
      <Text
        style={[styles.toggleLabel, { color: colors.text }]}
        numberOfLines={2}
      >
        {label}
      </Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{
          false: colors.border,
          true: colors.primary,
        }}
        thumbColor={colors.surface}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
    gap: 18,
    paddingBottom: 40,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingHorizontal: 4,
  },
  sectionBody: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  rowLabel: {
    fontSize: 13,
    flex: 1,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'right',
    flexShrink: 1,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: '600',
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  radioLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'transparent', // overridden inline via colors.border
  },
  toggleLabel: {
    fontSize: 14,
    flex: 1,
  },
  disclaimer: {
    fontSize: 11,
    lineHeight: 15,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontStyle: 'italic',
  },
});
