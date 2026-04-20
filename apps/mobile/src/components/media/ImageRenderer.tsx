/**
 * ImageRenderer — inbound / outbound image bubble renderer.
 *
 * Phase 43 Plan 14.
 *
 * Responsibilities:
 *   - Render a remote image at a fixed max width inside the message bubble
 *     using `expo-image` (memory+disk cache, smarter than RN's built-in
 *     <Image />).
 *   - Tap opens a fullscreen Modal with the image centered on a near-black
 *     backdrop. Tap anywhere on the Modal closes.
 *   - Pinch-to-zoom is NOT wired in this plan (see plan text — "pinch-to-zoom
 *     optional — use PinchGestureHandler if trivial, else skip"). A future
 *     plan can layer it on @react-native-gesture-handler + Reanimated
 *     without changing this component's public API.
 *
 * Rationale for expo-image:
 *   - `expo-image ~3.0.11` is already in the current APK bundle (Plan 09
 *     audited it via `npx expo install`), so this component adds ZERO native
 *     deps. OTA is enough to ship.
 *   - Disk caching reduces data use on repeat views — chat screens are
 *     revisited often and the same image appears in the bubble + the
 *     fullscreen view.
 *
 * Dark mode: the fullscreen backdrop uses a fixed near-black regardless of
 * theme because it must always contrast with the image content. The bubble
 * placeholder (shown while loading) uses useTheme() colors.
 */

import { Image } from 'expo-image';
import { ZoomIn } from 'lucide-react-native';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/lib/theme';

interface ImageRendererProps {
  uri: string;
  /** Accessibility label (e.g. caption text or a Spanish fallback). */
  accessibilityLabel?: string;
}

// Thumbnail max dimensions inside a bubble. Kept conservative so a typical
// screen width renders the bubble + image without overflow.
const THUMB_MAX_WIDTH = 240;
const THUMB_HEIGHT = 180;

export function ImageRenderer({ uri, accessibilityLabel }: ImageRendererProps) {
  const { colors } = useTheme();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [open, setOpen] = useState<boolean>(false);

  // Fullscreen image honors aspect ratio via contentFit="contain" and takes
  // the full viewport minus safe-area.
  const fullW = screenWidth;
  const fullH = screenHeight;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="imagebutton"
        accessibilityLabel={accessibilityLabel ?? 'Imagen'}
        style={({ pressed }) => [
          styles.thumbContainer,
          {
            backgroundColor: colors.surfaceAlt,
            borderColor: colors.border,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <Image
          source={{ uri }}
          style={styles.thumbImage}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={150}
        />
        {/* Subtle zoom affordance in the corner to hint tap-to-expand. */}
        <View
          style={[
            styles.zoomBadge,
            { backgroundColor: 'rgba(0,0,0,0.45)' },
          ]}
        >
          <ZoomIn size={12} color="#ffffff" />
        </View>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          onPress={() => setOpen(false)}
          style={styles.modalRoot}
          accessibilityRole="button"
          accessibilityLabel="Cerrar imagen"
        >
          <SafeAreaView
            edges={['top', 'bottom', 'left', 'right']}
            style={styles.modalSafe}
          >
            <Image
              source={{ uri }}
              style={{ width: fullW, height: fullH }}
              contentFit="contain"
              cachePolicy="memory-disk"
              transition={150}
              accessibilityLabel={accessibilityLabel ?? 'Imagen'}
            />
          </SafeAreaView>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  thumbContainer: {
    width: THUMB_MAX_WIDTH,
    height: THUMB_HEIGHT,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  zoomBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6,
  },
  modalRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSafe: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
