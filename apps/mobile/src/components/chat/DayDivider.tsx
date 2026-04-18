/**
 * DayDivider — centered pill marking a date boundary between messages.
 *
 * Phase 43 Plan 08.
 *
 * Label logic:
 *   - Today in Bogota timezone         -> "Hoy"
 *   - Yesterday in Bogota timezone     -> "Ayer"
 *   - Otherwise                        -> "lunes 14 abr" (Spanish locale)
 *
 * Colors come from useTheme() so the pill is readable in both light and
 * dark themes (no hardcoded hex values).
 */

import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/lib/theme';
import { useTranslation } from '@/lib/i18n';

interface DayDividerProps {
  /** ms epoch of the day the divider represents (the message's createdAt). */
  dayMs: number;
}

// Colombia observes no DST; America/Bogota == UTC-5 year round. Compute the
// "calendar day" via a locale-aware formatter so behavior stays correct if
// that ever changes.
function toBogotaDateKey(ms: number): string {
  // YYYY-MM-DD in Bogota
  return new Date(ms).toLocaleDateString('en-CA', {
    timeZone: 'America/Bogota',
  });
}

export function DayDivider({ dayMs }: DayDividerProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const label = useMemo(() => {
    const today = Date.now();
    const yesterday = today - 24 * 60 * 60 * 1000;
    const dayKey = toBogotaDateKey(dayMs);
    if (dayKey === toBogotaDateKey(today)) return t('chat.today');
    if (dayKey === toBogotaDateKey(yesterday)) return t('chat.yesterday');
    // Fall back to "lunes 14 abr" — matches the plan's requested shape.
    return format(new Date(dayMs), 'EEEE d MMM', { locale: es });
  }, [dayMs, t]);

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.pill,
          { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
  },
});
