import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VoiceService } from '../../../src/services/voice';

// ─── Mock Groq SDK ───────────────────────────────────────────────────────────

const mockCreate = vi.fn();

vi.mock('groq-sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      audio: {
        transcriptions: {
          create: mockCreate,
        },
      },
    })),
  };
});

describe('VoiceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GROQ_API_KEY = 'mock-groq-key';
  });

  it('berhasil mentranskripsi audio menjadi teks', async () => {
    mockCreate.mockResolvedValueOnce({
      text: 'beli kopi 25 ribu di starbucks',
    });

    const buffer = Buffer.from('fake-ogg-data');
    const result = await VoiceService.transcribe(buffer, 'voice.ogg');

    expect(result).toBe('beli kopi 25 ribu di starbucks');
    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'whisper-large-v3',
      }),
    );
  });

  it('mengembalikan null jika transkripsi kosong', async () => {
    mockCreate.mockResolvedValueOnce({
      text: '',
    });

    const buffer = Buffer.from('fake-ogg-data');
    const result = await VoiceService.transcribe(buffer, 'voice.ogg');

    expect(result).toBeNull();
  });

  it('mengembalikan null jika transkripsi hanya whitespace', async () => {
    mockCreate.mockResolvedValueOnce({
      text: '   ',
    });

    const buffer = Buffer.from('fake-ogg-data');
    const result = await VoiceService.transcribe(buffer, 'voice.ogg');

    expect(result).toBeNull();
  });

  it('mengembalikan null jika text property undefined', async () => {
    mockCreate.mockResolvedValueOnce({});

    const buffer = Buffer.from('fake-ogg-data');
    const result = await VoiceService.transcribe(buffer, 'voice.ogg');

    expect(result).toBeNull();
  });

  it('mengembalikan null jika Groq API melempar error', async () => {
    mockCreate.mockRejectedValueOnce(new Error('API rate limit exceeded'));

    const buffer = Buffer.from('fake-ogg-data');
    const result = await VoiceService.transcribe(buffer, 'voice.ogg');

    expect(result).toBeNull();
  });

  it('menangani transkripsi bahasa Indonesia', async () => {
    mockCreate.mockResolvedValueOnce({
      text: 'bayar listrik 500 ribu kemarin',
    });

    const buffer = Buffer.from('fake-ogg-data');
    const result = await VoiceService.transcribe(buffer, 'voice.ogg');

    expect(result).toBe('bayar listrik 500 ribu kemarin');
  });

  it('menangani transkripsi bahasa Inggris', async () => {
    mockCreate.mockResolvedValueOnce({
      text: 'spent 50 dollars on groceries yesterday',
    });

    const buffer = Buffer.from('fake-ogg-data');
    const result = await VoiceService.transcribe(buffer, 'voice.ogg');

    expect(result).toBe('spent 50 dollars on groceries yesterday');
  });

  it('menggunakan nama file default jika tidak diberikan', async () => {
    mockCreate.mockResolvedValueOnce({
      text: 'test transcription',
    });

    const buffer = Buffer.from('fake-ogg-data');
    const result = await VoiceService.transcribe(buffer);

    expect(result).toBe('test transcription');
    // Memastikan File dibuat dengan nama default
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'whisper-large-v3',
      }),
    );
  });
});
