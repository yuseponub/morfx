/**
 * Media upload helper for the mobile composer.
 *
 * Flow:
 *   1. Caller has a local file URI (from expo-image-picker or expo-audio).
 *   2. We POST `{ mimeType, byteSize }` to
 *      /api/mobile/conversations/:id/media/upload and get back a presigned
 *      PUT URL + the opaque `mediaKey` that the server will reference when
 *      the mobile send flow POSTs the actual message.
 *   3. We PUT the raw bytes to that URL via expo-file-system's
 *      `uploadAsync` — streaming from disk, no base64 round-trip.
 *   4. Return the `mediaKey` so the outbox drain can proceed to the send
 *      endpoint.
 *
 * On network failure at any step we throw. The outbox drain catches and
 * schedules a retry (attempts++, keep the row, wait for the next trigger).
 *
 * Why `expo-file-system/legacy`: SDK 54 ships expo-file-system 19 whose
 * default export is the new Paths/File/Directory class API. The legacy
 * subpath preserves `uploadAsync` + `getInfoAsync` — exactly what we need
 * here — and is still in the Expo Go prebuilt set. Migrating to the class
 * API is future work; the legacy subpath is NOT deprecated for new code,
 * it's the transition surface.
 *
 * Reasons this file lives in apps/mobile/ and not shared/: Metro cannot
 * resolve imports outside apps/mobile/. The API contract types (Zod
 * schemas) are mirrored in apps/mobile/src/lib/api-schemas/messages.ts to
 * stay inside the Metro sandbox.
 */

import {
  FileSystemUploadType,
  getInfoAsync,
  uploadAsync,
} from 'expo-file-system/legacy';

import { mobileApi } from '../api-client';
import {
  MediaUploadResponseSchema,
  type MediaUploadResponse,
} from '../api-schemas/messages';

export interface UploadLocalFileResult {
  mediaKey: string;
  publicUrl: string;
}

async function resolveByteSize(uri: string): Promise<number> {
  const info = await getInfoAsync(uri);
  if (!info.exists) {
    throw new Error(`Archivo no encontrado: ${uri}`);
  }
  const size = (info as { size?: number }).size;
  if (typeof size !== 'number' || size <= 0) {
    throw new Error(`Archivo vacio o tamano invalido: ${uri}`);
  }
  return size;
}

/**
 * Uploads a local file to Supabase Storage via a server-issued presigned
 * PUT URL. Returns the `mediaKey` to pass into the send endpoint.
 */
export async function uploadLocalFile(
  conversationId: string,
  uri: string,
  mimeType: string
): Promise<UploadLocalFileResult> {
  if (!conversationId) throw new Error('conversationId requerido');
  if (!uri) throw new Error('uri requerido');
  if (!mimeType) throw new Error('mimeType requerido');

  const byteSize = await resolveByteSize(uri);

  // 1. Ask the server for a presigned URL + mediaKey.
  const rawSignResp = await mobileApi.post<unknown>(
    `/api/mobile/conversations/${encodeURIComponent(conversationId)}/media/upload`,
    { mimeType, byteSize }
  );

  let signed: MediaUploadResponse;
  try {
    signed = MediaUploadResponseSchema.parse(rawSignResp);
  } catch (err) {
    throw new Error(
      `Respuesta de upload invalida: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // 2. PUT the file bytes to the signed URL. The legacy uploadAsync handles
  //    streaming from the sandbox — no base64 round-trip even for large
  //    images, which matters because 16 MB in JS memory stalls RN.
  const uploadResult = await uploadAsync(signed.uploadUrl, uri, {
    httpMethod: 'PUT',
    uploadType: FileSystemUploadType.BINARY_CONTENT,
    headers: {
      'Content-Type': mimeType,
      // Supabase storage accepts bare PUT + Content-Type; no extra auth
      // header needed because the URL is already signed.
    },
  });

  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    throw new Error(
      `Upload fallo (${uploadResult.status}): ${uploadResult.body?.slice(0, 200) ?? 'sin detalle'}`
    );
  }

  return {
    mediaKey: signed.mediaKey,
    publicUrl: signed.publicUrl,
  };
}
