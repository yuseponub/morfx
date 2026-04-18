/**
 * Unread counter pill. Caps at 99+ to match the web (inbox card).
 * Hides itself when count is 0 so callers don't need a conditional.
 *
 * All colors via useTheme() (dark mode mandatory — CLAUDE.md).
 */

import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/lib/theme';

interface UnreadBadgeProps {
  count: number;
}

export function UnreadBadge({ count }: UnreadBadgeProps) {
  const { colors } = useTheme();

  if (!count || count <= 0) return null;

  const label = count > 99 ? '99+' : String(count);

  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: colors.primary },
      ]}
      accessibilityLabel={`${count} mensajes sin leer`}
    >
      <Text style={[styles.text, { color: colors.primaryText }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
});
