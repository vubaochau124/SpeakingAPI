"""Audio processing utilities"""
import os
import tempfile
import uuid
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

# Use a simple temp folder path to avoid unicode issues with Azure SDK on Windows
UPLOAD_FOLDER = os.path.join(tempfile.gettempdir(), 'speechace_audio')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

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


def _get_safe_temp_path(suffix='.wav') -> str:
    """Generate a safe temp file path using only ASCII characters.

    Azure Speech SDK on Windows has issues with unicode paths.
    This ensures the path only contains safe ASCII characters.
    """
    # Use UUID to generate unique filename with only hex chars (safe ASCII)
    filename = f"{uuid.uuid4().hex}{suffix}"
    return os.path.join(UPLOAD_FOLDER, filename)


def convert_to_wav(input_path: str, enhance: bool = True) -> tuple:
    """Convert audio file to WAV format (16kHz mono 16-bit) and optionally enhance.

    Args:
        input_path: Path to input audio file
        enhance: Whether to apply audio enhancement (default True)

    Returns:
        tuple: (wav_path, needs_cleanup) - needs_cleanup is True if a temp file was created

    Raises:
        Exception: If pydub is not available or conversion fails
    """
    if not PYDUB_AVAILABLE:
        raise ImportError("pydub is required for audio conversion. Install with: pip install pydub")

    import shutil
    import subprocess
    ext = os.path.splitext(input_path)[1].lower()

    # First, copy input to safe path if needed (for files with special chars in name)
    safe_input = input_path
    safe_input_cleanup = False

    # Check if input path has unsafe characters
    try:
        input_path.encode('ascii')
        unsafe_chars = set('()[]{}!@#$%^&*+=`~\'\"<>|;')
        has_unsafe = any(c in os.path.basename(input_path) for c in unsafe_chars) or ' ' in os.path.basename(input_path)
    except UnicodeEncodeError:
        has_unsafe = True

    if has_unsafe:
        safe_input = _get_safe_temp_path(ext)
        shutil.copy2(input_path, safe_input)
        safe_input_cleanup = True
        print(f"[AUDIO] Copied input to safe path: {os.path.basename(input_path)} -> {os.path.basename(safe_input)}")

    try:
        wav_path = _get_safe_temp_path('.wav')

        # If already WAV, copy to temp for enhancement
        if ext == '.wav':
            shutil.copy2(safe_input, wav_path)
            if enhance:
                enhance_audio(wav_path)
            return wav_path, True

        # Try direct FFmpeg first (more reliable than pydub for some formats)
        ffmpeg_success = False
        try:
            print(f"[AUDIO] Trying direct FFmpeg conversion...")
            result = subprocess.run(
                [
                    'ffmpeg', '-y', '-i', safe_input,
                    '-ar', '16000',  # 16kHz sample rate
                    '-ac', '1',      # mono
                    '-acodec', 'pcm_s16le',  # 16-bit PCM
                    '-f', 'wav',
                    wav_path
                ],
                capture_output=True,
                text=True,
                timeout=60
            )
            if result.returncode == 0 and os.path.exists(wav_path) and os.path.getsize(wav_path) > 100:
                # Verify WAV header
                with open(wav_path, 'rb') as f:
                    header = f.read(12)
                    if header[:4] == b'RIFF' and header[8:12] == b'WAVE':
                        ffmpeg_success = True
                        print(f"[AUDIO] Direct FFmpeg conversion successful")
            if not ffmpeg_success:
                print(f"[AUDIO] Direct FFmpeg failed: {result.stderr[:200] if result.stderr else 'unknown error'}")
        except FileNotFoundError:
            print(f"[AUDIO] FFmpeg not found, falling back to pydub")
        except Exception as e:
            print(f"[AUDIO] Direct FFmpeg error: {e}")

        # Fallback to pydub if FFmpeg failed
        if not ffmpeg_success:
            audio = None
            last_error = None

            format_map = {
                '.mp3': 'mp3',
                '.m4a': 'mp4',
                '.webm': 'webm',
                '.ogg': 'ogg',
                '.aiff': 'aiff',
                '.aac': 'aac',
                '.flac': 'flac',
            }

            strategies = [
                ('explicit format', format_map.get(ext, ext.lstrip('.') if ext else None)),
                ('auto-detect', None),
                ('raw mp3', 'mp3'),
                ('raw mp4', 'mp4'),
            ]

            for strategy_name, audio_format in strategies:
                try:
                    print(f"[AUDIO] Trying pydub {strategy_name} (format={audio_format})")
                    if audio_format:
                        audio = AudioSegment.from_file(safe_input, format=audio_format)
                    else:
                        audio = AudioSegment.from_file(safe_input)
                    print(f"[AUDIO] Success with pydub {strategy_name}")
                    break
                except Exception as e:
                    last_error = e
                    print(f"[AUDIO] pydub {strategy_name} failed: {e}")
                    continue

            if audio is None:
                raise RuntimeError(f"All conversion strategies failed. Last error: {last_error}")

            # Convert to 16kHz mono 16-bit
            audio = audio.set_frame_rate(16000).set_channels(1).set_sample_width(2)

            # Export without extra parameters (let pydub handle it)
            audio.export(wav_path, format='wav')

        # Verify the output file exists and has content
        if not os.path.exists(wav_path):
            raise RuntimeError("Conversion produced no output file")

        file_size = os.path.getsize(wav_path)
        if file_size < 100:
            raise RuntimeError(f"Conversion produced empty WAV file ({file_size} bytes)")

        # Verify it's a valid WAV by checking header
        with open(wav_path, 'rb') as f:
            header = f.read(12)
            if header[:4] != b'RIFF' or header[8:12] != b'WAVE':
                raise RuntimeError(f"Output file is not valid WAV. Header: {header.hex()}")

        print(f"[AUDIO] Converted to: {wav_path} ({file_size} bytes)")

        if enhance:
            enhance_audio(wav_path)
        return wav_path, True

    except Exception as e:
        print(f"[AUDIO] Error converting {input_path}: {e}")
        raise RuntimeError(f"Failed to convert audio file: {e}")

    finally:
        # Cleanup safe input copy if created
        if safe_input_cleanup and os.path.exists(safe_input):
            try:
                os.remove(safe_input)
            except Exception:
                pass


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
