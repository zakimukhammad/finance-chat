import { Context } from 'telegraf';
import axios from 'axios';
import { ReceiptService } from '../../services/receipt';
import { OwnerService } from '../../services/owner';
import { autoProcessNlp, askConfirmNlp, askClarifyNlp } from './textMessage';
import { logger } from '../../utils/logger';

export async function photoMessageHandler(ctx: Context) {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const owner = await OwnerService.getOwner(telegramId);
  if (!owner) {
    await ctx.reply('Silakan jalankan /start terlebih dahulu untuk menyiapkan akun Anda.');
    return;
  }

  const photos = ctx.message && ('photo' in ctx.message) ? ctx.message.photo : undefined;
  if (!photos || photos.length === 0) return;

  // Get the largest photo
  const largestPhoto = photos[photos.length - 1];
  const fileId = largestPhoto.file_id;

  const statusMsg = await ctx.reply('🔍 Sedang memindai foto tanda terima Anda...', {
    reply_to_message_id: ctx.message!.message_id
  } as any);

  try {
    // Show typing status while processing
    await ctx.sendChatAction('upload_document');

    const fileLink = await ctx.telegram.getFileLink(fileId);
    
    // Download the photo as a buffer using axios
    const response = await axios.get(fileLink.toString(), { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);

    // Call ReceiptService to parse
    const parsed = await ReceiptService.parseReceipt(
      buffer,
      'image/jpeg',
      owner.currency,
      owner.timezone
    );

    // Remove status message
    await ctx.telegram.deleteMessage(ctx.chat!.id, statusMsg.message_id).catch(() => {});

    if (!parsed) {
      await ctx.reply(
        '❌ Tidak dapat mendeteksi detail transaksi dari foto tanda terima ini.\nSilakan coba lagi atau gunakan perintah /add untuk mencatat secara manual.',
        { reply_to_message_id: ctx.message!.message_id } as any
      );
      return;
    }

    // Attach the photo URL so it gets saved to metadata
    const parsedWithPhoto = {
      ...parsed,
      photo_url: fileLink.toString(),
    };

    // Route through confidence-based flows:
    if (parsed.confidence >= 0.85) {
      await autoProcessNlp(ctx, parsedWithPhoto, owner.currency);
    } else if (parsed.confidence >= 0.60) {
      await askConfirmNlp(ctx, parsedWithPhoto, owner.currency);
    } else {
      await askClarifyNlp(ctx, parsedWithPhoto);
    }

  } catch (err) {
    logger.error({ err }, 'Error in photoMessageHandler');
    await ctx.telegram.deleteMessage(ctx.chat!.id, statusMsg.message_id).catch(() => {});
    await ctx.reply(
      '❌ Terjadi kesalahan saat memproses foto tanda terima Anda. Silakan gunakan perintah /add untuk mencatat secara manual.',
      { reply_to_message_id: ctx.message!.message_id } as any
    );
  }
}
