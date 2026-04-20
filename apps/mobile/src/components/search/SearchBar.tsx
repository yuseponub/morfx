/**
 * SearchBar — the inbox header search input.
 *
 * Phase 43 Plan 12. Renders ABOVE the FlashList in
 * `apps/mobile/app/(tabs)/inbox.tsx`. Collapsed state is a single-row
 * TextInput with a magnifier icon; expanded state (non-empty query) shows
 * a full-width results list via FlashList rendered below.
 *
 * Rendering rules:
 *   - Always visible, below the header, above the inbox FlashList.
 *   - When `hasQuery` and `results.length > 0`: inbox FlashList hides,
 *     results FlashList takes the full body area.
 *   - When `hasQuery` but no results (and not loading): show empty state
 *     with the query echoed back ("No hay resultados para 'xyz'").
 *   - When query length < 2: show a small hint ("Escribe al menos 2 caracteres").
 *
 * All colors via useTheme, all strings via t(). No hardcoded colors.
 *
 * Accessibility:
 *   - TextInput has accessibilityLabel from the translated placeholder.
 *   - Clear button has its own accessibilityLabel so screen readers can
 *     distinguish it from the input itself.
 */

import { FlashList } from '@shopify/flash-list';
import { Search, X } from 'lucide-react-native';
import { ActivityIndicator, StyleSheet, Text, TextInput, View, Pressable } from 'react-native';

import { useTheme } from '@/lib/theme';
import { useTranslation } from '@/lib/i18n';
import { useMessageSearch } from '@/hooks/useMessageSearch';

import { SearchResultRow } from './SearchResultRow';

export interface SearchBarProps {
  /** Whether the search results area should render. If false, only the
   *  input itself shows — the inbox list stays visible below. The inbox
   *  screen wires this to `query.length >= 2`. */
  showResults: boolean;
  /** The hook's state is owned by the inbox screen (so it can swap out
   *  the FlashList when searching). We pass the bag-of-state through so
   *  this component renders but does not own lifecycle. */
  search: ReturnType<typeof useMessageSearch>;
}

export function SearchBar({ showResults, search }: SearchBarProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const { query, setQuery, results, loading, error, clear, hasQueried } = search;

  const showMinCharsHint = query.length > 0 && query.trim().length < 2;
  const showEmpty =
    showResults && hasQueried && !loading && results.length === 0;

  return (
    <View style={styles.container}>
      {/* Input row */}
      <View
        style={[
          styles.inputRow,
          {
            backgroundColor: colors.surfaceAlt,
            borderColor: colors.border,
          },
        ]}
      >
        <Search size={16} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('search.placeholder')}
          placeholderTextColor={colors.textMuted}
          style={[styles.input, { color: colors.text }]}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel={t('search.placeholder')}
        />
        {loading ? (
          <ActivityIndicator size="small" color={colors.textMuted} />
        ) : query.length > 0 ? (
          <Pressable
            onPress={clear}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
          >
            <X size={16} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {/* Min-chars hint (tiny, non-blocking) */}
      {showMinCharsHint && (
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          {t('search.min_chars')}
        </Text>
      )}

      {/* Results body — only rendered when showResults is true. The inbox
          screen controls when to show this vs. the inbox FlashList. */}
      {showResults && (
        <View style={styles.resultsBody}>
          {error ? (
            <View style={styles.centered}>
              <Text style={[styles.errorText, { color: colors.danger }]}>
                {error}
              </Text>
            </View>
          ) : showEmpty ? (
            <View style={styles.centered}>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                {t('search.no_results')}
              </Text>
            </View>
          ) : (
            <FlashList
              data={results}
              keyExtractor={(item, index) =>
                item.message_id ?? `${item.conversation_id}-${index}`
              }
              renderItem={({ item }) => (
                <SearchResultRow result={item} onAfterNavigate={clear} />
              )}
              keyboardShouldPersistTaps="handled"
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    height: 38,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  hint: {
    fontSize: 11,
    paddingHorizontal: 4,
  },
  resultsBody: {
    flex: 1,
    minHeight: 0, // allow FlashList to shrink inside the flex column
    marginTop: 4,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
  },
});
