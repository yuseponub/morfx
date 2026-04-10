/**
 * Bottom sheet listing all workspaces the user belongs to.
 *
 * Highlights the current workspace. Tapping a row calls setWorkspaceId()
 * from WorkspaceContext and dismisses the sheet. The parent layout uses
 * workspaceId as a React key so the tab tree remounts with clean state.
 */

import { forwardRef, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/lib/theme';
import { useWorkspace } from '@/lib/workspace/use-workspace';

export const WorkspaceSwitcherSheet = forwardRef<BottomSheetModal>(
  function WorkspaceSwitcherSheet(_props, ref) {
    const workspace = useWorkspace();
    const memberships = workspace?.memberships ?? [];
    const workspaceId = workspace?.workspaceId;
    const setWorkspaceId = workspace?.setWorkspaceId;
    const { colors, theme } = useTheme();
    const { t } = useTranslation();

    const snapPoints = useMemo(() => ['40%'], []);

    const handleSelect = useCallback(
      async (id: string) => {
        await setWorkspaceId?.(id);
        if (ref && 'current' in ref) {
          ref.current?.dismiss();
        }
      },
      [setWorkspaceId, ref]
    );

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.5}
        />
      ),
      []
    );

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={snapPoints}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.textMuted }}
      >
        <BottomSheetView style={styles.content}>
          <Text style={[styles.title, { color: colors.text }]}>
            {t('workspace.switcher.title')}
          </Text>

          {memberships.map((m) => {
            const isCurrent = m.id === workspaceId;
            return (
              <Pressable
                key={m.id}
                onPress={() => void handleSelect(m.id)}
                style={({ pressed }) => [
                  styles.row,
                  {
                    backgroundColor: isCurrent
                      ? theme === 'dark'
                        ? colors.surfaceAlt
                        : colors.surfaceAlt
                      : 'transparent',
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <View style={styles.rowContent}>
                  <Text
                    style={[
                      styles.rowName,
                      {
                        color: colors.text,
                        fontWeight: isCurrent ? '600' : '400',
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {m.name}
                  </Text>
                  {isCurrent && (
                    <Check size={18} color={colors.primary} />
                  )}
                </View>
              </Pressable>
            );
          })}
        </BottomSheetView>
      </BottomSheetModal>
    );
  }
);

const styles = StyleSheet.create({
  content: {
    padding: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  row: {
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  rowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowName: {
    fontSize: 16,
    flex: 1,
  },
});
