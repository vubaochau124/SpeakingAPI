import os
import json
import threading
import tempfile
import shutil
import numpy as np
from dotenv import load_dotenv
from openai import OpenAI

# Load environment variables
load_dotenv()

# Try to import audio enhancement libraries
try:
    import noisereduce as nr
    from scipy.signal import butter, filtfilt
    from scipy.io import wavfile
    ENHANCEMENT_AVAILABLE = True
except ImportError:
    ENHANCEMENT_AVAILABLE = False
    print("Warning: Audio enhancement libraries not installed. Install with: pip install noisereduce scipy numpy")

# Try to import pydub for audio conversion
try:
    from pydub import AudioSegment
    PYDUB_AVAILABLE = True
except ImportError:
    PYDUB_AVAILABLE = False
    print("Warning: pydub not installed. Audio conversion unavailable. Install with: pip install pydub")

# Try to import eng_to_ipa for phoneme generation fallback
try:
    import eng_to_ipa as ipa
    IPA_AVAILABLE = True
except ImportError:
    IPA_AVAILABLE = False
    print("Warning: eng_to_ipa not installed. Phoneme fallback unavailable. Install with: pip install eng-to-ipa")

# Try to import Azure Speech SDK
try:
    import azure.cognitiveservices.speech as speechsdk
    AZURE_SDK_AVAILABLE = True
except ImportError:
    AZURE_SDK_AVAILABLE = False
    print("Warning: Azure Speech SDK not installed. Install with: pip install azure-cognitiveservices-speech")


class AzureSpeechAPI:
    """Azure Speech API integration for pronunciation assessment"""

    def __init__(self):
        """Initialize Azure Speech API client"""
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

    def _convert_to_wav(self, audio_file_path):
        """Convert audio file to WAV format if needed.

        Azure Speech API works best with WAV format. This method converts
        WebM, MP3, M4A, OGG and other formats to WAV.

        Args:
            audio_file_path (str): Path to the audio file

        Returns:
            tuple: (wav_path, needs_cleanup) - path to WAV file and whether to delete it after
        """
        ext = os.path.splitext(audio_file_path)[1].lower()

        # If already WAV, still apply enhancement but no format conversion needed
        if ext == '.wav':
            # Copy to temp file so we don't modify original
            wav_path = tempfile.mktemp(suffix='.wav')
            shutil.copy2(audio_file_path, wav_path)
            # Apply audio enhancement
            wav_path = self._enhance_audio(wav_path)
            return wav_path, True

        # Check if pydub is available
        if not PYDUB_AVAILABLE:
            print(f"[Warning] Cannot convert {ext} to WAV - pydub not installed. Trying anyway...")
            return audio_file_path, False

        print(f"[Azure] Converting {ext} to WAV format...")

        try:
            # Load audio based on format
            if ext == '.webm':
                audio = AudioSegment.from_file(audio_file_path, format='webm')
            elif ext == '.mp3':
                audio = AudioSegment.from_mp3(audio_file_path)
            elif ext == '.m4a':
                audio = AudioSegment.from_file(audio_file_path, format='m4a')
            elif ext == '.ogg':
                audio = AudioSegment.from_ogg(audio_file_path)
            elif ext == '.aiff':
                audio = AudioSegment.from_file(audio_file_path, format='aiff')
            else:
                audio = AudioSegment.from_file(audio_file_path)

            # Convert to WAV (16kHz, mono, 16-bit) - optimal for Azure Speech
            audio = audio.set_frame_rate(16000).set_channels(1).set_sample_width(2)

            # Save to temp file
            wav_path = tempfile.mktemp(suffix='.wav')
            audio.export(wav_path, format='wav')

            print(f"[Azure] Converted to WAV: {wav_path}")

            # Apply audio enhancement
            wav_path = self._enhance_audio(wav_path)

            return wav_path, True

        except Exception as e:
            print(f"[Warning] Audio conversion failed: {e}. Using original file...")
            return audio_file_path, False

    def _enhance_audio(self, wav_path):
        """Enhance audio quality before sending to Azure.

        Applies 4 enhancement steps:
        1. Noise Reduction - Remove background noise
        2. High-pass Filter - Remove frequencies below 80Hz
        3. Normalization - Normalize volume to -20 dBFS
        4. Compression - Reduce dynamic range

        Note: Silence trimming is NOT applied to preserve word timing for playback.

        Args:
            wav_path (str): Path to WAV file

        Returns:
            str: Path to enhanced WAV file (same path, modified in place)
        """
        if not ENHANCEMENT_AVAILABLE:
            print("[Audio Enhancement] Libraries not available, skipping enhancement")
            return wav_path

        try:
            print("[Audio Enhancement] Starting audio enhancement pipeline...")

            # Read WAV file
            sample_rate, audio_data = wavfile.read(wav_path)

            # Convert to float for processing
            if audio_data.dtype == np.int16:
                audio_float = audio_data.astype(np.float32) / 32768.0
            elif audio_data.dtype == np.int32:
                audio_float = audio_data.astype(np.float32) / 2147483648.0
            else:
                audio_float = audio_data.astype(np.float32)

            # Handle stereo - convert to mono if needed
            if len(audio_float.shape) > 1:
                audio_float = np.mean(audio_float, axis=1)

            # Step 1: Noise Reduction
            print("  [1/4] Applying noise reduction...")
            audio_denoised = nr.reduce_noise(
                y=audio_float,
                sr=sample_rate,
                prop_decrease=0.8,  # Reduce noise by 80%
                stationary=True
            )

            # Step 2: High-pass Filter (80Hz) - Remove low frequency rumble
            print("  [2/4] Applying high-pass filter (80Hz)...")
            nyquist = sample_rate / 2
            cutoff = 80 / nyquist
            if cutoff < 1:  # Only apply if cutoff is valid
                b, a = butter(4, cutoff, btype='high')
                audio_filtered = filtfilt(b, a, audio_denoised)
            else:
                audio_filtered = audio_denoised

            # Step 3: Normalization to -20 dBFS
            print("  [3/4] Normalizing audio to -20 dBFS...")
            max_val = np.max(np.abs(audio_filtered))
            if max_val > 0:
                target_level = 10 ** (-20 / 20)  # -20 dBFS
                audio_normalized = audio_filtered * (target_level / max_val)
            else:
                audio_normalized = audio_filtered

            # Step 4: Compression (soft limiting)
            print("  [4/4] Applying dynamic compression...")
            threshold = 0.3
            ratio = 4.0
            audio_compressed = np.where(
                np.abs(audio_normalized) > threshold,
                np.sign(audio_normalized) * (threshold + (np.abs(audio_normalized) - threshold) / ratio),
                audio_normalized
            )

            # NOTE: Silence Trimming removed to preserve word timing for playback

            # Convert back to int16
            audio_int16 = np.clip(audio_compressed * 32768, -32768, 32767).astype(np.int16)

            # Save enhanced audio back to WAV
            wavfile.write(wav_path, sample_rate, audio_int16)

            print(f"[Audio Enhancement] Complete! Duration: {len(audio_int16)/sample_rate:.2f}s")
            return wav_path

        except Exception as e:
            print(f"[Audio Enhancement] Enhancement failed: {e}. Using original audio...")
            return wav_path

    def _transcribe_audio(self, wav_path, language='en-US'):
        """Pass 1: Speech-to-Text using OpenAI Whisper.

        This method transcribes audio using OpenAI Whisper API.
        The transcript is then used as reference text for Pass 2 (pronunciation assessment).

        Args:
            wav_path (str): Path to WAV file
            language (str): Language code (default: 'en-US') - mapped to Whisper format

        Returns:
            str: Transcribed text
        """
        print(f"[Whisper Pass 1] Starting OpenAI Whisper transcription...")

        try:
            # Initialize OpenAI client
            openai_api_key = os.getenv('OPENAI_API_KEY')
            if not openai_api_key:
                print("[Whisper Pass 1] OpenAI API key not found. Falling back to Azure STT.")
                return self._transcribe_audio_azure(wav_path, language)

            client = OpenAI(api_key=openai_api_key)

            # Map language code to Whisper format (ISO 639-1)
            whisper_lang = 'en'  # Default English
            if language.lower().startswith('en'):
                whisper_lang = 'en'

            # Open audio file and transcribe
            with open(wav_path, 'rb') as audio_file:
                transcript_response = client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file,
                    language=whisper_lang,
                    response_format="text"
                )

            transcript = transcript_response.strip() if isinstance(transcript_response, str) else str(transcript_response).strip()

            print(f"[Whisper Pass 1] Transcript: {transcript[:100]}..." if len(transcript) > 100 else f"[Whisper Pass 1] Transcript: {transcript}")

            return transcript

        except Exception as e:
            print(f"[Whisper Pass 1] Error: {e}. Falling back to Azure STT.")
            return self._transcribe_audio_azure(wav_path, language)

    def _transcribe_audio_azure(self, wav_path, language='en-US'):
        """Fallback: Speech-to-Text using Azure (if Whisper fails).

        Args:
            wav_path (str): Path to WAV file
            language (str): Language code (default: 'en-US')

        Returns:
            str: Transcribed text
        """
        print(f"[Azure STT Fallback] Starting Azure Speech-to-Text...")

        audio_config = speechsdk.audio.AudioConfig(filename=wav_path)
        speech_recognizer = speechsdk.SpeechRecognizer(
            speech_config=self.speech_config,
            language=language,
            audio_config=audio_config
        )

        # Storage for continuous recognition
        all_transcripts = []
        done = threading.Event()
        error_message = [None]

        def on_recognized(evt):
            if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech:
                all_transcripts.append(evt.result.text)
                print(f"  [Segment] {evt.result.text[:60]}..." if len(evt.result.text) > 60 else f"  [Segment] {evt.result.text}")

        def on_canceled(evt):
            if evt.cancellation_details.reason == speechsdk.CancellationReason.Error:
                error_message[0] = evt.cancellation_details.error_details
                print(f"  [Error] {error_message[0]}")
            done.set()

        def on_session_stopped(evt):
            print("  [Session] Transcription complete")
            done.set()

        # Connect handlers
        speech_recognizer.recognized.connect(on_recognized)
        speech_recognizer.canceled.connect(on_canceled)
        speech_recognizer.session_stopped.connect(on_session_stopped)

        # Start continuous recognition
        speech_recognizer.start_continuous_recognition()
        done.wait(timeout=120)
        speech_recognizer.stop_continuous_recognition()

        if error_message[0]:
            print(f"[Azure STT Fallback] Transcription error: {error_message[0]}")
            return ""

        full_transcript = ' '.join(all_transcripts)
        print(f"[Azure STT Fallback] Transcript: {full_transcript[:100]}..." if len(full_transcript) > 100 else f"[Azure STT Fallback] Transcript: {full_transcript}")

        return full_transcript

    def _map_azure_to_frontend_word(self, azure_word):
        """Map Azure word result to frontend-expected word format"""
        word_data = azure_word

        word_text = word_data.get('Word', '')
        accuracy = word_data.get('PronunciationAssessment', {}).get('AccuracyScore', 0)
        error_type = word_data.get('PronunciationAssessment', {}).get('ErrorType', 'None')

        error_mapping = {
            'None': None,
            'Mispronunciation': 'mispronunciation',
            'Omission': 'omission',
            'Insertion': 'insertion',
            'UnexpectedBreak': 'unexpected_break',
            'MissingBreak': 'missing_break',
            'Monotone': 'monotone'
        }

        # Build phone_score_list from Phonemes
        phone_score_list = []
        phonemes = word_data.get('Phonemes', [])

        # Check if Azure returned empty phoneme names (common in continuous mode)
        all_phonemes_empty = all(p.get('Phoneme', '') == '' for p in phonemes) if phonemes else True

        # Generate expected IPA phonemes using eng_to_ipa as fallback
        expected_phonemes = []
        if all_phonemes_empty and IPA_AVAILABLE and word_text:
            try:
                ipa_transcription = ipa.convert(word_text.lower())
                # Remove stress markers and split into individual phonemes
                if ipa_transcription and '*' not in ipa_transcription:
                    # IPA returns string like "hɛˈloʊ", we need to split it into individual phonemes
                    # Remove stress markers (ˈ ˌ) and split
                    clean_ipa = ipa_transcription.replace('ˈ', '').replace('ˌ', '').replace('ˑ', '')
                    # Common IPA diphthongs and digraphs to keep together
                    diphthongs = ['aɪ', 'aʊ', 'eɪ', 'oʊ', 'ɔɪ', 'ɪə', 'eə', 'ʊə', 'tʃ', 'dʒ', 'θ', 'ð', 'ŋ', 'ʃ', 'ʒ']
                    i = 0
                    while i < len(clean_ipa):
                        found_diphthong = False
                        for diph in diphthongs:
                            if clean_ipa[i:].startswith(diph):
                                expected_phonemes.append(diph)
                                i += len(diph)
                                found_diphthong = True
                                break
                        if not found_diphthong:
                            if clean_ipa[i] not in ' ':
                                expected_phonemes.append(clean_ipa[i])
                            i += 1
            except Exception as e:
                print(f"[IPA Fallback] Error converting '{word_text}': {e}")

        for idx, phoneme in enumerate(phonemes):
            phoneme_text = phoneme.get('Phoneme', '')

            # Use expected phoneme as fallback if Azure returned empty
            if not phoneme_text and idx < len(expected_phonemes):
                phoneme_text = expected_phonemes[idx]

            phone_data = {
                'phone': phoneme_text,
                'quality_score': phoneme.get('PronunciationAssessment', {}).get('AccuracyScore', 0),
                'sound_most_like': phoneme_text,
                'extent': [
                    phoneme.get('Offset', 0) // 10000,
                    (phoneme.get('Offset', 0) + phoneme.get('Duration', 0)) // 10000
                ]
            }
            phone_score_list.append(phone_data)

        # Build syllable_score_list from Syllables
        syllable_score_list = []
        syllables = word_data.get('Syllables', [])

        # Check if Azure returned empty syllable names
        all_syllables_empty = all(s.get('Syllable', '') == '' for s in syllables) if syllables else True

        for syllable in syllables:
            syllable_text = syllable.get('Syllable', '')

            # If syllable text is empty, use word_text as fallback for single syllable
            if not syllable_text and all_syllables_empty and len(syllables) == 1:
                syllable_text = word_text

            syl_data = {
                'letters': syllable_text,
                'quality_score': syllable.get('PronunciationAssessment', {}).get('AccuracyScore', 0),
                'stress_level': 0,
                'extent': [
                    syllable.get('Offset', 0) // 10000,
                    (syllable.get('Offset', 0) + syllable.get('Duration', 0)) // 10000
                ]
            }
            syllable_score_list.append(syl_data)

        # Fallback: if no syllables or all empty, use word_text
        if not syllable_score_list or (all_syllables_empty and syllables):
            syllable_score_list = [{
                'letters': word_text,
                'quality_score': accuracy,
                'stress_level': 0,
                'extent': [
                    word_data.get('Offset', 0) // 10000,
                    (word_data.get('Offset', 0) + word_data.get('Duration', 0)) // 10000
                ]
            }]

        return {
            'word': word_text,
            'quality_score': accuracy,
            'phone_score_list': phone_score_list,
            'syllable_score_list': syllable_score_list,
            'error_type': error_mapping.get(error_type),
            'ending_punctuation': ''
        }

    def _azure_score_to_ielts(self, azure_score):
        """Convert Azure 0-100 score to IELTS 0-9 band"""
        if azure_score >= 95:
            return 9.0
        elif azure_score >= 90:
            return 8.5
        elif azure_score >= 85:
            return 8.0
        elif azure_score >= 80:
            return 7.5
        elif azure_score >= 75:
            return 7.0
        elif azure_score >= 70:
            return 6.5
        elif azure_score >= 65:
            return 6.0
        elif azure_score >= 60:
            return 5.5
        elif azure_score >= 55:
            return 5.0
        elif azure_score >= 50:
            return 4.5
        elif azure_score >= 45:
            return 4.0
        elif azure_score >= 40:
            return 3.5
        elif azure_score >= 35:
            return 3.0
        elif azure_score >= 30:
            return 2.5
        elif azure_score >= 25:
            return 2.0
        else:
            return 1.0

    def _calculate_fluency_metrics(self, all_words, audio_duration_sec):
        """Calculate fluency metrics from all words"""
        total_syllables = 0
        total_phonemes = 0

        for word in all_words:
            syllables = word.get('Syllables', [])
            phonemes = word.get('Phonemes', [])
            total_syllables += len(syllables) if syllables else 1
            total_phonemes += len(phonemes) if phonemes else len(word.get('Word', ''))

        word_count = len(all_words)

        if audio_duration_sec > 0:
            speech_rate = word_count / audio_duration_sec
            articulation_rate = total_syllables / audio_duration_sec
            syllable_per_minute = (total_syllables / audio_duration_sec) * 60
            word_per_minute = (word_count / audio_duration_sec) * 60
        else:
            speech_rate = 0
            articulation_rate = 0
            syllable_per_minute = 0
            word_per_minute = 0

        pause_count = 0
        pause_duration = 0

        for word in all_words:
            feedback = word.get('PronunciationAssessment', {}).get('Feedback', {})
            prosody = feedback.get('Prosody', {})
            break_info = prosody.get('Break', {})
            if break_info.get('ErrorTypes') and 'UnexpectedBreak' in break_info.get('ErrorTypes', []):
                pause_count += 1
                pause_duration += break_info.get('BreakLength', 0) / 10000

        return {
            'overall_metrics': {
                'speech_rate': round(speech_rate, 2),
                'articulation_rate': round(articulation_rate, 2),
                'syllable_correct_per_minute': round(syllable_per_minute, 1),
                'word_correct_per_minute': round(word_per_minute, 1),
                'all_pause_count': pause_count,
                'all_pause_duration': round(pause_duration, 2),
                'all_pause_list': []
            }
        }

    def prepare_audio(self, audio_file_path):
        """Prepare audio file for processing - convert to WAV and enhance.

        Returns:
            tuple: (wav_path, needs_cleanup) - path to processed WAV file
        """
        if not os.path.exists(audio_file_path):
            raise FileNotFoundError(f"Audio file not found: {audio_file_path}")
        return self._convert_to_wav(audio_file_path)

    def transcribe_only(self, wav_path, language='en-US'):
        """Pass 1 only: Get transcript using Whisper/Azure STT.

        Args:
            wav_path: Path to WAV file
            language: Language code (default: 'en-US')

        Returns:
            str: Transcript text
        """
        print(f"[Pass 1] Starting transcription...")
        transcript = self._transcribe_audio(wav_path, language)
        if transcript:
            print(f"[Pass 1] Transcript: {transcript[:80]}...")
        else:
            print("[Pass 1] No transcript obtained")
        return transcript or ""

    def assess_pronunciation_only(self, wav_path, transcript, language='en-US'):
        """Pass 2 only: Run pronunciation assessment with given transcript.

        Args:
            wav_path: Path to WAV file
            transcript: Reference text from Pass 1
            language: Language code (default: 'en-US')

        Returns:
            dict: Pronunciation assessment results
        """
        print(f"[Pass 2] Starting Pronunciation Assessment...")

        # Configure audio with WAV file
        audio_config = speechsdk.audio.AudioConfig(filename=wav_path)

        # Configure pronunciation assessment with reference text from Pass 1
        pronunciation_config = speechsdk.PronunciationAssessmentConfig(
            reference_text=transcript,
            grading_system=speechsdk.PronunciationAssessmentGradingSystem.HundredMark,
            granularity=speechsdk.PronunciationAssessmentGranularity.Phoneme,
            enable_miscue=True if transcript else False
        )
        pronunciation_config.phoneme_alphabet = "IPA"
        pronunciation_config.enable_prosody_assessment()

        # Create speech recognizer
        speech_recognizer = speechsdk.SpeechRecognizer(
            speech_config=self.speech_config,
            language=language,
            audio_config=audio_config
        )
        pronunciation_config.apply_to(speech_recognizer)

        # Storage for continuous recognition
        all_results = []
        all_words = []
        all_transcripts = []
        accuracy_scores = []
        fluency_scores = []
        prosody_scores = []
        pronunciation_scores = []
        done = threading.Event()
        error_message = [None]

        def on_recognized(evt):
            if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech:
                json_result = evt.result.properties.get(speechsdk.PropertyId.SpeechServiceResponse_JsonResult)
                if json_result:
                    result_json = json.loads(json_result)
                    all_results.append(result_json)
                    all_transcripts.append(evt.result.text)

                    if result_json.get('NBest') and len(result_json['NBest']) > 0:
                        words = result_json['NBest'][0].get('Words', [])
                        all_words.extend(words)

                        pron = result_json['NBest'][0].get('PronunciationAssessment', {})
                        if pron.get('AccuracyScore') is not None:
                            accuracy_scores.append(pron['AccuracyScore'])
                        if pron.get('FluencyScore') is not None:
                            fluency_scores.append(pron['FluencyScore'])
                        if pron.get('ProsodyScore') is not None:
                            prosody_scores.append(pron['ProsodyScore'])
                        if pron.get('PronScore') is not None:
                            pronunciation_scores.append(pron['PronScore'])

                print(f"  [Segment] {evt.result.text[:60]}..." if len(evt.result.text) > 60 else f"  [Segment] {evt.result.text}")

        def on_canceled(evt):
            if evt.cancellation_details.reason == speechsdk.CancellationReason.Error:
                error_message[0] = evt.cancellation_details.error_details
                print(f"  [Error] {error_message[0]}")
            done.set()

        def on_session_stopped(evt):
            print("  [Session] Pronunciation assessment complete")
            done.set()

        # Connect handlers
        speech_recognizer.recognized.connect(on_recognized)
        speech_recognizer.canceled.connect(on_canceled)
        speech_recognizer.session_stopped.connect(on_session_stopped)

        # Start continuous recognition
        speech_recognizer.start_continuous_recognition()
        done.wait(timeout=120)
        speech_recognizer.stop_continuous_recognition()

        if error_message[0]:
            raise Exception(f"Azure Speech API error: {error_message[0]}")

        # Combine results
        full_transcript = ' '.join(all_transcripts)
        print(f"[Pass 2] Total segments: {len(all_results)}, Total words: {len(all_words)}")

        # Calculate average scores
        accuracy_score = sum(accuracy_scores) / len(accuracy_scores) if accuracy_scores else 0
        fluency_score = sum(fluency_scores) / len(fluency_scores) if fluency_scores else 0
        prosody_score = sum(prosody_scores) / len(prosody_scores) if prosody_scores else 0
        pronunciation_score = sum(pronunciation_scores) / len(pronunciation_scores) if pronunciation_scores else 0

        # Calculate duration
        total_duration = sum(r.get('Duration', 0) for r in all_results)
        audio_duration_sec = total_duration / 10000000 if total_duration else 5

        # Build word_score_list
        word_score_list = [self._map_azure_to_frontend_word(w) for w in all_words]

        # Fluency metrics
        fluency_metrics = self._calculate_fluency_metrics(all_words, audio_duration_sec)

        print(f"[Pass 2] Scores - Accuracy: {accuracy_score:.1f}, Fluency: {fluency_score:.1f}, Prosody: {prosody_score:.1f}")

        return {
            'status': 'success',
            'speech_score': {
                'transcript': full_transcript or transcript,  # Use Pass 1 transcript as fallback
                'word_score_list': word_score_list,
                'scores': {
                    'pronunciation': round(pronunciation_score, 1),
                    'fluency': round(fluency_score, 1),
                    'accuracy': round(accuracy_score, 1),
                    'grammar': None,
                    'vocab': None,
                    'coherence': None
                },
                'fluency': fluency_metrics,
                'detected_dialect': {'lang_id': 'en-US'}
            },
            '_raw_azure_response': all_results
        }

    def score_audio(self, audio_file_path, relevance_context=""):
        """Evaluate speech using 2-pass approach (Azure recommended).

        Pass 1: Speech-to-Text to get transcript
        Pass 2: Pronunciation Assessment with transcript as reference text
        """
        if not os.path.exists(audio_file_path):
            raise FileNotFoundError(f"Audio file not found: {audio_file_path}")

        print(f"[Azure] Processing audio file: {audio_file_path}")
        print(f"[Azure] Using 2-pass approach: Whisper (Pass 1) + Azure Pronunciation (Pass 2)")

        # Convert to WAV if needed (WebM, MP3, etc.)
        wav_path, needs_cleanup = self._convert_to_wav(audio_file_path)

        # Default to US English
        language = 'en-US'

        try:
            # ========== PASS 1: Speech-to-Text (get transcript) ==========
            transcript = self._transcribe_audio(wav_path, language)

            if not transcript:
                print("[Azure] Pass 1 failed - no transcript. Falling back to unscripted mode.")
                reference_text = ""
            else:
                reference_text = transcript
                print(f"[Azure] Pass 1 complete. Reference text: {reference_text[:80]}...")

            # ========== PASS 2: Pronunciation Assessment ==========
            print(f"[Azure Pass 2] Starting Pronunciation Assessment...")

            # Configure audio with WAV file
            audio_config = speechsdk.audio.AudioConfig(filename=wav_path)

            # Configure pronunciation assessment with reference text from Pass 1
            pronunciation_config = speechsdk.PronunciationAssessmentConfig(
                reference_text=reference_text,
                grading_system=speechsdk.PronunciationAssessmentGradingSystem.HundredMark,
                granularity=speechsdk.PronunciationAssessmentGranularity.Phoneme,
                enable_miscue=True if reference_text else False  # Enable miscue only if we have reference
            )
            pronunciation_config.phoneme_alphabet = "IPA"
            pronunciation_config.enable_prosody_assessment()

            # Create speech recognizer
            speech_recognizer = speechsdk.SpeechRecognizer(
                speech_config=self.speech_config,
                language=language,
                audio_config=audio_config
            )
            pronunciation_config.apply_to(speech_recognizer)

            # Storage for continuous recognition
            all_results = []
            all_words = []
            all_transcripts = []
            accuracy_scores = []
            fluency_scores = []
            prosody_scores = []
            pronunciation_scores = []
            done = threading.Event()
            error_message = [None]  # Use list to allow modification in nested function

            def on_recognized(evt):
                if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech:
                    json_result = evt.result.properties.get(speechsdk.PropertyId.SpeechServiceResponse_JsonResult)
                    if json_result:
                        result_json = json.loads(json_result)
                        all_results.append(result_json)
                        all_transcripts.append(evt.result.text)

                        if result_json.get('NBest') and len(result_json['NBest']) > 0:
                            words = result_json['NBest'][0].get('Words', [])
                            all_words.extend(words)

                            pron = result_json['NBest'][0].get('PronunciationAssessment', {})
                            if pron.get('AccuracyScore') is not None:
                                accuracy_scores.append(pron['AccuracyScore'])
                            if pron.get('FluencyScore') is not None:
                                fluency_scores.append(pron['FluencyScore'])
                            if pron.get('ProsodyScore') is not None:
                                prosody_scores.append(pron['ProsodyScore'])
                            if pron.get('PronScore') is not None:
                                pronunciation_scores.append(pron['PronScore'])

                    print(f"  [Segment] {evt.result.text[:60]}..." if len(evt.result.text) > 60 else f"  [Segment] {evt.result.text}")

            def on_canceled(evt):
                if evt.cancellation_details.reason == speechsdk.CancellationReason.Error:
                    error_message[0] = evt.cancellation_details.error_details
                    print(f"  [Error] {error_message[0]}")
                done.set()

            def on_session_stopped(evt):
                print("  [Session] Audio processing complete")
                done.set()

            # Connect handlers
            speech_recognizer.recognized.connect(on_recognized)
            speech_recognizer.canceled.connect(on_canceled)
            speech_recognizer.session_stopped.connect(on_session_stopped)

            # Start continuous recognition for Pass 2
            print("[Azure Pass 2] Starting pronunciation assessment...")
            speech_recognizer.start_continuous_recognition()

            # Wait for completion (2 minute timeout)
            done.wait(timeout=120)
            speech_recognizer.stop_continuous_recognition()

            if error_message[0]:
                raise Exception(f"Azure Speech API error: {error_message[0]}")

            # Combine results
            full_transcript = ' '.join(all_transcripts)
            print(f"\n[Azure Pass 2] Total segments: {len(all_results)}, Total words: {len(all_words)}")

            # Calculate average scores
            accuracy_score = sum(accuracy_scores) / len(accuracy_scores) if accuracy_scores else 0
            fluency_score = sum(fluency_scores) / len(fluency_scores) if fluency_scores else 0
            prosody_score = sum(prosody_scores) / len(prosody_scores) if prosody_scores else 0
            pronunciation_score = sum(pronunciation_scores) / len(pronunciation_scores) if pronunciation_scores else 0

            # Calculate duration
            total_duration = sum(r.get('Duration', 0) for r in all_results)
            audio_duration_sec = total_duration / 10000000 if total_duration else 5

            # Build word_score_list
            word_score_list = [self._map_azure_to_frontend_word(w) for w in all_words]

            # Fluency metrics
            fluency_metrics = self._calculate_fluency_metrics(all_words, audio_duration_sec)

            response = {
                'status': 'success',
                'speech_score': {
                    'transcript': full_transcript,
                    'word_score_list': word_score_list,
                    'scores': {
                        'pronunciation': round(pronunciation_score, 1),  # PronScore
                        'fluency': round(fluency_score, 1),              # FluencyScore
                        'accuracy': round(accuracy_score, 1),            # AccuracyScore
                        'grammar': None,      # Will be filled by OpenAI
                        'vocab': None,        # Will be filled by OpenAI
                        'coherence': None     # Will be filled by OpenAI
                    },
                    'fluency': fluency_metrics,
                    'detected_dialect': {'lang_id': language}
                },
                '_raw_azure_response': all_results
            }

            print(f"[Azure] Transcript: {full_transcript[:100]}..." if len(full_transcript) > 100 else f"[Azure] Transcript: {full_transcript}")
            print(f"[Azure] Scores - Accuracy: {accuracy_score:.1f}, Fluency: {fluency_score:.1f}, Prosody: {prosody_score:.1f}")

            if not full_transcript:
                return {
                    'status': 'error',
                    'error': 'No speech recognized',
                    'speech_score': {
                        'transcript': '',
                        'word_score_list': [],
                        'scores': {'pronunciation': 0, 'fluency': 0, 'accuracy': 0, 'grammar': None, 'vocab': None, 'coherence': None}
                    }
                }

            return response

        finally:
            # Clean up temp WAV file if we created one
            if needs_cleanup and os.path.exists(wav_path):
                try:
                    os.remove(wav_path)
                    print(f"[Azure] Cleaned up temp file: {wav_path}")
                except Exception:
                    pass

    def score_text(self, audio_file_path, text):
        """Evaluate scripted speech using CONTINUOUS recognition for full audio"""
        if not os.path.exists(audio_file_path):
            raise FileNotFoundError(f"Audio file not found: {audio_file_path}")

        if not text.strip():
            raise ValueError("Reference text is required for scripted evaluation")

        print(f"[Azure] Processing scripted audio: {audio_file_path}")
        print(f"[Azure] Reference text: {text[:80]}..." if len(text) > 80 else f"[Azure] Reference text: {text}")

        # Convert to WAV if needed (WebM, MP3, etc.)
        wav_path, needs_cleanup = self._convert_to_wav(audio_file_path)

        # Default to US English
        language = 'en-US'

        try:
            audio_config = speechsdk.audio.AudioConfig(filename=wav_path)

            # For scripted, enable_miscue must be False in continuous mode
            pronunciation_config = speechsdk.PronunciationAssessmentConfig(
                reference_text=text.strip(),
                grading_system=speechsdk.PronunciationAssessmentGradingSystem.HundredMark,
                granularity=speechsdk.PronunciationAssessmentGranularity.Phoneme,
                enable_miscue=False  # Must be False for continuous recognition
            )
            pronunciation_config.phoneme_alphabet = "IPA"
            pronunciation_config.enable_prosody_assessment()

            speech_recognizer = speechsdk.SpeechRecognizer(
                speech_config=self.speech_config,
                language=language,
                audio_config=audio_config
            )
            pronunciation_config.apply_to(speech_recognizer)

            # Storage
            all_results = []
            all_words = []
            all_transcripts = []
            accuracy_scores = []
            fluency_scores = []
            prosody_scores = []
            completeness_scores = []
            pronunciation_scores = []
            done = threading.Event()
            error_message = [None]

            def on_recognized(evt):
                if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech:
                    json_result = evt.result.properties.get(speechsdk.PropertyId.SpeechServiceResponse_JsonResult)
                    if json_result:
                        result_json = json.loads(json_result)
                        all_results.append(result_json)
                        all_transcripts.append(evt.result.text)

                        if result_json.get('NBest') and len(result_json['NBest']) > 0:
                            words = result_json['NBest'][0].get('Words', [])
                            all_words.extend(words)

                            pron = result_json['NBest'][0].get('PronunciationAssessment', {})
                            if pron.get('AccuracyScore') is not None:
                                accuracy_scores.append(pron['AccuracyScore'])
                            if pron.get('FluencyScore') is not None:
                                fluency_scores.append(pron['FluencyScore'])
                            if pron.get('ProsodyScore') is not None:
                                prosody_scores.append(pron['ProsodyScore'])
                            if pron.get('CompletenessScore') is not None:
                                completeness_scores.append(pron['CompletenessScore'])
                            if pron.get('PronScore') is not None:
                                pronunciation_scores.append(pron['PronScore'])

                    print(f"  [Segment] {evt.result.text[:60]}..." if len(evt.result.text) > 60 else f"  [Segment] {evt.result.text}")

            def on_canceled(evt):
                if evt.cancellation_details.reason == speechsdk.CancellationReason.Error:
                    error_message[0] = evt.cancellation_details.error_details
                    print(f"  [Error] {error_message[0]}")
                done.set()

            def on_session_stopped(evt):
                print("  [Session] Audio processing complete")
                done.set()

            speech_recognizer.recognized.connect(on_recognized)
            speech_recognizer.canceled.connect(on_canceled)
            speech_recognizer.session_stopped.connect(on_session_stopped)

            print("[Azure] Starting continuous recognition for scripted...")
            speech_recognizer.start_continuous_recognition()

            done.wait(timeout=120)
            speech_recognizer.stop_continuous_recognition()

            if error_message[0]:
                raise Exception(f"Azure Speech API error: {error_message[0]}")

            full_transcript = ' '.join(all_transcripts)
            print(f"\n[Azure] Total segments: {len(all_results)}, Total words: {len(all_words)}")

            accuracy_score = sum(accuracy_scores) / len(accuracy_scores) if accuracy_scores else 0
            fluency_score = sum(fluency_scores) / len(fluency_scores) if fluency_scores else 0
            prosody_score = sum(prosody_scores) / len(prosody_scores) if prosody_scores else 0
            completeness_score = sum(completeness_scores) / len(completeness_scores) if completeness_scores else 0
            pronunciation_score = sum(pronunciation_scores) / len(pronunciation_scores) if pronunciation_scores else 0

            total_duration = sum(r.get('Duration', 0) for r in all_results)
            audio_duration_sec = total_duration / 10000000 if total_duration else 5

            word_score_list = [self._map_azure_to_frontend_word(w) for w in all_words]

            fluency_metrics = self._calculate_fluency_metrics(all_words, audio_duration_sec)

            response = {
                'status': 'success',
                'text_score': {
                    'transcript': full_transcript,
                    'reference_text': text,
                    'word_score_list': word_score_list,
                    'scores': {
                        'pronunciation': round(pronunciation_score, 1),
                        'fluency': round(fluency_score, 1),
                        'accuracy': round(accuracy_score, 1),
                        'completeness': round(completeness_score, 1)
                    },
                    'fluency': fluency_metrics,
                    'detected_dialect': {'lang_id': language}
                },
                '_raw_azure_response': all_results
            }

            print(f"[Azure] Scores - Accuracy: {accuracy_score:.1f}, Fluency: {fluency_score:.1f}, Completeness: {completeness_score:.1f}")

            if not full_transcript:
                return {
                    'status': 'error',
                    'error': 'No speech recognized',
                    'text_score': {
                        'transcript': '',
                        'reference_text': text,
                        'word_score_list': [],
                        'scores': {'pronunciation': 0, 'fluency': 0, 'accuracy': 0, 'completeness': 0}
                    }
                }

            return response

        finally:
            # Clean up temp WAV file if we created one
            if needs_cleanup and os.path.exists(wav_path):
                try:
                    os.remove(wav_path)
                    print(f"[Azure] Cleaned up temp file: {wav_path}")
                except Exception:
                    pass
