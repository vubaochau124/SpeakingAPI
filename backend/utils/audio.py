"""Audio processing utilities"""
import os
import tempfile
from pydub import AudioSegment

UPLOAD_FOLDER = tempfile.gettempdir()
ALLOWED_EXTENSIONS = {'wav', 'mp3', 'm4a', 'webm', 'ogg', 'aiff'}

# Audio storage folder for assignment submissions
AUDIO_FOLDER = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'audio_submissions')
os.makedirs(AUDIO_FOLDER, exist_ok=True)


def allowed_file(filename: str) -> bool:
    """Check if file extension is allowed"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def convert_to_wav(input_path: str) -> str:
    """Convert audio file to WAV format for Azure Speech API (mono 16kHz 16-bit)"""
    ext = input_path.rsplit('.', 1)[1].lower() if '.' in input_path else ''
    if ext == 'wav':
        return input_path

    try:
        audio = AudioSegment.from_file(input_path, format=ext if ext else None)
        audio = audio.set_channels(1).set_frame_rate(16000).set_sample_width(2)
        wav_path = input_path.rsplit('.', 1)[0] + '.wav'
        audio.export(wav_path, format='wav', parameters=["-acodec", "pcm_s16le"])
        return wav_path
    except Exception:
        return input_path


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
