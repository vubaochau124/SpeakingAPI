"""Audio processing utilities"""
import os
import tempfile
import numpy as np

# Try to import audio libraries
try:
    from pydub import AudioSegment
    PYDUB_AVAILABLE = True
except ImportError:
    PYDUB_AVAILABLE = False

try:
    import noisereduce as nr
    from scipy.signal import butter, filtfilt
    from scipy.io import wavfile
    ENHANCEMENT_AVAILABLE = True
except ImportError:
    ENHANCEMENT_AVAILABLE = False

UPLOAD_FOLDER = tempfile.gettempdir()
ALLOWED_EXTENSIONS = {'wav', 'mp3', 'm4a', 'webm', 'ogg', 'aiff'}

# Audio storage folder for assignment submissions
AUDIO_FOLDER = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'audio_submissions')
os.makedirs(AUDIO_FOLDER, exist_ok=True)


def allowed_file(filename: str) -> bool:
    """Check if file extension is allowed"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def get_mime_type(filename: str) -> str:
    """Get MIME type for audio file"""
    ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else 'wav'
    mime_types = {
        'wav': 'audio/wav',
        'mp3': 'audio/mpeg',
        'm4a': 'audio/mp4',
        'webm': 'audio/webm',
        'ogg': 'audio/ogg',
        'aiff': 'audio/aiff'
    }
    return mime_types.get(ext, 'audio/wav')


def convert_to_wav(input_path: str, enhance: bool = True) -> tuple:
    """Convert audio file to WAV format (16kHz mono 16-bit) and optionally enhance.

    Args:
        input_path: Path to input audio file
        enhance: Whether to apply audio enhancement (default True)

    Returns:
        tuple: (wav_path, needs_cleanup) - needs_cleanup is True if a temp file was created
    """
    if not PYDUB_AVAILABLE:
        return input_path, False

    ext = os.path.splitext(input_path)[1].lower()

    # If already WAV, copy to temp for enhancement
    if ext == '.wav':
        import shutil
        wav_path = tempfile.mktemp(suffix='.wav')
        shutil.copy2(input_path, wav_path)
        if enhance:
            enhance_audio(wav_path)
        return wav_path, True

    # Convert to WAV
    try:
        audio = AudioSegment.from_file(input_path, format=ext.lstrip('.') if ext else None)
        audio = audio.set_frame_rate(16000).set_channels(1).set_sample_width(2)
        wav_path = tempfile.mktemp(suffix='.wav')
        audio.export(wav_path, format='wav', parameters=["-acodec", "pcm_s16le"])
        if enhance:
            enhance_audio(wav_path)
        return wav_path, True
    except Exception:
        return input_path, False


def enhance_audio(wav_path: str) -> str:
    """Enhance audio: noise reduction, high-pass filter, normalization.

    Args:
        wav_path: Path to WAV file (modified in place)

    Returns:
        str: Path to enhanced file (same as input)
    """
    if not ENHANCEMENT_AVAILABLE:
        return wav_path

    try:
        sample_rate, audio_data = wavfile.read(wav_path)

        # Convert to float
        if audio_data.dtype == np.int16:
            audio_float = audio_data.astype(np.float32) / 32768.0
        elif audio_data.dtype == np.int32:
            audio_float = audio_data.astype(np.float32) / 2147483648.0
        else:
            audio_float = audio_data.astype(np.float32)

        # Convert stereo to mono
        if len(audio_float.shape) > 1:
            audio_float = np.mean(audio_float, axis=1)

        # 1. Noise reduction
        audio_float = nr.reduce_noise(y=audio_float, sr=sample_rate, prop_decrease=0.8, stationary=True)

        # 2. High-pass filter (80Hz)
        nyquist = sample_rate / 2
        cutoff = 80 / nyquist
        if cutoff < 1:
            b, a = butter(4, cutoff, btype='high')
            audio_float = filtfilt(b, a, audio_float)

        # 3. Normalize to -3 dBFS (suitable for speech recognition)
        max_val = np.max(np.abs(audio_float))
        if max_val > 0:
            target_level = 10 ** (-3 / 20)  # -3 dBFS ≈ 0.708
            audio_float = audio_float * (target_level / max_val)

        # 4. Soft compression (only compress loud peaks)
        threshold, ratio = 0.8, 4.0
        audio_float = np.where(
            np.abs(audio_float) > threshold,
            np.sign(audio_float) * (threshold + (np.abs(audio_float) - threshold) / ratio),
            audio_float
        )

        # Save back
        wavfile.write(wav_path, sample_rate, np.clip(audio_float * 32768, -32768, 32767).astype(np.int16))
        return wav_path

    except Exception:
        return wav_path
