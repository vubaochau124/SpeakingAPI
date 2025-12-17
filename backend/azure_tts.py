"""Azure Text-to-Speech Service"""
import os
import time
from dotenv import load_dotenv

load_dotenv()

# Try to import Azure Speech SDK
try:
    import azure.cognitiveservices.speech as speechsdk
    AZURE_SDK_AVAILABLE = True
except ImportError:
    AZURE_SDK_AVAILABLE = False
    print("Warning: Azure Speech SDK not installed. Install with: pip install azure-cognitiveservices-speech")


# Voice mapping for different languages
TTS_VOICES = {
    'en-US': 'en-US-JennyNeural',
    'en-GB': 'en-GB-SoniaNeural',
    'zh-CN': 'zh-CN-XiaoxiaoNeural',
    'ja-JP': 'ja-JP-NanamiNeural',
    'ko-KR': 'ko-KR-SunHiNeural',
}


class AzureTTSService:
    """Azure Text-to-Speech service for generating speech audio from text."""

    def __init__(self):
        """Initialize Azure TTS service."""
        self.speech_key = os.getenv('AZURE_SPEECH_KEY')
        self.service_region = os.getenv('AZURE_SPEECH_REGION', 'eastus')

        if not self.speech_key:
            raise ValueError(
                "AZURE_SPEECH_KEY environment variable not set.\n"
                "Please create a .env file with your Azure Speech API key."
            )

        if not AZURE_SDK_AVAILABLE:
            raise ImportError(
                "Azure Speech SDK not installed.\n"
                "Install with: pip install azure-cognitiveservices-speech"
            )

        # Initialize speech config
        self.speech_config = speechsdk.SpeechConfig(
            subscription=self.speech_key,
            region=self.service_region
        )

    def text_to_speech(self, text: str, language: str = 'en-US', output_path: str = None) -> str:
        """Generate speech audio from text using Azure TTS.

        Args:
            text: Text to convert to speech
            language: Language code (e.g., 'en-US', 'zh-CN')
            output_path: Optional output file path. If None, generates a temp file.

        Returns:
            str: Path to the generated audio file
        """
        from utils.audio import _get_safe_temp_path

        if not text or not text.strip():
            raise ValueError("Text is required for TTS")

        # Get voice for language
        voice_name = TTS_VOICES.get(language, TTS_VOICES['en-US'])

        # Generate output path if not provided
        if output_path is None:
            output_path = _get_safe_temp_path('.wav')

        try:
            start_time = time.time()
            print(f"[AZURE-TTS] Generating speech for {len(text)} chars, voice={voice_name}")

            # Configure speech synthesis
            self.speech_config.speech_synthesis_voice_name = voice_name

            # Configure audio output
            audio_config = speechsdk.audio.AudioOutputConfig(filename=output_path)

            # Create synthesizer
            synthesizer = speechsdk.SpeechSynthesizer(
                speech_config=self.speech_config,
                audio_config=audio_config
            )

            # Generate speech
            result = synthesizer.speak_text_async(text).get()

            # Check result
            if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
                elapsed = time.time() - start_time
                if os.path.exists(output_path):
                    file_size = os.path.getsize(output_path)
                    print(f"[AZURE-TTS] Success in {elapsed:.2f}s, file size: {file_size} bytes")
                    if file_size == 0:
                        raise Exception("TTS completed but file is empty")
                    return output_path
                else:
                    raise Exception(f"TTS completed but file not created at {output_path}")

            elif result.reason == speechsdk.ResultReason.Canceled:
                cancellation = result.cancellation_details
                error_msg = f"TTS canceled: {cancellation.reason}"
                if cancellation.reason == speechsdk.CancellationReason.Error:
                    error_msg += f" - {cancellation.error_details}"
                print(f"[AZURE-TTS] Error: {error_msg}")
                raise Exception(error_msg)

            else:
                raise Exception(f"TTS failed with reason: {result.reason}")

        except Exception as e:
            print(f"[AZURE-TTS] Exception: {e}")
            # Cleanup partial file if exists
            if output_path and os.path.exists(output_path):
                try:
                    os.remove(output_path)
                except Exception:
                    pass
            raise

    def text_to_speech_ssml(self, ssml: str, output_path: str = None) -> str:
        """Generate speech from SSML for more control over prosody.

        Args:
            ssml: SSML-formatted text
            output_path: Optional output file path

        Returns:
            str: Path to the generated audio file
        """
        from utils.audio import _get_safe_temp_path

        if output_path is None:
            output_path = _get_safe_temp_path('.wav')

        try:
            audio_config = speechsdk.audio.AudioOutputConfig(filename=output_path)
            synthesizer = speechsdk.SpeechSynthesizer(
                speech_config=self.speech_config,
                audio_config=audio_config
            )

            result = synthesizer.speak_ssml_async(ssml).get()

            if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
                return output_path
            else:
                raise Exception(f"SSML TTS failed: {result.reason}")

        except Exception as e:
            if output_path and os.path.exists(output_path):
                try:
                    os.remove(output_path)
                except Exception:
                    pass
            raise


# Singleton instance
_tts_service = None


def get_tts_service() -> AzureTTSService:
    """Get or create the TTS service singleton."""
    global _tts_service
    if _tts_service is None:
        _tts_service = AzureTTSService()
    return _tts_service
