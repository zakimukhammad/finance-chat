import Groq from 'groq-sdk';
import { logger } from '../utils/logger';

let groqClient: Groq | null = null;

function getClient(): Groq {
  if (groqClient) return groqClient;
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('Missing GROQ_API_KEY');
  groqClient = new Groq({ apiKey: key });
  return groqClient;
}

/**
 * VoiceService — Mengubah pesan suara menjadi teks menggunakan Groq Whisper v3.
 *
 * Alur:
 *   1. Terima buffer audio OGG/opus dari Telegram
 *   2. Kirim ke Groq Whisper API
 *   3. Kembalikan teks transkripsi
 */
export class VoiceService {
  /**
   * Transkripsi buffer audio menjadi teks menggunakan Groq Whisper.
   *
   * @param audioBuffer - Buffer berisi data audio (OGG/opus)
   * @param filename    - Nama file yang dikirim ke API (default: 'voice.ogg')
   * @returns Teks hasil transkripsi, atau null jika gagal
   */
  static async transcribe(
    audioBuffer: Buffer,
    filename: string = 'voice.ogg',
  ): Promise<string | null> {
    try {
      const client = getClient();

      // Groq SDK menerima File object untuk upload audio
      const file = new File([audioBuffer], filename, { type: 'audio/ogg' });

      const transcription = await client.audio.transcriptions.create({
        file,
        model: 'whisper-large-v3',
        // Biarkan Whisper auto-detect bahasa (mendukung EN & ID)
      });

      const text = transcription.text?.trim();

      if (!text) {
        logger.warn('Whisper transcription returned empty text');
        return null;
      }

      logger.info({ textLength: text.length }, 'Voice transcription successful');
      return text;
    } catch (err) {
      logger.error({ err }, 'Voice transcription failed');
      return null;
    }
  }
}
