import os
import json
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

# =============================================================================
# IELTS STANDARD CRITERIA - Cached as module-level constant to save tokens
# =============================================================================
# This prompt is stored as a constant and reused across all evaluations.
# OpenAI automatically caches identical prompt prefixes, saving tokens on
# subsequent requests with the same system message.
# =============================================================================

IELTS_CRITERIA = """
## IELTS STANDARD SCORING CRITERIA (Levels 1-5)
Note: Pronunciation and Fluency are scored separately by Azure Speech API.

### 1. Coherence
Ability to connect ideas, use connectors, and maintain logical flow in speech.

| Level | Description |
|-------|-------------|
| 1 (A2) | Limited ability to link sentences. Simple conjunctions only ("and," "but"). Can only produce simple answers, struggles to convey a coherent message. |
| 2 (B1) | Links simple sentences using basic connectors, sometimes overuses certain conjunctions. Can convey simple content clearly but struggles with complex ideas. |
| 3 (B2) | Has ability and desire to elaborate on sentences. Sometimes loses coherence due to repetition or unclear connections. Uses variety of conjunctions and discourse markers, but not always appropriately. |
| 4 (C1) | Develops topics clearly and logically with strong cohesion. Uses flexible and diverse connectors and discourse markers. Ideas are well-organized and easy to follow. |
| 5 (C2) | Speaks coherently with perfectly appropriate linguistic connections. Develops topics fully and logically. Seamless flow of ideas with sophisticated discourse markers. |

### 2. Lexical Resource
Range and flexibility of vocabulary; ability to use words beyond the topic; idioms, paraphrase; appropriate word choice.

| Level | Description |
|-------|-------------|
| 1 (A2) | Can only use simple vocabulary for personal information. Lacks vocabulary for less familiar topics. |
| 2 (B1) | Has enough vocabulary for familiar topics in work, study, and daily life. Starts using simple paraphrase when lacking a word. Still makes mistakes in word choice, expression not yet smooth. |
| 3 (B2) | Has fairly wide vocabulary for many topics including unfamiliar ones. Can choose appropriate words in context with good variety, but lacks precision on abstract topics. Uses paraphrase more flexibly. |
| 4 (C1) | Has wide, flexible vocabulary to express complex or abstract ideas accurately. Easily uses idioms, collocations, and paraphrase naturally. Can adjust speaking style according to context. |
| 5 (C2) | Uses rich, flexible, and accurate vocabulary in all situations. Idioms, collocations, and paraphrase used naturally and subtly. Can choose words that convey nuance, emotion, or style. |

### 3. Grammatical Range & Accuracy
Use of diverse sentence structures (simple, complex, subordinate clauses) and accurate expressions.

| Level | Description |
|-------|-------------|
| 1 (A2) | Only uses basic sentence forms with many grammatical errors. Only memorized sentences are accurate. |
| 2 (B1) | Forms basic sentences and a few simple sentences correctly. Rarely uses subordinate clauses, sentences are short, structures repeated frequently with errors. |
| 3 (B2) | Uses basic sentences reasonably and accurately. Does use some complex structures but often makes errors and may need correction. |
| 4 (C1) | Combines simple and complex sentences, uses diverse structures, but with limited flexibility. Makes frequent errors with complex structures but these do not impede communication. |
| 5 (C2) | Uses sentence structures accurately and consistently. Only makes minor errors, like those made by native speakers. |

### 4. Listening & Response (Topic Relevance)
Ability to understand the question/topic and respond appropriately with relevant content.

| Level | Description |
|-------|-------------|
| 1 (A2) | Can grasp main idea if the question is simple and clear. Understands simple instructions and familiar questions. Response may be partially off-topic. |
| 2 (B1) | Can follow familiar topics and respond with relevant content. Recognizes main idea and key details. May include some irrelevant information. |
| 3 (B2) | Understands main ideas and responds with relevant supporting details. Recognizes implied meaning in questions. Response is mostly on-topic with minor digressions. |
| 4 (C1) | Clearly understands complex questions and nuances. Responds with highly relevant and well-organized content. Addresses all aspects of the question. |
| 5 (C2) | Understands all nuances and subtleties in questions. Responds with perfectly relevant, comprehensive content. Demonstrates deep understanding of the topic. |
"""

# Cached system prompt - loaded once and reused for all evaluations
# Note: Pronunciation and Fluency are handled by Azure Speech API, not OpenAI
CACHED_SYSTEM_PROMPT = f"""You are an expert English language evaluator using IELTS-based assessment criteria.
Evaluate speech transcripts for 4 criteria (Pronunciation and Fluency are scored separately by Azure Speech API).
Return results in JSON format.

## IMPORTANT: TRANSCRIPTION CONTEXT
The text you are evaluating is a transcript generated from speech-to-text (audio transcription).
Be aware that some words may not be transcribed accurately due to:
- Plural forms (e.g., "skill" vs "skills") - the speaker may have said it correctly but transcription missed it
- Homophones (e.g., "their/there/they're", "your/you're")
- Word endings (-ed, -ing, -s) that may be unclear in audio
- Similar-sounding words or phrases
- Background noise or unclear pronunciation affecting transcription

When identifying grammar errors, focus on clear structural issues rather than potential transcription artifacts.
Give the speaker benefit of the doubt for ambiguous cases that could be transcription errors.

{IELTS_CRITERIA}

## SCORING INSTRUCTIONS:
- Score each criterion using IELTS band scores: 1.0 to 9.0 (with 0.5 increments)
- Map the criteria levels (1-5) to IELTS bands as follows:
  * Level 1 (A2) → Band 3.0-3.5
  * Level 2 (B1) → Band 4.0-5.0
  * Level 3 (B2) → Band 5.5-6.5
  * Level 4 (C1) → Band 7.0-8.0
  * Level 5 (C2) → Band 8.5-9.0
- Be thorough, specific, and accurate in your evaluation
- Provide actionable feedback for improvement
- Topic Relevance scoring should be based on how well the response addresses the question/context

## REQUIRED JSON OUTPUT STRUCTURE:
Return a JSON object with this EXACT structure (4 criteria only, NO pronunciation or fluency):
{{
  "coherence": {{
    "band": <float 1.0-9.0 in 0.5 increments>,
    "feedback": "<detailed assessment of logical flow, connectors, and idea organization>"
  }},
  "lexical_resource": {{
    "band": <float 1.0-9.0 in 0.5 increments>,
    "feedback": "<detailed assessment based on criteria>"
  }},
  "grammar": {{
    "band": <float 1.0-9.0 in 0.5 increments>,
    "feedback": "<detailed assessment based on criteria>",
    "errors": [
      {{
        "category": "<error type>",
        "original": "<problematic text>",
        "correction": "<corrected text>",
        "explanation": "<why this is an error>"
      }}
    ]
  }},
  "topic_relevance": {{
    "band": <float 1.0-9.0 in 0.5 increments>,
    "feedback": "<assessment of how well response addresses the question/topic>"
  }}
}}
"""

# Cached system prompt for improvement suggestions
CACHED_IMPROVEMENT_PROMPT = """You are an expert English teacher providing improved answer suggestions based on IELTS criteria.
Your task is to provide an improved version of the student's answer that fixes all identified issues while maintaining their original meaning and intent.
Return results in JSON format."""


class OpenAIEvaluator:
    """OpenAI integration for IELTS-based speech evaluation with prompt caching"""

    def __init__(self):
        """Initialize OpenAI client with cached prompts"""
        load_dotenv(override=True)

        self.api_key = os.getenv('OPENAI_API_KEY')

        print(f"[DEBUG] OpenAI API Key loaded: {bool(self.api_key)}")
        if self.api_key:
            print(f"[DEBUG] Key starts with: {self.api_key[:10]}...")

        if not self.api_key or self.api_key == 'your_openai_api_key_here':
            raise ValueError(
                "OPENAI_API_KEY environment variable not set or invalid.\n"
                "Please add your actual OpenAI API key to the .env file."
            )

        try:
            self.client = OpenAI(api_key=self.api_key)
            print("[DEBUG] OpenAI client initialized successfully")
        except Exception as e:
            raise ValueError(f"Failed to initialize OpenAI client: {str(e)}")

        # Store cached prompts as instance variables for reuse
        self._system_prompt = CACHED_SYSTEM_PROMPT
        self._improvement_prompt = CACHED_IMPROVEMENT_PROMPT

    def enhance_evaluation(self, transcript, question=None, azure_pronunciation_band=None, azure_fluency_band=None):
        """Evaluate speech using IELTS standard criteria with prompt caching

        Args:
            transcript (str): Transcribed speech text from speech recognition
            question (str, optional): Question/context for relevance evaluation
            azure_pronunciation_band (float, optional): Pronunciation band from Azure (1.0-9.0)
            azure_fluency_band (float, optional): Fluency band from Azure (1.0-9.0)

        Returns:
            dict: Contains openai_result (4 criteria) and combined_result (6 criteria with fluency & pronunciation from Azure)
        """
        print("Evaluating with IELTS standard criteria (cached prompt)...")

        # Build minimal user prompt - system prompt with criteria is cached
        user_prompt = self._build_user_prompt(transcript, question)

        # Use cached system prompt for token efficiency
        evaluation_response = self.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": self._system_prompt  # Cached IELTS criteria
                },
                {
                    "role": "user",
                    "content": user_prompt  # Only dynamic content
                }
            ],
            response_format={"type": "json_object"},
            temperature=0.3
        )

        openai_result = json.loads(evaluation_response.choices[0].message.content)

        # Generate improved answer suggestion
        print("Generating improved answer suggestion...")
        improved_answer = self._generate_improved_answer(transcript, question, openai_result)
        openai_result['improved_answer'] = improved_answer

        # Extract IELTS band scores from OpenAI result (4 criteria)
        coherence_band = openai_result.get('coherence', {}).get('band', 1.0) or 1.0
        lexical_band = openai_result.get('lexical_resource', {}).get('band', 1.0) or 1.0
        grammar_band = openai_result.get('grammatical_range_accuracy', {}).get('band', 1.0) or 1.0
        topic_band = openai_result.get('topic_relevance', {}).get('band', 1.0) or 1.0

        # Round bands to nearest 0.5
        coherence_band = self._round_to_half(coherence_band)
        lexical_band = self._round_to_half(lexical_band)
        grammar_band = self._round_to_half(grammar_band)
        topic_band = self._round_to_half(topic_band)

        # Use Azure bands if provided, otherwise default to 5.0
        pronunciation_band = azure_pronunciation_band if azure_pronunciation_band else 5.0
        pronunciation_band = self._round_to_half(pronunciation_band)

        fluency_band = azure_fluency_band if azure_fluency_band else 5.0
        fluency_band = self._round_to_half(fluency_band)

        # Calculate overall band (weighted average of 6 criteria)
        # Weights: Fluency 15%, Coherence 15%, Lexical 15%, Grammar 25%, Pronunciation 15%, Topic 15%
        overall_band = (
            fluency_band * 0.15 +
            coherence_band * 0.15 +
            lexical_band * 0.15 +
            grammar_band * 0.25 +
            pronunciation_band * 0.15 +
            topic_band * 0.15
        )
        overall_band = self._round_to_half(overall_band)

        # Build combined result with all 6 criteria
        combined_result = {
            'fluency': fluency_band,              # From Azure
            'coherence': coherence_band,          # From OpenAI
            'lexical_resource': lexical_band,     # From OpenAI
            'grammatical_range_accuracy': grammar_band,  # From OpenAI
            'pronunciation': pronunciation_band,   # From Azure
            'topic_relevance': topic_band,        # From OpenAI
            'overall_band': overall_band
        }

        return {
            'openai_result': openai_result,
            'combined_result': combined_result
        }

    def _round_to_half(self, value):
        """Round to nearest 0.5 for IELTS band scoring"""
        return round(value * 2) / 2

    def _build_user_prompt(self, transcript, question=None):
        """Build minimal user prompt with only dynamic content (transcript + question)"""
        prompt = f"""Evaluate the following speech transcript:

TRANSCRIPT:
"{transcript}"
"""
        if question:
            prompt += f"""
QUESTION/CONTEXT:
"{question}"
"""
        return prompt

    def _generate_improved_answer(self, original_transcript, question, evaluation):
        """Generate an improved version of the user's answer using cached prompt

        Args:
            original_transcript (str): Original user's answer
            question (str): The question asked
            evaluation (dict): IELTS evaluation results (OpenAI 4 criteria)

        Returns:
            dict: Improved answer with explanation
        """
        # Extract evaluation info from OpenAI result (IELTS bands)
        grammar_errors = evaluation.get('grammatical_range_accuracy', {}).get('errors', [])
        coherence_band = evaluation.get('coherence', {}).get('band', 'N/A')
        lexical_band = evaluation.get('lexical_resource', {}).get('band', 'N/A')
        grammar_band = evaluation.get('grammatical_range_accuracy', {}).get('band', 'N/A')
        topic_band = evaluation.get('topic_relevance', {}).get('band', 'N/A')

        # Minimal user prompt - system prompt is cached
        improvement_prompt = f"""Based on the IELTS evaluation, provide an IMPROVED VERSION of this answer.

ORIGINAL QUESTION:
{question if question else "General speaking task"}

ORIGINAL ANSWER:
"{original_transcript}"

EVALUATION SUMMARY:
- Grammar errors: {len(grammar_errors)} errors
- Coherence band: {coherence_band}/9.0
- Lexical Resource band: {lexical_band}/9.0
- Grammar band: {grammar_band}/9.0
- Topic Relevance band: {topic_band}/9.0

Provide a JSON response:
{{
  "improved_answer": "<improved version fixing all issues>",
  "improvements_made": ["<specific improvement 1>", "<specific improvement 2>"],
  "estimated_band": {{
    "coherence": <float 1.0-9.0>,
    "lexical_resource": <float 1.0-9.0>,
    "grammatical_range_accuracy": <float 1.0-9.0>,
    "topic_relevance": <float 1.0-9.0>
  }}
}}

GUIDELINES:
1. Fix ALL grammar errors
2. Use more sophisticated vocabulary
3. Add connectives for better coherence
4. Maintain original meaning
5. Keep natural, conversational tone
"""

        response = self.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": self._improvement_prompt  # Cached prompt
                },
                {
                    "role": "user",
                    "content": improvement_prompt
                }
            ],
            response_format={"type": "json_object"},
            temperature=0.3
        )

        return json.loads(response.choices[0].message.content)
