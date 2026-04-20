/**
 * BotToggle — chat header three-state bot control.
 *
 * Phase 43 Plan 11. States:
 *   - On:    bot replies automatically
 *   - Off:   humans only
 *   - Muted: bot paused until a user-selected timestamp; auto-resumes on
 *            server read (resolveBotMode) + client ticker (useBotToggle).
 *
 * Interaction model:
 *   - Single tap: cycles On ↔ Off (never into Muted via tap — mute requires
 *     an explicit duration choice).
 *   - Long-press (500ms): opens the MuteDurationSheet to pick a window.
 *   - When mode='muted': the label renders "Silenciado por Xm|Xh" (via
 *     date-fns formatDistanceToNow with es locale) and shows a small X
 *     icon that, when tapped, clears the mute (back to 'on').
 *
 * Rationale for the "long-press opens sheet" gesture: a segmented three-
 * way picker would crowd the header on small phones (the chat header also
 * holds the back button, contact name, and info drawer button). Keeping
 * the primary gesture cheap (tap toggles the most common transitions) and
 * gating mute behind long-press mirrors Slack / WhatsApp's "pause
 * notifications" UX the user referenced in 43-CONTEXT.
 *
 * Dark-mode: all colors go through useTheme(). The label tint shifts to
 * warning for 'muted' so the user notices their bot is offline.
 */

import { Bot, BotOff, Clock, X as XIcon } from 'lucide-react-native';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useTheme } from '@/lib/theme';
import { useTranslation } from '@/lib/i18n';
import type { BotMode } from '@/hooks/useBotToggle';

interface Props {
  mode: BotMode;
  muteUntilMs: number | null;
  pending: boolean;
  onToggleOnOff: () => void;
  onOpenMuteSheet: () => void;
  onClearMute: () => void;
}

export function BotToggle({
  mode,
  muteUntilMs,
  pending,
  onToggleOnOff,
  onOpenMuteSheet,
  onClearMute,
}: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  // Recompute the "time until resume" string on a 30s tick so the label
  // stays fresh while the user looks at the screen. We avoid shorter
  // intervals because the label granularity is minutes / hours.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (mode !== 'muted') return;
    const id = setInterval(() => setTick((v) => v + 1), 30_000);
    return () => clearInterval(id);
  }, [mode]);

  const timeUntilResume = useMemo(() => {
    if (mode !== 'muted' || muteUntilMs === null) return null;
    void tick; // force re-memo on tick
    const distance = formatDistanceToNow(new Date(muteUntilMs), {
      locale: es,
      // `addSuffix: false` because we prefix with our own
      // "Silenciado por " label via i18n.
      addSuffix: false,
    });
    return distance;
  }, [mode, muteUntilMs, tick]);

  const palette = paletteForMode(mode, colors);
  const label = labelForMode(mode, t, timeUntilResume);
  const Icon = iconForMode(mode);

  return (
    <View style={[styles.container, { borderColor: palette.border, backgroundColor: palette.bg }]}>
      <Pressable
        onPress={() => {
          if (mode === 'muted') {
            // Tap during muted = open the mute sheet to CHANGE the duration.
            // A separate X icon handles "clear mute".
            onOpenMuteSheet();
            return;
          }
          onToggleOnOff();
        }}
        onLongPress={onOpenMuteSheet}
        delayLongPress={500}
        style={({ pressed }) => [
          styles.main,
          { opacity: pressed ? 0.7 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={
          mode === 'muted'
            ? t('chat.bot.a11y.mutedHint')
            : t('chat.bot.a11y.toggleHint')
        }
      >
        {pending ? (
          <ActivityIndicator size="small" color={palette.fg} />
        ) : (
          <Icon size={14} color={palette.fg} />
        )}
        <Text
          style={[styles.label, { color: palette.fg }]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Pressable>

      {mode === 'muted' ? (
        <Pressable
          onPress={onClearMute}
          hitSlop={10}
          style={({ pressed }) => [
            styles.clearBtn,
            { opacity: pressed ? 0.5 : 1, borderLeftColor: palette.border },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('chat.bot.clear_mute')}
        >
          <XIcon size={14} color={palette.fg} />
        </Pressable>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Mode → palette / icon / label helpers.
// ---------------------------------------------------------------------------

function paletteForMode(
  mode: BotMode,
  colors: ReturnType<typeof useTheme>['colors']
): { bg: string; fg: string; border: string } {
  switch (mode) {
    case 'on':
      return {
        bg: colors.surfaceAlt,
        fg: colors.success,
        border: colors.border,
      };
    case 'off':
      return {
        bg: colors.surfaceAlt,
        fg: colors.textMuted,
        border: colors.border,
      };
    case 'muted':
      return {
        bg: colors.surfaceAlt,
        fg: colors.warning,
        border: colors.warning,
      };
  }
}

function iconForMode(mode: BotMode) {
  switch (mode) {
    case 'on':
      return Bot;
    case 'off':
      return BotOff;
    case 'muted':
      return Clock;
  }
}

function labelForMode(
  mode: BotMode,
  t: (k: string, o?: Record<string, unknown>) => string,
  timeUntilResume: string | null
): string {
  switch (mode) {
    case 'on':
      return t('chat.bot.on');
    case 'off':
      return t('chat.bot.off');
    case 'muted':
      return timeUntilResume
        ? t('chat.bot.muted_until', { time: timeUntilResume })
        : t('chat.bot.muted');
  }
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  main: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    maxWidth: 120,
  },
  clearBtn: {
    paddingHorizontal: 8,
    justifyContent: 'center',
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
});
