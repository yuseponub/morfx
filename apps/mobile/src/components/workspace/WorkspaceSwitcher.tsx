/**
 * Workspace switcher button — shows the current workspace name + chevron.
 *
 * Tapping opens the WorkspaceSwitcherSheet bottom sheet. Designed to sit
 * in the inbox header or tab bar header area.
 */

import { ChevronDown } from 'lucide-react-native';
import { useCallback, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useTheme } from '@/lib/theme';
import { useWorkspace } from '@/lib/workspace/use-workspace';
import { WorkspaceSwitcherSheet } from './WorkspaceSwitcherSheet';

export function WorkspaceSwitcher() {
  const workspace = useWorkspace();
  const { colors } = useTheme();
  const sheetRef = useRef<BottomSheetModal>(null);

  const handleOpen = useCallback(() => {
    sheetRef.current?.present();
  }, []);

  if (!workspace || workspace.isLoading) return null;

  // Debug: show error if workspace fetch failed
  if ((workspace as any).error) {
    return (
      <View>
        <Text style={{ color: 'red', fontSize: 12 }}>
          WS Error: {(workspace as any).error}
        </Text>
      </View>
    );
  }

  const { workspaceName } = workspace;

  return (
    <View>
      <Pressable
        onPress={handleOpen}
        style={({ pressed }) => [
          styles.button,
          { opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Text
          style={[styles.name, { color: colors.text }]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {workspaceName ?? '---'}
        </Text>
        <ChevronDown size={16} color={colors.textMuted} />
      </Pressable>

      <WorkspaceSwitcherSheet ref={sheetRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  name: {
    fontSize: 17,
    fontWeight: '600',
    maxWidth: 200,
  },
});
