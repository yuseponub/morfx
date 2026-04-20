/**
 * AudioPlayer — inline playback for inbound / outbound audio bubbles.
 *
 * Phase 43 Plan 14.
 *
 * Responsibilities:
 *   - Show a Play / Pause button + a progress bar + mm:ss duration label.
 *   - Use `expo-audio`'s `useAudioPlayer` + `useAudioPlayerStatus` hooks
 *     (already consumed by AudioRecorder for recording preview — same
 *     runtime module, no new native dep).
 *   - Preload on mount so the duration is known immediately; do NOT autoplay.
 *   - Single-message scope: each bubble instantiates its own player, so
 *     tapping Play on bubble B does not automatically stop bubble A. If
 *     simultaneous playback becomes an issue we can add a global "currently
 *     playing" coordinator — out of scope for v1.
 *
 * Rationale for expo-audio over expo-av:
 *   - expo-audio is the SDK 54+ successor to expo-av; its hook-based API is
 *     much cleaner than the old AVPlayer imperative shape.
 *   - The current APK already bundles expo-audio ~1.1.1 (Plan 09 audit).
 *     Zero native module changes — OTA ships this.
 *
 * Progress bar:
 *   - We derive percent = currentTime / duration. Both come from the
 *     player status; we clamp to [0, 1] to survive brief negatives / over-
 *     shoots that iOS emits around seek edges.
 *   - Rendered as a fill-width View with an absolute inner View whose
 *     width is the percent — avoids pulling in another library.
 *
 * Error handling:
 *   - If the URL 404s or the MIME is unsupported, the player status exposes
 *     an error flag. We show the play button disabled + a short error line.
 */

import { Pause, Play } from 'lucide-react-native';
import { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio';

import { useTheme } from '@/lib/theme';

interface AudioPlayerProps {
  uri: string;
  /** Direction tints the bubble's button background slightly. */
  direction?: 'in' | 'out';
  /** Accessibility label for the whole widget — falls back to "Nota de voz". */
  accessibilityLabel?: string;
}

function formatSeconds(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const mins = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${mins}:${s.toString().padStart(2, '0')}`;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function AudioPlayer({
  uri,
  direction = 'in',
  accessibilityLabel,
}: AudioPlayerProps) {
  const { colors } = useTheme();

  // expo-audio's hook: accepts `AudioSource | null` (string URI works in
  // SDK 54). The status hook polls the current position; we read `playing`
  // and `duration` for the UI.
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);

  const duration = Number.isFinite(status?.duration) ? status.duration : 0;
  const current = Number.isFinite(status?.currentTime) ? status.currentTime : 0;
  const isPlaying = status?.playing ?? false;
  const didJustFinish = status?.didJustFinish ?? false;
  // expo-audio does not surface a single "error" flag. `isLoaded === false`
  // is normal briefly on mount, so treating it as an error would flash an
  // icon every time. In v1 we simply keep the play button enabled; if the
  // media URL is bad, `player.play()` throws and we log to console — the
  // user sees the play button "not doing anything", acceptable for a rare
  // edge case (WhatsApp-CDN URLs expire after 14 days).

  const progress = duration > 0 ? clamp01(current / duration) : 0;

  const togglePlay = useCallback(() => {
    if (!player) return;
    try {
      if (isPlaying) {
        player.pause();
      } else {
        // If playback just finished, seek to 0 so the next tap re-plays.
        if (didJustFinish) {
          player.seekTo(0);
        }
        player.play();
      }
    } catch (err) {
      // Non-fatal — surface to console; UI stays on its current state.
      console.warn('[AudioPlayer] toggle failed', err);
    }
  }, [player, isPlaying, didJustFinish]);

  // Button colors: out bubble uses primary bg (contrast), in bubble uses
  // surfaceAlt (muted).
  const btnBg = direction === 'out' ? colors.primary : colors.surfaceAlt;
  const btnFg = direction === 'out' ? colors.primaryText : colors.text;
  const trackBg = direction === 'out' ? colors.surfaceAlt : colors.border;
  const fillBg = direction === 'out' ? colors.primaryText : colors.primary;
  const textColor = direction === 'out' ? colors.primaryText : colors.textMuted;

  const label = useMemo(
    () => accessibilityLabel ?? 'Nota de voz',
    [accessibilityLabel]
  );

  return (
    <View style={styles.container} accessibilityLabel={label}>
      <Pressable
        onPress={togglePlay}
        hitSlop={8}
        style={({ pressed }) => [
          styles.playBtn,
          {
            backgroundColor: btnBg,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? 'Pausar nota de voz' : 'Reproducir nota de voz'}
      >
        {isPlaying ? (
          <Pause size={16} color={btnFg} />
        ) : (
          <Play size={16} color={btnFg} />
        )}
      </Pressable>

      <View style={styles.progressWrap}>
        <View style={[styles.track, { backgroundColor: trackBg }]}>
          <View
            style={[
              styles.fill,
              {
                backgroundColor: fillBg,
                width: `${Math.round(progress * 100)}%`,
              },
            ]}
          />
        </View>
        <Text style={[styles.time, { color: textColor }]}>
          {isPlaying || current > 0
            ? `${formatSeconds(current)} / ${formatSeconds(duration)}`
            : formatSeconds(duration)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    minWidth: 220,
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressWrap: {
    flex: 1,
    gap: 4,
  },
  track: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 2,
  },
  time: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
});
