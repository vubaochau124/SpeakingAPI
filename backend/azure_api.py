import os
import json
import threading
import tempfile
import time
import numpy as np
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from dotenv import load_dotenv
from openai import OpenAI
from utils.scoring import azure_score_to_ielts

# Results folder for debugging
RESULTS_FOLDER = os.path.join(os.path.dirname(__file__), 'results')
os.makedirs(RESULTS_FOLDER, exist_ok=True)

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
        """Convert audio to WAV format (16kHz mono 16-bit) and apply enhancement."""
        import shutil
        ext = os.path.splitext(audio_file_path)[1].lower()

        # Copy WAV to temp file for enhancement
        if ext == '.wav':
            wav_path = tempfile.mktemp(suffix='.wav')
            shutil.copy2(audio_file_path, wav_path)
            return self._enhance_audio(wav_path), True

        if not PYDUB_AVAILABLE:
            return audio_file_path, False

        try:
            audio = AudioSegment.from_file(audio_file_path, format=ext.lstrip('.') if ext else None)
            audio = audio.set_frame_rate(16000).set_channels(1).set_sample_width(2)
            wav_path = tempfile.mktemp(suffix='.wav')
            audio.export(wav_path, format='wav')
            return self._enhance_audio(wav_path), True
        except Exception:
            return audio_file_path, False

    def _enhance_audio(self, wav_path):
        """Enhance audio: noise reduction, high-pass filter, normalization, compression."""
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

            # 3. Normalize to -20 dBFS
            max_val = np.max(np.abs(audio_float))
            if max_val > 0:
                audio_float = audio_float * (10 ** (-20 / 20) / max_val)

            # 4. Soft compression
            threshold, ratio = 0.3, 4.0
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

    def _transcribe_audio(self, wav_path, language='en-US'):
        """Transcribe audio using OpenAI Whisper (falls back to Azure STT)."""
        try:
            openai_api_key = os.getenv('OPENAI_API_KEY')
            if not openai_api_key:
                return self._transcribe_audio_azure(wav_path, language)

            start_time = time.time()
            print(f"[WHISPER] Starting transcription... (t={start_time:.2f})")
            client = OpenAI(api_key=openai_api_key)
            whisper_lang = 'en' if language.lower().startswith('en') else 'en'

            with open(wav_path, 'rb') as audio_file:
                response = client.audio.transcriptions.create(
                    model="whisper-1", file=audio_file, language=whisper_lang, response_format="text"
                )
            result = response.strip() if isinstance(response, str) else str(response).strip()
            elapsed = time.time() - start_time
            print(f"[WHISPER] Completed in {elapsed:.2f}s. Transcript: {result[:80]}...")
            return result

        except Exception:
            return self._transcribe_audio_azure(wav_path, language)

    def _transcribe_with_timestamps(self, wav_path, language='en-US'):
        """Transcribe audio with word-level timestamps using Whisper.

        Returns:
            dict: {
                'text': full transcript,
                'words': [{'word': str, 'start': float, 'end': float}, ...]
            }
        """
        try:
            openai_api_key = os.getenv('OPENAI_API_KEY')
            if not openai_api_key:
                # Fallback: return text only without timestamps
                text = self._transcribe_audio_azure(wav_path, language)
                return {'text': text, 'words': []}

            start_time = time.time()
            print(f"[WHISPER-TS] Starting transcription with timestamps...")
            client = OpenAI(api_key=openai_api_key)
            whisper_lang = language.split('-')[0] if '-' in language else language

            with open(wav_path, 'rb') as audio_file:
                response = client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file,
                    language=whisper_lang,
                    response_format="verbose_json",
                    timestamp_granularities=["word"]
                )

            elapsed = time.time() - start_time
            text = response.text if hasattr(response, 'text') else str(response)
            words = []

            # Extract word-level timestamps
            if hasattr(response, 'words') and response.words:
                for w in response.words:
                    words.append({
                        'word': w.word if hasattr(w, 'word') else w.get('word', ''),
                        'start': w.start if hasattr(w, 'start') else w.get('start', 0),
                        'end': w.end if hasattr(w, 'end') else w.get('end', 0)
                    })

            print(f"[WHISPER-TS] Completed in {elapsed:.2f}s. {len(words)} words with timestamps")
            return {'text': text.strip(), 'words': words}

        except Exception as e:
            print(f"[WHISPER-TS] Error: {e}, falling back to text-only")
            text = self._transcribe_audio_azure(wav_path, language)
            return {'text': text, 'words': []}

    def _find_sentence_boundaries(self, words):
        """Find sentence ending positions from word list.

        Args:
            words: List of {'word': str, 'start': float, 'end': float}

        Returns:
            list: [(end_time_ms, word_index), ...] for each sentence ending
        """
        sentence_endings = []
        sentence_end_chars = '.!?。？！'  # Include Asian punctuation

        for i, word_info in enumerate(words):
            word = word_info.get('word', '').strip()
            if word and word[-1] in sentence_end_chars:
                end_time_ms = int(word_info.get('end', 0) * 1000)
                sentence_endings.append((end_time_ms, i))

        return sentence_endings

    def _transcribe_audio_azure(self, wav_path, language='en-US'):
        """Fallback: Speech-to-Text using Azure."""
        audio_config = speechsdk.audio.AudioConfig(filename=wav_path)
        speech_recognizer = speechsdk.SpeechRecognizer(
            speech_config=self.speech_config, language=language, audio_config=audio_config
        )

        all_transcripts = []
        done = threading.Event()
        error_message = [None]

        def on_recognized(evt):
            if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech:
                all_transcripts.append(evt.result.text)

        def on_canceled(evt):
            if evt.cancellation_details.reason == speechsdk.CancellationReason.Error:
                error_message[0] = evt.cancellation_details.error_details
            done.set()

        def on_session_stopped(evt):
            done.set()

        speech_recognizer.recognized.connect(on_recognized)
        speech_recognizer.canceled.connect(on_canceled)
        speech_recognizer.session_stopped.connect(on_session_stopped)

        speech_recognizer.start_continuous_recognition()
        done.wait(timeout=120)
        speech_recognizer.stop_continuous_recognition()

        return '' if error_message[0] else ' '.join(all_transcripts)

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

    def _run_continuous_assessment(self, wav_path, reference_text, language='en-US', enable_miscue=None, track_completeness=False):
        """Run continuous pronunciation assessment - shared logic for all assessment methods.

        Args:
            wav_path: Path to WAV file
            reference_text: Reference text for assessment
            language: Language code
            enable_miscue: Enable miscue detection (None = auto based on reference_text)
            track_completeness: Whether to track completeness score (for scripted mode)

        Returns:
            dict: Raw assessment results with scores and words
        """
        start_time = time.time()
        print(f"[AZURE] Starting pronunciation assessment... (t={start_time:.2f})")
        audio_config = speechsdk.audio.AudioConfig(filename=wav_path)

        if enable_miscue is None:
            enable_miscue = bool(reference_text)

        pronunciation_config = speechsdk.PronunciationAssessmentConfig(
            reference_text=reference_text,
            grading_system=speechsdk.PronunciationAssessmentGradingSystem.HundredMark,
            granularity=speechsdk.PronunciationAssessmentGranularity.Phoneme,
            enable_miscue=enable_miscue
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
        all_results, all_words, all_transcripts = [], [], []
        scores = {'accuracy': [], 'fluency': [], 'prosody': [], 'pronunciation': [], 'completeness': []}
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
                        all_words.extend(result_json['NBest'][0].get('Words', []))
                        pron = result_json['NBest'][0].get('PronunciationAssessment', {})
                        score_mapping = {
                            'AccuracyScore': 'accuracy',
                            'FluencyScore': 'fluency',
                            'ProsodyScore': 'prosody',
                            'PronScore': 'pronunciation',
                            'CompletenessScore': 'completeness'
                        }
                        for azure_key, score_key in score_mapping.items():
                            if pron.get(azure_key) is not None:
                                scores[score_key].append(pron[azure_key])

        def on_canceled(evt):
            if evt.cancellation_details.reason == speechsdk.CancellationReason.Error:
                error_message[0] = evt.cancellation_details.error_details
            done.set()

        def on_session_stopped(evt):
            done.set()

        speech_recognizer.recognized.connect(on_recognized)
        speech_recognizer.canceled.connect(on_canceled)
        speech_recognizer.session_stopped.connect(on_session_stopped)

        speech_recognizer.start_continuous_recognition()
        done.wait(timeout=120)
        speech_recognizer.stop_continuous_recognition()

        if error_message[0]:
            raise Exception(f"Azure Speech API error: {error_message[0]}")

        # Calculate averages
        avg = lambda lst: sum(lst) / len(lst) if lst else 0
        total_duration = sum(r.get('Duration', 0) for r in all_results)

        elapsed = time.time() - start_time
        final_scores = {
            'accuracy': round(avg(scores['accuracy']), 1),
            'fluency': round(avg(scores['fluency']), 1),
            'prosody': round(avg(scores['prosody']), 1),
            'pronunciation': round(avg(scores['pronunciation']), 1),
            'completeness': round(avg(scores['completeness']), 1) if track_completeness else None
        }
        print(f"[AZURE] Completed in {elapsed:.2f}s. Words: {len(all_words)}, Scores: {final_scores}")

        # Save Azure results to file
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        azure_result = {
            'timestamp': timestamp,
            'transcript': ' '.join(all_transcripts),
            'words': all_words,
            'results': all_results,
            'scores': final_scores,
            'duration_sec': total_duration / 10000000 if total_duration else 5
        }
        try:
            # Lưu raw JSON từ Azure (all_results)
            with open(os.path.join(RESULTS_FOLDER, 'azure_raw.json'), 'w', encoding='utf-8') as f:
                json.dump(all_results, f, indent=2, ensure_ascii=False)
            print(f"[AZURE] Raw results saved to results/azure_raw.json")
        except Exception as e:
            print(f"[AZURE] Failed to save results: {e}")

        return azure_result

    def prepare_audio(self, audio_file_path):
        """Prepare audio file - convert to WAV and enhance."""
        if not os.path.exists(audio_file_path):
            raise FileNotFoundError(f"Audio file not found: {audio_file_path}")
        return self._convert_to_wav(audio_file_path)

    def transcribe_only(self, wav_path, language='en-US'):
        """Get transcript using Whisper/Azure STT."""
        return self._transcribe_audio(wav_path, language) or ""

    def assess_pronunciation_only(self, wav_path, transcript, language='en-US'):
        """Pass 2 only: Run pronunciation assessment with given transcript."""
        result = self._run_continuous_assessment(wav_path, transcript, language)
        fluency_metrics = self._calculate_fluency_metrics(result['words'], result['duration_sec'])

        print(f"[AZURE] assess_pronunciation_only raw scores from _run_continuous_assessment: {result['scores']}", flush=True)

        return {
            'status': 'success',
            'speech_score': {
                'transcript': result['transcript'] or transcript,
                'word_score_list': result['words'],
                'scores': {
                    'pronunciation': result['scores']['pronunciation'],
                    'fluency': result['scores']['fluency'],
                    'accuracy': result['scores']['accuracy'],
                    'prosody': result['scores']['prosody'],
                    'grammar': None,
                    'vocab': None,
                    'coherence': None
                },
                'fluency': fluency_metrics,
                'detected_dialect': {'lang_id': language}
            },
            '_raw_azure_response': result['results']
        }

    def _split_audio_into_chunks(self, wav_path, chunk_duration_ms=30000, min_silence_len=500, silence_thresh=-40, sentence_boundaries=None):
        """Split audio into chunks, prioritizing sentence boundaries over silence.

        Priority order for split points:
        1. Sentence boundaries (from Whisper word timestamps)
        2. Silence points (from pydub detection)
        3. Fixed time intervals (fallback)

        Args:
            wav_path: Path to WAV file
            chunk_duration_ms: Target chunk duration in milliseconds (default 30s)
            min_silence_len: Minimum silence length to split on (ms)
            silence_thresh: Silence threshold in dB
            sentence_boundaries: List of (end_time_ms, word_index) from _find_sentence_boundaries

        Returns:
            list: List of (chunk_path, start_ms, end_ms) tuples
        """
        if not PYDUB_AVAILABLE:
            return [(wav_path, 0, None)]  # Return original if pydub not available

        try:
            from pydub import AudioSegment
            from pydub.silence import detect_silence

            audio = AudioSegment.from_wav(wav_path)
            total_duration = len(audio)

            # If audio is short enough, don't split
            if total_duration <= chunk_duration_ms * 1.5:
                print(f"[AZURE-CHUNK] Audio is {total_duration/1000:.1f}s, no splitting needed")
                return [(wav_path, 0, total_duration)]

            print(f"[AZURE-CHUNK] Splitting {total_duration/1000:.1f}s audio into ~{chunk_duration_ms/1000}s chunks")

            # Build list of valid split points
            split_points = []

            # Priority 1: Sentence boundaries (best quality splits)
            if sentence_boundaries:
                for end_time_ms, word_idx in sentence_boundaries:
                    if end_time_ms > 0:
                        split_points.append(('sentence', end_time_ms))
                print(f"[AZURE-CHUNK] Found {len(split_points)} sentence boundaries")

            # Priority 2: Silence points
            silences = detect_silence(audio, min_silence_len=min_silence_len, silence_thresh=silence_thresh)
            if silences:
                for silence_start, silence_end in silences:
                    silence_mid = (silence_start + silence_end) // 2
                    # Avoid duplicates near existing split points
                    is_duplicate = any(abs(silence_mid - sp[1]) < 1000 for sp in split_points)
                    if not is_duplicate:
                        split_points.append(('silence', silence_mid))
                print(f"[AZURE-CHUNK] Found {len(silences)} silence points")

            # Sort all split points by time
            split_points.sort(key=lambda x: x[1])

            chunks = []
            current_start = 0
            chunk_index = 0

            while current_start < total_duration:
                # Target end point
                target_end = min(current_start + chunk_duration_ms, total_duration)

                # If this is the last chunk or we're near the end, just take the rest
                if total_duration - target_end < chunk_duration_ms * 0.3:
                    target_end = total_duration
                    best_split = target_end
                    split_type = 'end'
                else:
                    # Find best split point near target_end (within ±7 seconds)
                    # Prefer sentence boundaries over silence
                    search_start = max(current_start + chunk_duration_ms * 0.5, target_end - 7000)
                    search_end = min(target_end + 7000, total_duration)

                    best_split = target_end
                    split_type = 'time'

                    # Look for sentence boundaries first
                    for sp_type, sp_time in split_points:
                        if search_start <= sp_time <= search_end and sp_time > current_start:
                            if sp_type == 'sentence':
                                best_split = sp_time
                                split_type = 'sentence'
                                break  # Sentence boundary found, use it
                            elif split_type != 'sentence':
                                # Use silence if no sentence boundary yet
                                best_split = sp_time
                                split_type = 'silence'

                # Extract chunk
                chunk_audio = audio[current_start:best_split]
                chunk_path = tempfile.mktemp(suffix=f'_chunk{chunk_index}.wav')
                chunk_audio.export(chunk_path, format='wav')

                chunks.append((chunk_path, current_start, best_split))
                print(f"[AZURE-CHUNK] Chunk {chunk_index}: {current_start/1000:.1f}s - {best_split/1000:.1f}s ({(best_split-current_start)/1000:.1f}s) [{split_type}]")

                current_start = best_split
                chunk_index += 1

                if current_start >= total_duration:
                    break

            print(f"[AZURE-CHUNK] Created {len(chunks)} chunks")
            return chunks

        except Exception as e:
            print(f"[AZURE-CHUNK] Error splitting audio: {e}, using original file")
            return [(wav_path, 0, None)]

    def _assess_single_chunk(self, chunk_info, transcript_words, language, chunk_index):
        """Assess a single audio chunk.

        Args:
            chunk_info: Tuple of (chunk_path, start_ms, end_ms)
            transcript_words: List of words expected in this chunk (approximate)
            language: Language code
            chunk_index: Index of this chunk for logging

        Returns:
            dict: Assessment result for this chunk
        """
        chunk_path, start_ms, end_ms = chunk_info
        chunk_transcript = ' '.join(transcript_words) if transcript_words else ""

        start_time = time.time()
        print(f"[AZURE-CHUNK {chunk_index}] Starting assessment for chunk {start_ms/1000:.1f}s-{end_ms/1000:.1f}s...")

        try:
            result = self._run_continuous_assessment(chunk_path, chunk_transcript, language)
            elapsed = time.time() - start_time
            print(f"[AZURE-CHUNK {chunk_index}] Completed in {elapsed:.2f}s, {len(result['words'])} words")

            # Add offset to word timings
            for word in result['words']:
                if 'Offset' in word:
                    word['Offset'] += int(start_ms * 10000)  # Convert ms to 100ns units

            return {
                'chunk_index': chunk_index,
                'start_ms': start_ms,
                'end_ms': end_ms,
                'result': result,
                'elapsed': elapsed
            }
        except Exception as e:
            print(f"[AZURE-CHUNK {chunk_index}] Error: {e}")
            return {
                'chunk_index': chunk_index,
                'start_ms': start_ms,
                'end_ms': end_ms,
                'result': None,
                'error': str(e)
            }

    def _merge_chunk_results(self, chunk_results):
        """Merge results from multiple chunks into a single result.

        Scoring is weighted by word count per chunk for accuracy.

        Args:
            chunk_results: List of chunk assessment results

        Returns:
            dict: Merged result matching _run_continuous_assessment format
        """
        # Sort by chunk index
        chunk_results = sorted(chunk_results, key=lambda x: x['chunk_index'])

        all_words = []
        all_results = []
        all_transcripts = []
        total_duration = 0

        # Weighted scores
        weighted_scores = {
            'accuracy': 0, 'fluency': 0, 'prosody': 0, 'pronunciation': 0
        }
        total_word_count = 0

        for chunk in chunk_results:
            if chunk.get('result') is None:
                continue

            result = chunk['result']
            words = result.get('words', [])
            word_count = len(words)

            if word_count == 0:
                continue

            all_words.extend(words)
            all_results.extend(result.get('results', []))
            all_transcripts.append(result.get('transcript', ''))
            total_duration += result.get('duration_sec', 0)

            # Weight scores by word count
            scores = result.get('scores', {})
            for key in weighted_scores:
                if scores.get(key) is not None:
                    weighted_scores[key] += scores[key] * word_count

            total_word_count += word_count

        # Calculate weighted averages
        final_scores = {}
        for key in weighted_scores:
            if total_word_count > 0:
                final_scores[key] = round(weighted_scores[key] / total_word_count, 1)
            else:
                final_scores[key] = 0
        final_scores['completeness'] = None

        print(f"[AZURE-CHUNK] Merged {len(chunk_results)} chunks: {total_word_count} total words, scores: {final_scores}")

        return {
            'timestamp': datetime.now().strftime('%Y%m%d_%H%M%S'),
            'transcript': ' '.join(all_transcripts),
            'words': all_words,
            'results': all_results,
            'scores': final_scores,
            'duration_sec': total_duration
        }

    def assess_pronunciation_chunked(self, wav_path, transcript, language='en-US', max_workers=4):
        """Run pronunciation assessment with parallel chunk processing for long audio.

        This method splits long audio into chunks and processes them in parallel,
        significantly reducing processing time for audio > 30 seconds.

        NEW: Uses Whisper word-level timestamps to find sentence boundaries,
        ensuring chunks are split at natural sentence endings instead of mid-sentence.

        Args:
            wav_path: Path to WAV file
            transcript: Full transcript text (can be empty, will use Whisper)
            language: Language code
            max_workers: Maximum parallel workers

        Returns:
            dict: Same format as assess_pronunciation_only
        """
        start_time = time.time()
        print(f"[AZURE-CHUNKED] Starting chunked pronunciation assessment...")

        # Step 1: Get word-level timestamps for sentence boundary detection
        whisper_result = self._transcribe_with_timestamps(wav_path, language)
        word_timestamps = whisper_result.get('words', [])
        whisper_transcript = whisper_result.get('text', '')

        # Use Whisper transcript if none provided
        if not transcript and whisper_transcript:
            transcript = whisper_transcript
            print(f"[AZURE-CHUNKED] Using Whisper transcript: {transcript[:80]}...")

        # Step 2: Find sentence boundaries from word timestamps
        sentence_boundaries = self._find_sentence_boundaries(word_timestamps) if word_timestamps else None
        if sentence_boundaries:
            print(f"[AZURE-CHUNKED] Found {len(sentence_boundaries)} sentence boundaries for smart chunking")

        # Step 3: Split audio using sentence boundaries
        chunks = self._split_audio_into_chunks(wav_path, sentence_boundaries=sentence_boundaries)

        # If only one chunk, use regular assessment
        if len(chunks) == 1 and chunks[0][0] == wav_path:
            print(f"[AZURE-CHUNKED] Single chunk, using regular assessment")
            return self.assess_pronunciation_only(wav_path, transcript, language)

        # Step 4: Split transcript into chunks using word timestamps (more accurate)
        chunk_word_lists = []

        if word_timestamps and len(chunks) > 1:
            # Use word timestamps to accurately assign words to chunks
            for chunk_path, start_ms, end_ms in chunks:
                chunk_words = []
                for w in word_timestamps:
                    word_start_ms = int(w.get('start', 0) * 1000)
                    word_end_ms = int(w.get('end', 0) * 1000)
                    # Word belongs to this chunk if its center is within chunk bounds
                    word_center = (word_start_ms + word_end_ms) / 2
                    if start_ms <= word_center < end_ms:
                        chunk_words.append(w.get('word', '').strip())
                chunk_word_lists.append(chunk_words)
            print(f"[AZURE-CHUNKED] Split transcript by timestamps: {[len(cw) for cw in chunk_word_lists]} words per chunk")
        else:
            # Fallback: Split transcript by duration ratio
            words = transcript.split()
            total_words = len(words)

            if total_words > 0 and len(chunks) > 1:
                total_duration = sum(c[2] - c[1] for c in chunks if c[2] is not None)
                if total_duration > 0:
                    for chunk_path, start_ms, end_ms in chunks:
                        chunk_duration = (end_ms - start_ms) if end_ms else 30000
                        word_ratio = chunk_duration / total_duration
                        word_count = max(1, int(total_words * word_ratio))
                        chunk_word_lists.append(words[:word_count])
                        words = words[word_count:]
                    if words and chunk_word_lists:
                        chunk_word_lists[-1].extend(words)
                else:
                    words_per_chunk = max(1, total_words // len(chunks))
                    for i in range(len(chunks)):
                        start_idx = i * words_per_chunk
                        end_idx = start_idx + words_per_chunk if i < len(chunks) - 1 else total_words
                        chunk_word_lists.append(words[start_idx:end_idx])
            else:
                chunk_word_lists = [[]] * len(chunks)

        # Process chunks in parallel
        chunk_results = []
        temp_files = []

        try:
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = {}
                for i, (chunk_info, word_list) in enumerate(zip(chunks, chunk_word_lists)):
                    if chunk_info[0] != wav_path:  # Track temp files for cleanup
                        temp_files.append(chunk_info[0])
                    future = executor.submit(
                        self._assess_single_chunk,
                        chunk_info,
                        word_list,
                        language,
                        i
                    )
                    futures[future] = i

                for future in as_completed(futures):
                    result = future.result()
                    chunk_results.append(result)

            # Merge results
            merged_result = self._merge_chunk_results(chunk_results)

            elapsed = time.time() - start_time
            print(f"[AZURE-CHUNKED] Total time: {elapsed:.2f}s for {len(chunks)} chunks")

            # Calculate fluency metrics
            fluency_metrics = self._calculate_fluency_metrics(
                merged_result['words'],
                merged_result['duration_sec']
            )

            # Save merged results
            try:
                with open(os.path.join(RESULTS_FOLDER, 'azure_raw.json'), 'w', encoding='utf-8') as f:
                    json.dump(merged_result['results'], f, indent=2, ensure_ascii=False)
                print(f"[AZURE-CHUNKED] Raw results saved to results/azure_raw.json")
            except Exception as e:
                print(f"[AZURE-CHUNKED] Failed to save results: {e}")

            return {
                'status': 'success',
                'speech_score': {
                    'transcript': merged_result['transcript'] or transcript,
                    'word_score_list': merged_result['words'],
                    'scores': {
                        'pronunciation': merged_result['scores']['pronunciation'],
                        'fluency': merged_result['scores']['fluency'],
                        'accuracy': merged_result['scores']['accuracy'],
                        'prosody': merged_result['scores']['prosody'],
                        'grammar': None,
                        'vocab': None,
                        'coherence': None
                    },
                    'fluency': fluency_metrics,
                    'detected_dialect': {'lang_id': language}
                },
                '_raw_azure_response': merged_result['results'],
                '_chunked': True,
                '_chunk_count': len(chunks),
                '_total_time': elapsed
            }

        finally:
            # Cleanup temp chunk files
            for temp_file in temp_files:
                try:
                    if os.path.exists(temp_file):
                        os.remove(temp_file)
                except Exception:
                    pass

    def score_audio(self, audio_file_path, relevance_context="", language='en-US'):
        """Evaluate speech using 2-pass approach: Whisper transcription + Azure pronunciation."""
        if not os.path.exists(audio_file_path):
            raise FileNotFoundError(f"Audio file not found: {audio_file_path}")

        wav_path, needs_cleanup = self._convert_to_wav(audio_file_path)

        try:
            # Pass 1: Transcription
            transcript = self._transcribe_audio(wav_path, language) or ""

            # Pass 2: Pronunciation assessment
            result = self._run_continuous_assessment(wav_path, transcript, language)
            fluency_metrics = self._calculate_fluency_metrics(result['words'], result['duration_sec'])

            if not result['transcript']:
                return {
                    'status': 'error',
                    'error': 'No speech recognized',
                    'speech_score': {
                        'transcript': '',
                        'word_score_list': [],
                        'scores': {'pronunciation': 0, 'fluency': 0, 'accuracy': 0, 'grammar': None, 'vocab': None, 'coherence': None}
                    }
                }

            return {
                'status': 'success',
                'speech_score': {
                    'transcript': result['transcript'],
                    'word_score_list': result['words'],
                    'scores': {
                        'pronunciation': result['scores']['pronunciation'],
                        'fluency': result['scores']['fluency'],
                        'accuracy': result['scores']['accuracy'],
                        'grammar': None,
                        'vocab': None,
                        'coherence': None
                    },
                    'fluency': fluency_metrics,
                    'detected_dialect': {'lang_id': language}
                },
                '_raw_azure_response': result['results']
            }

        finally:
            if needs_cleanup and os.path.exists(wav_path):
                try:
                    os.remove(wav_path)
                except Exception:
                    pass

    def score_text(self, audio_file_path, text, language='en-US'):
        """Evaluate scripted speech (reading given text)"""
        if not os.path.exists(audio_file_path):
            raise FileNotFoundError(f"Audio file not found: {audio_file_path}")
        if not text.strip():
            raise ValueError("Reference text is required for scripted evaluation")

        wav_path, needs_cleanup = self._convert_to_wav(audio_file_path)

        try:
            # For scripted, enable_miscue must be False in continuous mode
            result = self._run_continuous_assessment(
                wav_path, text.strip(), language,
                enable_miscue=False, track_completeness=True
            )
            fluency_metrics = self._calculate_fluency_metrics(result['words'], result['duration_sec'])

            if not result['transcript']:
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

            return {
                'status': 'success',
                'text_score': {
                    'transcript': result['transcript'],
                    'reference_text': text,
                    'word_score_list': result['words'],
                    'scores': {
                        'pronunciation': result['scores']['pronunciation'],
                        'fluency': result['scores']['fluency'],
                        'accuracy': result['scores']['accuracy'],
                        'completeness': result['scores']['completeness']
                    },
                    'fluency': fluency_metrics,
                    'detected_dialect': {'lang_id': language}
                },
                '_raw_azure_response': result['results']
            }

        finally:
            if needs_cleanup and os.path.exists(wav_path):
                try:
                    os.remove(wav_path)
                except Exception:
                    pass
