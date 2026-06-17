import { Context } from 'telegraf';
import axios from 'axios';
import { VoiceService } from '../../services/voice';
import { NLPService } from '../../services/nlp';
import { OwnerService } from '../../services/owner';
import { autoProcessNlp, askConfirmNlp, askClarifyNlp } from './textMessage';
import { logger } from '../../utils/logger';

/**
 * Handler untuk pesan suara (voice message) di Telegram.
 *
 * Alur:
 *   1. Download file OGG/opus dari Telegram
 *   2. Transkripsi via Groq Whisper (VoiceService)
 *   3. Kirim teks transkripsi ke user sebagai konfirmasi
 *   4. Parse transkripsi via NLP pipeline
 *   5. Routing berdasarkan confidence (sama seperti text handler)
 */
export async function voiceMessageHandler(ctx: Context) {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const owner = await OwnerService.getOwner(telegramId);
  if (!owner) {
    await ctx.reply('Silakan jalankan /start terlebih dahulu untuk menyiapkan akun Anda.');
    return;
  }

  // Ambil voice message dari update
  const voice = ctx.message && ('voice' in ctx.message) ? ctx.message.voice : undefined;
  if (!voice) return;

  const fileId = voice.file_id;

  const statusMsg = await ctx.reply('🎤 Sedang memproses pesan suara Anda...', {
    reply_to_message_id: ctx.message!.message_id,
  } as any);

  try {
    // Tampilkan status typing saat memproses
    await ctx.sendChatAction('typing');

    // Download file OGG dari Telegram
    const fileLink = await ctx.telegram.getFileLink(fileId);
    const response = await axios.get(fileLink.toString(), { responseType: 'arraybuffer' });
    const audioBuffer = Buffer.from(response.data);

    // Transkripsi via Groq Whisper
    const transcript = await VoiceService.transcribe(audioBuffer, 'voice.ogg');

    if (!transcript) {
      await ctx.telegram.deleteMessage(ctx.chat!.id, statusMsg.message_id).catch(() => {});
      await ctx.reply(
        '❌ Tidak dapat mengenali teks dari pesan suara Anda.\nSilakan coba lagi atau ketik langsung pesan Anda.',
        { reply_to_message_id: ctx.message!.message_id } as any,
      );
      return;
    }

    // Tampilkan transkripsi ke user agar bisa memverifikasi
    await ctx.telegram.deleteMessage(ctx.chat!.id, statusMsg.message_id).catch(() => {});
    await ctx.reply(`🎤 Saya mendengar: _"${transcript}"_`, {
      parse_mode: 'Markdown',
      reply_to_message_id: ctx.message!.message_id,
    } as any);

    // Parse transkripsi via NLP
    const parsed = await NLPService.parse(transcript, owner.currency, owner.timezone);

    if (!parsed) {
      await ctx.reply(
        '💡 Pesan suara Anda berhasil ditranskripsi, tetapi tidak terdeteksi sebagai transaksi keuangan.\n' +
        'Coba ucapkan seperti "beli kopi 25 ribu" atau gunakan /add untuk mencatat secara manual.',
      );
      return;
    }

    // Sertakan voice_transcript di metadata
    const parsedWithVoice = {
      ...parsed,
      voice_transcript: transcript,
    };

    // Routing confidence-based (sama seperti text & photo handler)
    if (parsed.confidence >= 0.85) {
      await autoProcessNlp(ctx, parsedWithVoice, owner.currency);
    } else if (parsed.confidence >= 0.60) {
      await askConfirmNlp(ctx, parsedWithVoice, owner.currency);
    } else {
      await askClarifyNlp(ctx, parsedWithVoice);
    }
  } catch (err) {
    logger.error({ err }, 'Error in voiceMessageHandler');
    await ctx.telegram.deleteMessage(ctx.chat!.id, statusMsg.message_id).catch(() => {});
    await ctx.reply(
      '❌ Terjadi kesalahan saat memproses pesan suara Anda. Silakan gunakan perintah /add untuk mencatat secara manual.',
      { reply_to_message_id: ctx.message!.message_id } as any,
    );
  }
}
