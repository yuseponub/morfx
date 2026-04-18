/**
 * SlaTimer — "time since the customer last wrote" signal for the inbox card.
 *
 * Product rationale (43-CONTEXT.md — Inbox list layout):
 *   "time since the client last sent a message — this is a support-SLA signal
 *    — how long the customer has been waiting."
 *
 * Color thresholds (user expectations on support turnaround):
 *   - < 1h     : neutral (textMuted)
 *   - 1h - 4h  : warning (amber)
 *   - >= 4h    : danger  (red)
 *
 * Renders nothing when lastCustomerMessageAt is null (never heard from
 * customer on this conversation — no SLA applies).
 *
 * Colors come from useTheme() so dark mode is honored automatically.
 */

import { User } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

import { useTheme } from '@/lib/theme';
import { useTranslation } from '@/lib/i18n';

interface SlaTimerProps {
  /** Timestamp (ms epoch or ISO string). null -> component renders nothing. */
  lastCustomerMessageAt: number | string | null;
}

function resolveDate(value: number | string | null): Date | null {
  if (value == null) return null;
  if (typeof value === 'number') return new Date(value);
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

export function SlaTimer({ lastCustomerMessageAt }: SlaTimerProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const date = resolveDate(lastCustomerMessageAt);
  if (!date) return null;

  const ageMs = Date.now() - date.getTime();
  const hours = ageMs / (1000 * 60 * 60);

  let color: string;
  if (hours < 1) {
    color = colors.textMuted;
  } else if (hours < 4) {
    color = colors.warning;
  } else {
    color = colors.danger;
  }

  // formatDistanceToNow without addSuffix so we can prepend our own copy
  // ("Esperando cliente: hace 5m") if the UI evolves. For now we render
  // the bare "hace Xm" / "hace Xh" Spanish relative string.
  const rel = formatDistanceToNow(date, {
    locale: es,
    addSuffix: true,
  });

  return (
    <View
      style={styles.container}
      accessibilityLabel={`${t('inbox.sla.waiting')}: ${rel}`}
    >
      <User size={12} color={color} />
      <Text style={[styles.text, { color }]} numberOfLines={1}>
        {rel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  text: {
    fontSize: 11,
    fontWeight: '500',
  },
});
