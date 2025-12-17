"""AI Conversation Service - Handles interactive AI conversation logic"""
import os
import json
import time
import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from openai import OpenAI
from dotenv import load_dotenv

from azure_api import AzureSpeechAPI
from azure_tts import get_tts_service
from utils.audio import convert_to_wav, _get_safe_temp_path, UPLOAD_FOLDER

load_dotenv()

# TTS audio folder for AI responses
TTS_AUDIO_FOLDER = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'audio_tts')
os.makedirs(TTS_AUDIO_FOLDER, exist_ok=True)


class AIConversationService:
    """Service for managing AI conversation sessions"""

    # Default system prompt for custom topics
    DEFAULT_SYSTEM_PROMPT = """You are a friendly and encouraging English conversation partner. Your role is to:
1. Have natural, engaging conversations on the given topic
2. Ask follow-up questions to keep the conversation flowing
3. Respond in a way that's appropriate for language learners
4. Keep your responses concise (2-3 sentences typically)
5. Be patient and supportive

Important:
- Match the complexity of your language to the user's level
- If the user makes mistakes, don't correct them directly - just model correct usage naturally
- Keep the conversation interesting and on-topic
- Ask open-ended questions to encourage the user to speak more"""

    # Final evaluation prompt
    FINAL_EVALUATION_PROMPT = """You are an English speaking test evaluator. Evaluate this conversation and provide a brief, encouraging summary.

CONVERSATION:
{conversation_transcript}

TOPIC: {topic}

Provide a JSON response with this structure:
{{
    "overall_band": <float 1.0-9.0, IELTS-style band score>,
    "summary": {{
        "communication": "<1-2 sentences about overall communication effectiveness>",
        "pronunciation": "<1-2 sentences about pronunciation quality based on the conversation flow>",
        "language": "<1-2 sentences about vocabulary and grammar usage>",
        "conversation": "<1-2 sentences about conversation skills, turn-taking, topic development>"
    }},
    "encouragement": "<1 encouraging sentence for the learner>"
}}

Guidelines:
- Be encouraging and constructive
- Focus on strengths first, then areas for improvement
- Keep feedback concise and actionable
- Base pronunciation assessment on how naturally the conversation flowed"""

    def __init__(self):
        """Initialize the AI conversation service"""
        self.openai_client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
        self.azure_client = AzureSpeechAPI()
        self.tts_service = get_tts_service()

    def _get_conversation_history(self, turns: List[Any]) -> List[Dict[str, str]]:
        """Convert database turns to OpenAI message format"""
        messages = []
        for turn in turns:
            if turn.ai_text:
                messages.append({"role": "assistant", "content": turn.ai_text})
            if turn.user_transcript:
                messages.append({"role": "user", "content": turn.user_transcript})
        return messages

    def _get_full_transcript(self, turns: List[Any], topic: str) -> str:
        """Get full conversation transcript for evaluation"""
        lines = [f"Topic: {topic}\n"]
        for turn in turns:
            if turn.ai_text:
                lines.append(f"AI: {turn.ai_text}")
            if turn.user_transcript:
                lines.append(f"User: {turn.user_transcript}")
        return "\n".join(lines)

    def generate_opening_message(self, topic: str, system_prompt: str = None, language: str = 'en-US') -> str:
        """Generate an opening message for a custom topic"""
        if not system_prompt:
            system_prompt = self.DEFAULT_SYSTEM_PROMPT

        prompt = f"""The conversation topic is: "{topic}"

Generate a friendly, engaging opening message to start the conversation.
- Introduce the topic naturally
- Ask an open-ended question to get the user talking
- Keep it to 1-2 sentences
- Be warm and encouraging"""

        try:
            response = self.openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=150
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            print(f"[AI-CONV] Error generating opening: {e}")
            return f"Hi! Let's talk about {topic}. What are your thoughts on this?"

    def generate_ai_response(
        self,
        user_message: str,
        conversation_history: List[Dict[str, str]],
        system_prompt: str,
        topic: str
    ) -> str:
        """Generate AI response based on conversation history"""
        start_time = time.time()
        print(f"[AI-CONV] Generating response for: {user_message[:50]}...")

        # Build messages
        messages = [{"role": "system", "content": system_prompt}]

        # Add topic context
        messages.append({
            "role": "system",
            "content": f"Current conversation topic: {topic}"
        })

        # Add conversation history
        messages.extend(conversation_history)

        # Add latest user message
        messages.append({"role": "user", "content": user_message})

        try:
            response = self.openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                temperature=0.7,
                max_tokens=200
            )
            ai_text = response.choices[0].message.content.strip()
            elapsed = time.time() - start_time
            print(f"[AI-CONV] Response generated in {elapsed:.2f}s: {ai_text[:50]}...")
            return ai_text

        except Exception as e:
            print(f"[AI-CONV] Error generating response: {e}")
            return "I see. Could you tell me more about that?"

    def generate_tts_audio(self, text: str, language: str, session_id: int, turn_order: int) -> str:
        """Generate TTS audio for AI response

        Args:
            text: Text to convert to speech
            language: Language code
            session_id: Session ID for file naming
            turn_order: Turn order for file naming

        Returns:
            str: Relative path to audio file (for serving via API)
        """
        start_time = time.time()

        # Generate filename
        filename = f"session_{session_id}_turn_{turn_order}.wav"
        output_path = os.path.join(TTS_AUDIO_FOLDER, filename)

        try:
            print(f"[AI-CONV-TTS] Generating TTS to: {output_path}")
            print(f"[AI-CONV-TTS] TTS_AUDIO_FOLDER: {TTS_AUDIO_FOLDER}")

            self.tts_service.text_to_speech(text, language, output_path)
            elapsed = time.time() - start_time

            # Verify file was created
            if os.path.exists(output_path):
                file_size = os.path.getsize(output_path)
                print(f"[AI-CONV-TTS] Generated audio in {elapsed:.2f}s: {filename} ({file_size} bytes)")
            else:
                print(f"[AI-CONV-TTS] WARNING: File not found after generation: {output_path}")
                return None

            # Return relative path for API (matches router prefix + route)
            return f"/api/ai-conversation/audio/tts/{filename}"

        except Exception as e:
            print(f"[AI-CONV-TTS] Error generating TTS: {e}")
            import traceback
            traceback.print_exc()
            return None

    def transcribe_user_audio(self, audio_path: str, language: str = 'en-US') -> Dict[str, Any]:
        """Transcribe user audio using Whisper

        Returns:
            dict: {transcript: str, words: list}
        """
        start_time = time.time()
        print(f"[AI-CONV] Transcribing audio: {audio_path}")

        try:
            # Convert to WAV if needed
            wav_path, needs_cleanup = convert_to_wav(audio_path, enhance=True)

            try:
                # Use Whisper for transcription
                result = self.azure_client.transcribe_only(wav_path, language, return_timestamps=True)
                elapsed = time.time() - start_time
                transcript = result.get('text', '') if isinstance(result, dict) else result
                print(f"[AI-CONV] Transcribed in {elapsed:.2f}s: {transcript[:50]}...")

                return {
                    'transcript': transcript,
                    'words': result.get('words', []) if isinstance(result, dict) else []
                }

            finally:
                if needs_cleanup and os.path.exists(wav_path):
                    try:
                        os.remove(wav_path)
                    except Exception:
                        pass

        except Exception as e:
            print(f"[AI-CONV] Transcription error: {e}")
            return {'transcript': '', 'words': []}

    def assess_pronunciation(self, audio_path: str, transcript: str, language: str = 'en-US') -> Dict[str, Any]:
        """Assess pronunciation using Azure Speech SDK

        Returns:
            dict: Azure pronunciation assessment result
        """
        if not transcript:
            return None

        start_time = time.time()
        print(f"[AI-CONV] Assessing pronunciation...")

        try:
            wav_path, needs_cleanup = convert_to_wav(audio_path, enhance=False)  # Don't enhance for assessment

            try:
                result = self.azure_client.assess_pronunciation_only(wav_path, transcript, language)
                elapsed = time.time() - start_time
                print(f"[AI-CONV] Pronunciation assessed in {elapsed:.2f}s")
                return result

            finally:
                if needs_cleanup and os.path.exists(wav_path):
                    try:
                        os.remove(wav_path)
                    except Exception:
                        pass

        except Exception as e:
            print(f"[AI-CONV] Pronunciation assessment error: {e}")
            return None

    def calculate_final_evaluation(self, turns: List[Any], topic: str) -> Dict[str, Any]:
        """Calculate final evaluation for a completed conversation

        Args:
            turns: List of conversation turns
            topic: Conversation topic

        Returns:
            dict: Final evaluation with scores and feedback
        """
        start_time = time.time()
        print(f"[AI-CONV] Calculating final evaluation...")

        # Build conversation transcript
        conversation_transcript = self._get_full_transcript(turns, topic)

        # Calculate average pronunciation scores from Azure results
        pronunciation_scores = []
        for turn in turns:
            if turn.azure_result and isinstance(turn.azure_result, dict):
                speech_score = turn.azure_result.get('speech_score', {})
                scores = speech_score.get('scores', {})
                if scores.get('pronunciation'):
                    pronunciation_scores.append(scores['pronunciation'])

        avg_pronunciation = sum(pronunciation_scores) / len(pronunciation_scores) if pronunciation_scores else None

        # Get OpenAI evaluation
        try:
            prompt = self.FINAL_EVALUATION_PROMPT.format(
                conversation_transcript=conversation_transcript,
                topic=topic
            )

            response = self.openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are an IELTS speaking test evaluator."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.3
            )

            evaluation = json.loads(response.choices[0].message.content)

            # Add pronunciation data if available
            if avg_pronunciation:
                evaluation['pronunciation_score'] = round(avg_pronunciation, 1)

            # Calculate turn count and duration
            evaluation['turn_count'] = len([t for t in turns if t.user_transcript])
            if turns:
                first_turn = turns[0]
                last_turn = turns[-1]
                if first_turn.created_at and last_turn.created_at:
                    duration = (last_turn.created_at - first_turn.created_at).total_seconds()
                    evaluation['duration_minutes'] = round(duration / 60, 1)

            elapsed = time.time() - start_time
            print(f"[AI-CONV] Final evaluation completed in {elapsed:.2f}s")

            return evaluation

        except Exception as e:
            print(f"[AI-CONV] Final evaluation error: {e}")
            return {
                'overall_band': 5.0,
                'summary': {
                    'communication': 'Unable to generate detailed feedback.',
                    'pronunciation': 'Unable to assess.',
                    'language': 'Unable to assess.',
                    'conversation': 'Unable to assess.'
                },
                'encouragement': 'Keep practicing! Every conversation helps you improve.'
            }

    def save_user_audio(self, audio_file, session_id: int, turn_order: int) -> str:
        """Save user audio file

        Args:
            audio_file: UploadFile or file-like object
            session_id: Session ID
            turn_order: Turn order

        Returns:
            str: Saved filename
        """
        # Generate unique filename
        ext = os.path.splitext(audio_file.filename)[1] if hasattr(audio_file, 'filename') else '.webm'
        filename = f"user_{session_id}_{turn_order}_{uuid.uuid4().hex[:8]}{ext}"
        filepath = os.path.join(UPLOAD_FOLDER, filename)

        # Save file
        with open(filepath, 'wb') as f:
            if hasattr(audio_file, 'file'):
                f.write(audio_file.file.read())
            else:
                f.write(audio_file.read())

        return filename


# Singleton instance
_service_instance = None


def get_ai_conversation_service() -> AIConversationService:
    """Get or create singleton service instance"""
    global _service_instance
    if _service_instance is None:
        _service_instance = AIConversationService()
    return _service_instance
