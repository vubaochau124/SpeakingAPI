import os
import requests
import json
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


class SpeechAceAPI:
    """SpeechAce API integration for speech evaluation"""

    # Correct SpeechAce API endpoint
    API_ENDPOINT = "https://api2.speechace.com"
    BASE_URL = API_ENDPOINT + "/api/scoring/speech/v9/json"
    TEXT_URL = API_ENDPOINT + "/api/scoring/text/v9/json"

    def __init__(self):
        """Initialize SpeechAce API client

        Loads API key from SPEECHACE_API_KEY environment variable
        """
        self.api_key = os.getenv('SPEECHACE_API_KEY')

        if not self.api_key:
            raise ValueError(
                "SPEECHACE_API_KEY environment variable not set.\n"
                "Please create a .env file with your API key or set the environment variable."
            )

    def score_audio(self, audio_file_path,
                   user_id="XYZ-ABC-99001",
                   dialect="en-us",
                   relevance_context="",
                   pronunciation_score_mode="default",
                   detect_dialect=1,
                   enforce_dialect=1,
                   include_ielts_feedback=1):
        """Send audio file to SpeechAce API for evaluation

        Args:
            audio_file_path (str): Path to audio file (wav, mp3, m4a, webm, ogg, aiff)
            user_id (str): User identifier
            dialect (str): Accent/dialect (en-us, en-gb, etc.)
            relevance_context (str): Optional context for relevance scoring
            pronunciation_score_mode (str): Scoring mode (default, comprehensive, etc.)
            detect_dialect (int): Detect dialect automatically (0 or 1)
            enforce_dialect (int): Enforce specified dialect (0 or 1)

        Returns:
            dict: API response with evaluation results
        """
        # Verify file exists
        if not os.path.exists(audio_file_path):
            raise FileNotFoundError(f"Audio file not found: {audio_file_path}")

        # Build URL with query parameters
        url = self.BASE_URL
        url += '?' + 'key=' + self.api_key
        url += '&dialect=' + dialect
        url += '&user_id=' + user_id

        # Prepare data payload (optional fields)
        payload = {
            'relevance_context': relevance_context,
            'question_info': relevance_context,
            'pronunciation_score_mode': pronunciation_score_mode,
            'detect_dialect': detect_dialect,
            'enforce_dialect': enforce_dialect,
            'include_ielts_feedback': include_ielts_feedback
        }

        print(f"Sending audio file to SpeechAce API: {audio_file_path}")

        # Open and send audio file
        user_file_handle = open(audio_file_path, 'rb')
        files = {'user_audio_file': user_file_handle}

        try:
            response = requests.post(url, data=payload, files=files, timeout=30)
        finally:
            user_file_handle.close()

        # Debug: Print response details
        print(f"\nResponse Status: {response.status_code}")

        # Check if response is successful
        if response.status_code != 200:
            print(f"\n❌ API Error - Status {response.status_code}")
            try:
                error_data = response.json()
                print(f"Error: {json.dumps(error_data, indent=2)}")
            except:
                print(f"Error Response: {response.text}")
            response.raise_for_status()

        return response.json()

    def score_text(self, audio_file_path, text,
                   user_id="XYZ-ABC-99001",
                   dialect="en-us",
                   include_fluency=1):
        """Send audio file with expected text to SpeechAce API for scripted evaluation

        Args:
            audio_file_path (str): Path to audio file
            text (str): Expected text the user should read
            user_id (str): User identifier
            dialect (str): Accent/dialect (en-us, en-gb, etc.)
            include_fluency (int): Include fluency scoring (0 or 1)

        Returns:
            dict: API response with evaluation results
        """
        if not os.path.exists(audio_file_path):
            raise FileNotFoundError(f"Audio file not found: {audio_file_path}")

        url = self.TEXT_URL
        url += '?' + 'key=' + self.api_key
        url += '&dialect=' + dialect
        url += '&user_id=' + user_id

        payload = {
            'text': text,
            'include_fluency': include_fluency
        }

        print(f"Sending audio file for text scoring: {audio_file_path}")

        user_file_handle = open(audio_file_path, 'rb')
        files = {'user_audio_file': user_file_handle}

        try:
            response = requests.post(url, data=payload, files=files, timeout=30)
        finally:
            user_file_handle.close()

        print(f"\nResponse Status: {response.status_code}")

        if response.status_code != 200:
            print(f"\n API Error - Status {response.status_code}")
            try:
                error_data = response.json()
                print(f"Error: {json.dumps(error_data, indent=2)}")
            except:
                print(f"Error Response: {response.text}")
            response.raise_for_status()

        return response.json()
