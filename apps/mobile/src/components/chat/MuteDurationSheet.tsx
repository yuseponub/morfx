/**
 * MuteDurationSheet — bottom-sheet-style picker for "mute bot for duration".
 *
 * Phase 43 Plan 11. Rendered from ChatHeader / BotToggle.
 *
 * Options (all Bogota-time aware per CLAUDE.md Regla 2):
 *   - 30 min
 *   - 1 hora
 *   - 2 horas
 *   - Hasta el final del día  (today 23:59:59 in America/Bogota, converted
 *     to UTC before being sent to the server)
 *
 * Implementation: a transparent Modal with a bottom-anchored sheet. Tap on
 * the backdrop or on Cancelar dismisses without firing a change. Matches
 * the visual style of the CRM drawer (ContactPanelDrawer) so the two
 * overlays feel like one family.
 *
 * We do NOT pull in @gorhom/bottom-sheet for this — the library is
 * installed (used/reserved by Plan 10b plumbing) but not required for a
 * four-option picker. A plain Modal is simpler, has zero gesture surface
 * to collide with MessageList scroll, and keeps the bundle lean.
 */

import { X as XIcon } from 'lucide-react-native';
import { useMemo } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/lib/theme';
import { useTranslation } from '@/lib/i18n';

const BOGOTA_TZ = 'America/Bogota';

/**
 * Compute "end of day" in Bogota timezone and return the equivalent UTC
 * epoch ms. Strategy:
 *   1. Ask `Intl.DateTimeFormat` for the current y/m/d in Bogota.
 *   2. Build an ISO string of `YYYY-MM-DDT23:59:59-05:00` (Bogota is UTC-5,
 *      no DST — stable anchor; see tz database `America/Bogota`).
 *   3. `Date.parse()` yields the correct UTC epoch ms.
 *
 * We avoid `toLocaleString` roundtrips (fragile across JS engines). The
 * offset -05:00 is hardcoded because Colombia does not observe DST — the
 * tz database has `America/Bogota` at a permanent -05:00.
 */
export function endOfDayBogotaMs(): number {
  const nowInBogota = new Intl.DateTimeFormat('en-CA', {
    timeZone: BOGOTA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  // en-CA gives YYYY-MM-DD.
  return Date.parse(`${nowInBogota}T23:59:59-05:00`);
}

type OptionKey = '30m' | '1h' | '2h' | 'eod';

interface OptionDef {
  key: OptionKey;
  computeMs: () => number;
}

const OPTIONS: OptionDef[] = [
  { key: '30m', computeMs: () => Date.now() + 30 * 60 * 1000 },
  { key: '1h', computeMs: () => Date.now() + 60 * 60 * 1000 },
  { key: '2h', computeMs: () => Date.now() + 2 * 60 * 60 * 1000 },
  { key: 'eod', computeMs: () => endOfDayBogotaMs() },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  onPick: (muteUntilMs: number) => void;
}

export function MuteDurationSheet({ visible, onClose, onPick }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const labels = useMemo<Record<OptionKey, string>>(
    () => ({
      '30m': t('chat.bot.mute.30m'),
      '1h': t('chat.bot.mute.1h'),
      '2h': t('chat.bot.mute.2h'),
      eod: t('chat.bot.mute.eod'),
    }),
    [t]
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <SafeAreaView
          edges={['bottom', 'left', 'right']}
          style={[styles.sheet, { backgroundColor: colors.bg }]}
        >
          <View
            style={[styles.header, { borderBottomColor: colors.border }]}
          >
            <Text
              style={[styles.title, { color: colors.text }]}
              accessibilityRole="header"
            >
              {t('chat.bot.mute.title')}
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={({ pressed }) => [
                styles.closeBtn,
                { opacity: pressed ? 0.5 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
            >
              <XIcon size={20} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.options}>
            {OPTIONS.map((opt) => (
              <Pressable
                key={opt.key}
                onPress={() => {
                  onPick(opt.computeMs());
                }}
                style={({ pressed }) => [
                  styles.optionBtn,
                  {
                    backgroundColor: pressed
                      ? colors.surfaceAlt
                      : colors.surface,
                    borderColor: colors.border,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={labels[opt.key]}
              >
                <Text
                  style={[styles.optionText, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {labels[opt.key]}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.cancelBtn,
              {
                borderColor: colors.border,
                opacity: pressed ? 0.6 : 1,
              },
            ]}
            accessibilityRole="button"
          >
            <Text style={[styles.cancelText, { color: colors.text }]}>
              {t('common.cancel')}
            </Text>
          </Pressable>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#00000066',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  closeBtn: {
    padding: 4,
  },
  options: {
    gap: 8,
  },
  optionBtn: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  optionText: {
    fontSize: 15,
    fontWeight: '500',
  },
  cancelBtn: {
    marginTop: 4,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
