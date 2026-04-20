/**
 * ChatHeader — top bar for the chat detail screen.
 *
 * Phase 43 Plan 11. Layout:
 *   [ < back ]  [ Contact name (flex) ]  [ BotToggle ]  [ info drawer ]
 *
 * Extracts the inline header that lived in app/chat/[id].tsx (Plans 08/10b)
 * so Plan 11 can cleanly add the three-state BotToggle without re-fanning
 * the state layout across the screen file. The screen still owns the
 * useBotToggle() hook and the MuteDurationSheet visibility state — we
 * pass the resolved pieces in as props so this component stays presentational
 * and easy to verify in isolation.
 *
 * UX invariants kept from Plans 08/10b (MUST NOT regress):
 *   - Back button remains on the left with chevron + hitSlop 12.
 *   - Contact name is the flex-1 middle region, 17pt semibold.
 *   - Info drawer button remains the trailing icon so the Plan 10b drawer
 *     still has its established tap target.
 *
 * Dark mode: all colors via useTheme(). BotToggle has its own palette.
 */

import { ChevronLeft, Info } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/lib/theme';
import { useTranslation } from '@/lib/i18n';
import type { BotMode } from '@/hooks/useBotToggle';

import { BotToggle } from './BotToggle';

interface Props {
  title: string;
  onBack: () => void;
  onOpenDrawer: () => void;
  // BotToggle props (passed through from the hook)
  botMode: BotMode;
  botMuteUntilMs: number | null;
  botPending: boolean;
  onToggleOnOff: () => void;
  onOpenMuteSheet: () => void;
  onClearMute: () => void;
}

export function ChatHeader({
  title,
  onBack,
  onOpenDrawer,
  botMode,
  botMuteUntilMs,
  botPending,
  onToggleOnOff,
  onOpenMuteSheet,
  onClearMute,
}: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <View
      style={[
        styles.header,
        { borderBottomColor: colors.border, backgroundColor: colors.bg },
      ]}
    >
      <Pressable
        onPress={onBack}
        hitSlop={12}
        style={({ pressed }) => [
          styles.backButton,
          { opacity: pressed ? 0.5 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={t('chat.header.back')}
      >
        <ChevronLeft size={24} color={colors.text} />
      </Pressable>

      <Text
        style={[styles.title, { color: colors.text }]}
        numberOfLines={1}
        accessibilityRole="header"
      >
        {title}
      </Text>

      <BotToggle
        mode={botMode}
        muteUntilMs={botMuteUntilMs}
        pending={botPending}
        onToggleOnOff={onToggleOnOff}
        onOpenMuteSheet={onOpenMuteSheet}
        onClearMute={onClearMute}
      />

      <Pressable
        onPress={onOpenDrawer}
        hitSlop={12}
        style={({ pressed }) => [
          styles.infoButton,
          { opacity: pressed ? 0.5 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={t('crmPanel.open')}
      >
        <Info size={22} color={colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  backButton: {
    padding: 4,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
  },
  infoButton: {
    padding: 4,
  },
});
