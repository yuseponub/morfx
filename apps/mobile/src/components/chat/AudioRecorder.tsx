/**
 * AudioRecorder — WhatsApp-style press-and-hold mic button with preview.
 *
 * Phase 43 Plan 09.
 *
 * Interaction model:
 *   - Tap the mic icon -> open the recording sheet at small snap.
 *   - In the sheet, tap "Grabar" to start recording (one-tap, not
 *     long-press — press-and-hold is unreliable across Android OEM gesture
 *     systems that intercept long-press for selection / accessibility).
 *   - Tap "Detener" to stop. The sheet stays open with a Play preview and
 *     Send / Cancel buttons.
 *   - "Enviar" invokes `onSend(uri, mimeType, duration)` and closes.
 *   - "Cancelar" discards the recording and closes.
 *
 * Permissions: handled inline via requestRecordingPermissionsAsync. If
 * denied we surface the Spanish copy and close the sheet — the user can
 * re-enable in OS settings.
 *
 * Audio format: expo-audio's HIGH_QUALITY preset produces m4a (AAC in MP4
 * container) on both platforms. This is WhatsApp-compatible out of the
 * box. Mime type handed to the send flow is 'audio/m4a'.
 */

import BottomSheet, {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import {
  requestRecordingPermissionsAsync,
  RecordingPresets,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { Mic, Play, Pause, Send, Square, Trash2 } from 'lucide-react-native';
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/lib/theme';
import { useTranslation } from '@/lib/i18n';

export type AudioSendHandler = (args: {
  uri: string;
  mimeType: string;
  durationSeconds: number;
}) => void | Promise<void>;

export interface AudioRecorderHandle {
  open: () => void;
  close: () => void;
}

interface AudioRecorderProps {
  onSend: AudioSendHandler;
}

function formatSeconds(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const mins = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${mins}:${s.toString().padStart(2, '0')}`;
}

export const AudioRecorder = forwardRef<AudioRecorderHandle, AudioRecorderProps>(
  function AudioRecorder({ onSend }, ref) {
    const { colors } = useTheme();
    const { t } = useTranslation();
    const sheetRef = useRef<BottomSheet>(null);

    const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
    const recorderState = useAudioRecorderState(recorder);

    const [finishedUri, setFinishedUri] = useState<string | null>(null);
    const [finishedDuration, setFinishedDuration] = useState<number>(0);
    const [error, setError] = useState<string | null>(null);

    // Use a player ONLY for the preview playback AFTER recording finishes.
    const player = useAudioPlayer(finishedUri ?? null);
    const playerStatus = useAudioPlayerStatus(player);

    const snapPoints = useMemo(() => ['35%'], []);

    const reset = useCallback(() => {
      setFinishedUri(null);
      setFinishedDuration(0);
      setError(null);
    }, []);

    const open = useCallback(() => {
      reset();
      sheetRef.current?.expand();
    }, [reset]);

    const close = useCallback(() => {
      sheetRef.current?.close();
    }, []);

    useImperativeHandle(ref, () => ({ open, close }), [open, close]);

    const startRecording = useCallback(async () => {
      setError(null);
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setError(t('chat.audio.permissionDenied'));
        return;
      }
      try {
        await recorder.prepareToRecordAsync();
        recorder.record();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al iniciar grabación');
      }
    }, [recorder, t]);

    const stopRecording = useCallback(async () => {
      try {
        await recorder.stop();
        // After stop(), recorder.uri points at the recorded file. We copy
        // the duration off recorderState now (it stops updating after).
        const uri = recorder.uri;
        if (!uri) {
          setError('No se generó archivo de audio');
          return;
        }
        setFinishedUri(uri);
        setFinishedDuration(recorderState.durationMillis / 1000);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al detener');
      }
    }, [recorder, recorderState.durationMillis]);

    const handleSend = useCallback(async () => {
      if (!finishedUri) return;
      try {
        await onSend({
          uri: finishedUri,
          mimeType: 'audio/m4a',
          durationSeconds: finishedDuration,
        });
        reset();
        sheetRef.current?.close();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al enviar');
      }
    }, [finishedUri, finishedDuration, onSend, reset]);

    const handleCancel = useCallback(() => {
      reset();
      sheetRef.current?.close();
    }, [reset]);

    const handlePreviewToggle = useCallback(() => {
      if (!finishedUri) return;
      if (playerStatus.playing) {
        player.pause();
      } else {
        player.play();
      }
    }, [finishedUri, playerStatus.playing, player]);

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          pressBehavior="close"
        />
      ),
      []
    );

    const isRecording = recorderState.isRecording;
    const displayDuration = isRecording
      ? recorderState.durationMillis / 1000
      : finishedDuration;

    return (
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.bg }}
        handleIndicatorStyle={{ backgroundColor: colors.border }}
      >
        <View style={styles.container}>
          <Text style={[styles.title, { color: colors.text }]}>
            {t('chat.audio.title')}
          </Text>

          <View style={styles.waveRow}>
            <Mic
              size={28}
              color={isRecording ? colors.danger : colors.textMuted}
            />
            <Text style={[styles.duration, { color: colors.text }]}>
              {formatSeconds(displayDuration)}
            </Text>
          </View>

          {error ? (
            <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
          ) : null}

          <View style={styles.buttonRow}>
            {!finishedUri && !isRecording ? (
              <Pressable
                onPress={startRecording}
                style={({ pressed }) => [
                  styles.primaryButton,
                  {
                    backgroundColor: colors.primary,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
                accessibilityRole="button"
              >
                <Mic size={18} color={colors.primaryText} />
                <Text style={[styles.primaryLabel, { color: colors.primaryText }]}>
                  {t('chat.audio.start')}
                </Text>
              </Pressable>
            ) : null}

            {isRecording ? (
              <Pressable
                onPress={stopRecording}
                style={({ pressed }) => [
                  styles.primaryButton,
                  {
                    backgroundColor: colors.danger,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
                accessibilityRole="button"
              >
                <Square size={18} color="#fff" />
                <Text style={[styles.primaryLabel, { color: '#fff' }]}>
                  {t('chat.audio.stop')}
                </Text>
              </Pressable>
            ) : null}

            {finishedUri && !isRecording ? (
              <>
                <Pressable
                  onPress={handlePreviewToggle}
                  style={({ pressed }) => [
                    styles.iconButton,
                    {
                      backgroundColor: colors.surfaceAlt,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                  accessibilityLabel={t('chat.audio.preview')}
                >
                  {playerStatus.playing ? (
                    <Pause size={18} color={colors.text} />
                  ) : (
                    <Play size={18} color={colors.text} />
                  )}
                </Pressable>
                <Pressable
                  onPress={handleCancel}
                  style={({ pressed }) => [
                    styles.iconButton,
                    {
                      backgroundColor: colors.surfaceAlt,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                  accessibilityLabel={t('chat.audio.cancel')}
                >
                  <Trash2 size={18} color={colors.danger} />
                </Pressable>
                <Pressable
                  onPress={handleSend}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    {
                      backgroundColor: colors.primary,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                >
                  <Send size={18} color={colors.primaryText} />
                  <Text
                    style={[styles.primaryLabel, { color: colors.primaryText }]}
                  >
                    {t('chat.audio.send')}
                  </Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </View>
      </BottomSheet>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    gap: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  waveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  duration: {
    fontSize: 22,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    flex: 1,
  },
  primaryLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    fontSize: 13,
  },
});
