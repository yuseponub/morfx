/**
 * WindowIndicator — renders the WhatsApp 24-hour customer-care window status.
 *
 * Phase 43 Plan 10b. Mirrors the web's window indicator visually:
 *   - within_window === true  -> green pill "Ventana abierta · Xh restantes"
 *   - within_window === false -> red pill   "Ventana cerrada · requiere plantilla"
 *   - last_customer_message_at === null -> neutral pill "Sin mensaje del cliente"
 *
 * The `within_window` + `hours_remaining` fields come from the server
 * (`GET /api/mobile/conversations/:id/contact`) so the math is identical to
 * the web path. This component does NOT recompute from
 * `last_customer_message_at` — that would risk drift from the reference
 * source of truth.
 */

import { View, Text, StyleSheet } from 'react-native';

import type { WindowIndicator as WindowIndicatorData } from '@/lib/api-schemas/contact-panel';
import { useTheme } from '@/lib/theme';
import { useTranslation } from '@/lib/i18n';

interface Props {
  window: WindowIndicatorData;
}

export function WindowIndicator({ window }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  if (!window.last_customer_message_at) {
    return (
      <View
        style={[
          styles.pill,
          { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
        ]}
      >
        <View
          style={[styles.dot, { backgroundColor: colors.textMuted }]}
        />
        <Text style={[styles.text, { color: colors.textMuted }]} numberOfLines={1}>
          {t('crmPanel.window.noMessage')}
        </Text>
      </View>
    );
  }

  if (window.within_window) {
    const hours = window.hours_remaining ?? 0;
    const rounded = Math.max(0, Math.round(hours));
    return (
      <View
        style={[
          styles.pill,
          {
            backgroundColor: withAlpha(colors.success, 0.12),
            borderColor: colors.success,
          },
        ]}
      >
        <View style={[styles.dot, { backgroundColor: colors.success }]} />
        <Text
          style={[styles.text, { color: colors.success }]}
          numberOfLines={1}
        >
          {t('crmPanel.window.open', { hours: rounded })}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: withAlpha(colors.danger, 0.12),
          borderColor: colors.danger,
        },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: colors.danger }]} />
      <Text style={[styles.text, { color: colors.danger }]} numberOfLines={1}>
        {t('crmPanel.window.closed')}
      </Text>
    </View>
  );
}

/**
 * Compose an RGB(a) fill from one of the theme hex colors. RN StyleSheet
 * does NOT support rgba-over-hex directly, but we can use a hex8 suffix.
 */
function withAlpha(hex: string, alpha: number): string {
  // Accept #RRGGBB and #RGB — output #RRGGBBAA.
  let h = hex.replace('#', '');
  if (h.length === 3) {
    h = h.split('').map((c) => c + c).join('');
  }
  if (h.length !== 6) return hex; // Unknown, fall back.
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${h}${a}`;
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
});
