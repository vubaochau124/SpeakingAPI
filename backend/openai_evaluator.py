import os
import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from openai import OpenAI
from dotenv import load_dotenv

# =============================================================================
# CHUNKED EVALUATION PROMPTS - One per criterion for parallel processing
# =============================================================================

COHERENCE_PROMPT = """You are an expert IELTS Speaking examiner. 
The text you receive is a SPEECH-TO-TEXT TRANSCRIPTION of a spoken answer, not written text.

IMPORTANT:
- Ignore missing punctuation, sentence fragments, repetitions, fillers (e.g., "uh", "um"), and minor transcription errors.
- Evaluate coherence as it appears in SPOKEN DISCOURSE, not written essays.
- Focus on logical progression of ideas, spoken connectors, discourse markers, and overall flow.

Evaluate ONLY the COHERENCE of this speech transcript.

COHERENCE CRITERIA (IELTS Levels 1–5):
Ability to connect ideas, use spoken connectors, and maintain logical flow while speaking.

| Level | Description |
|-------|-------------|
| 1 (A2) | Limited ability to link ideas. Relies on very basic connectors ("and", "but"). Ideas appear disconnected or unclear. |
| 2 (B1) | Links ideas using basic spoken connectors ("because", "so", "then"). Some repetition or weak organization. |
| 3 (B2) | Can extend answers with supporting ideas. Uses a range of discourse markers, though sometimes unclear or repetitive. |
| 4 (C1) | Develops ideas clearly and logically. Uses flexible discourse markers ("on the one hand", "as a result"). Easy to follow. |
| 5 (C2) | Seamless and natural flow of ideas. Sophisticated, well-timed discourse markers. Fully coherent spoken response. |

SCORING:
Level 1 → Band 3.0–3.5  
Level 2 → Band 4.0–5.0  
Level 3 → Band 5.5–6.5  
Level 4 → Band 7.0–8.0  
Level 5 → Band 8.5–9.0

Return JSON with DETAILED justification:
{
  "feedback": "<spoken-coherence-focused feedback>",
  "justification": {
    "matched_criteria": "<matched IELTS spoken coherence description>",
    "connectors_used": ["<spoken connectors or discourse markers detected>"],
    "strengths": ["<examples of logical spoken progression>"],
    "weaknesses": ["<examples of unclear or broken flow>"],
    "reason_for_score": "<why this band fits IELTS coherence>",
  },
  "band": <float>,
  "level": <1-5>,
}
"""

LEXICAL_PROMPT = """You are an expert IELTS Speaking examiner.
The text you receive is a SPEECH-TO-TEXT TRANSCRIPTION.

IMPORTANT:
- Ignore minor word repetition, hesitation, or ASR misrecognition.
- Evaluate vocabulary as USED IN SPEAKING, not formal writing.
- Credit paraphrasing, circumlocution, and natural spoken expressions.

Evaluate ONLY the LEXICAL RESOURCE of this speech transcript.

LEXICAL RESOURCE CRITERIA (IELTS Levels 1–5):
Range, flexibility, precision of vocabulary in spoken English.

| Level | Description |
|-------|-------------|
| 1 (A2) | Uses very basic spoken vocabulary for personal topics only. |
| 2 (B1) | Adequate vocabulary for familiar topics. Uses simple paraphrase when stuck. |
| 3 (B2) | Good range of vocabulary for most topics. Some imprecision with abstract ideas. |
| 4 (C1) | Wide, flexible vocabulary. Uses idioms, collocations naturally in speech. |
| 5 (C2) | Rich, precise vocabulary with nuance, tone, and emotion fully expressed. |

SCORING:
Level 1 → Band 3.0–3.5  
Level 2 → Band 4.0–5.0  
Level 3 → Band 5.5–6.5  
Level 4 → Band 7.0–8.0  
Level 5 → Band 8.5–9.0

Return JSON with DETAILED justification:
{
  "feedback": "<spoken-lexical feedback>",
  "justification": {
    "matched_criteria": "<IELTS lexical level description>",
    "vocabulary_examples": {
      "advanced_words": ["<higher-level spoken vocabulary>"],
      "basic_words": ["<basic or repetitive vocabulary>"],
      "idioms_collocations": ["<spoken idioms/collocations if any>"],
      "word_choice_errors": ["<clear lexical misuse only>"]
    },
    "strengths": ["<effective spoken word use>"],
    "weaknesses": ["<limitations in spoken vocabulary>"],
    "reason_for_score": "<IELTS lexical justification>",
  },
  "band": <float 1.0-9.0>,
  "level": <1-5 which level they match>,
}
"""

GRAMMAR_PROMPT = """You are an expert English evaluator. Evaluate ONLY the GRAMMAR of this speech transcript.
IMPORTANT:
- This is a SPEECH-TO-TEXT transcription.
- Ignore ASR-related errors (missing articles, plural -s, verb endings).
- Evaluate grammar control as demonstrated in SPOKEN production.
- Focus on sentence variety, clause control, and communicative accuracy.

GRAMMAR CRITERIA (IELTS Levels 1-5):
Use of diverse sentence structures (simple, complex, subordinate clauses) and accurate expressions.

| Level | Description |
|-------|-------------|
| 1 (A2) | Only uses basic sentence forms with many grammatical errors. Only memorized sentences are accurate. |
| 2 (B1) | Forms basic sentences and a few simple sentences correctly. Rarely uses subordinate clauses, sentences are short, structures repeated frequently with errors. |
| 3 (B2) | Uses basic sentences reasonably and accurately. Does use some complex structures but often makes errors and may need correction. |
| 4 (C1) | Combines simple and complex sentences, uses diverse structures, but with limited flexibility. Makes frequent errors with complex structures but these do not impede communication. |
| 5 (C2) | Uses sentence structures accurately and consistently. Only makes minor errors, like those made by native speakers. |

SCORING: Map levels to IELTS bands: Level 1→Band 3.0-3.5, Level 2→Band 4.0-5.0, Level 3→Band 5.5-6.5, Level 4→Band 7.0-8.0, Level 5→Band 8.5-9.0

Return JSON with DETAILED justification:
{
  "feedback": "<detailed assessment>",
  "errors": [{"category": "<type>", "original": "<text>", "correction": "<fix>", "explanation": "<why>"}],
  "justification": {
    "matched_criteria": "<which specific criteria description they match>",
    "sentence_structures": {
      "simple_sentences": ["<examples of simple sentences>"],
      "complex_sentences": ["<examples of complex/compound sentences>"],
      "subordinate_clauses": ["<examples of subordinate clauses used>"]
    },
    "accuracy_analysis": {
      "correct_structures": ["<examples of correctly formed sentences>"],
      "error_patterns": ["<recurring error types>"]
    },
    "strengths": ["<specific examples showing good grammar>"],
    "weaknesses": ["<specific examples showing grammar issues>"],
    "reason_for_score": "<explain exactly why this band was given based on the criteria>",
  },
  "band": <float 1.0-9.0>,
  "level": <1-5 which level they match>,
}"""

TOPIC_RELEVANCE_PROMPT = """You are an expert IELTS Speaking examiner.
The text you receive is a SPEECH-TO-TEXT TRANSCRIPTION.

IMPORTANT:
- Evaluate relevance based on SPOKEN task response.
- Minor digressions are acceptable if they support the main idea.
- Penalize only clear misunderstanding or failure to address the question.

Evaluate ONLY the TOPIC RELEVANCE of this speech transcript.

TOPIC RELEVANCE CRITERIA (IELTS Levels 1–5):
Ability to understand the question and respond appropriately in spoken English.

| Level | Description |
|-------|-------------|
| 1 (A2) | Partial understanding. Response often off-topic or incomplete. |
| 2 (B1) | Understands main idea. Some irrelevant or repetitive content. |
| 3 (B2) | Mostly relevant response with minor digressions. |
| 4 (C1) | Fully relevant, well-developed spoken response. |
| 5 (C2) | Precise, nuanced, and fully appropriate response. |

SCORING:
Level 1 → Band 3.0–3.5  
Level 2 → Band 4.0–5.0  
Level 3 → Band 5.5–6.5  
Level 4 → Band 7.0–8.0  
Level 5 → Band 8.5–9.0

Return JSON with DETAILED justification:
{
  "feedback": "<spoken task-response feedback>",
  "justification": {
    "matched_criteria": "<IELTS relevance descriptor>",
    "question_analysis": {
      "main_topic": "<what the question asks>",
      "key_aspects": ["<required aspects>"]
    },
    "response_analysis": {
      "relevant_points": ["<on-topic spoken content>"],
      "irrelevant_points": ["<clear digressions>"],
      "missing_aspects": ["<unaddressed parts>"]
    },
    "strengths": ["<good relevance examples>"],
    "weaknesses": ["<relevance gaps>"],
    "reason_for_score": "<IELTS justification>",
  },
  "level": <1-5>,
  "band": <float>
}
"""

# Cached system prompt for improvement suggestions
IMPROVEMENT_PROMPT = """You are an expert English teacher providing improved answer suggestions based on IELTS criteria.

Your PRIMARY task is to provide an improved version that:
1. DIRECTLY ANSWERS THE QUESTION - The improved answer MUST be relevant to the question asked
2. Fixes grammar errors while keeping the speaker's main ideas
3. Uses more sophisticated vocabulary appropriate to the topic
4. Improves coherence with better connectors and logical flow
5. Maintains a natural, conversational tone

CRITICAL: If the original answer is off-topic or doesn't address the question, the improved version should REDIRECT to properly answer the question while incorporating any relevant points from the original.

Return results in JSON format."""


class OpenAIEvaluator:
    """OpenAI integration for IELTS-based speech evaluation with parallel chunked processing"""

    def __init__(self):
        """Initialize OpenAI client"""
        load_dotenv(override=True)
        self.api_key = os.getenv('OPENAI_API_KEY')
        if not self.api_key or self.api_key == 'your_openai_api_key_here':
            raise ValueError("OPENAI_API_KEY environment variable not set or invalid.")
        self.client = OpenAI(api_key=self.api_key)

    def _round_to_half(self, value):
        """Round to nearest 0.5 for IELTS band scoring"""
        return round(value * 2) / 2

    def _evaluate_single_criterion(self, criterion, transcript, question=None):
        """Evaluate a single criterion (for parallel execution)

        Args:
            criterion (str): One of 'coherence', 'lexical_resource', 'grammar', 'topic_relevance'
            transcript (str): Speech transcript
            question (str, optional): Question/context

        Returns:
            tuple: (criterion_name, result_dict)
        """
        prompts = {
            'coherence': COHERENCE_PROMPT,
            'lexical_resource': LEXICAL_PROMPT,
            'grammar': GRAMMAR_PROMPT,
            'topic_relevance': TOPIC_RELEVANCE_PROMPT
        }

        system_prompt = prompts.get(criterion)
        if not system_prompt:
            return (criterion, None)

        user_prompt = f'TRANSCRIPT: "{transcript}"'
        if question:
            user_prompt += f'\n\nQUESTION/CONTEXT: "{question}"'

        start_time = time.time()
        print(f"[OPENAI-GPT] Starting {criterion}... (t={start_time:.2f})", flush=True)

        try:
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0
            )
            result = json.loads(response.choices[0].message.content)
            # Round band to nearest 0.5
            if 'band' in result:
                result['band'] = self._round_to_half(result['band'])

            elapsed = time.time() - start_time
            print(f"[OPENAI-GPT] Completed {criterion} in {elapsed:.2f}s. Band: {result.get('band', 'N/A')}", flush=True)

            return (criterion, result)
        except Exception as e:
            print(f"[OPENAI-GPT] Error evaluating {criterion}: {e}", flush=True)
            return (criterion, {"band": 5.0, "feedback": f"Evaluation failed: {str(e)}"})

    def _generate_improved_answer(self, original_transcript, question, evaluation):
        """Generate an improved version of the user's answer

        Args:
            original_transcript (str): Original user's answer
            question (str): The question asked
            evaluation (dict): IELTS evaluation results

        Returns:
            dict: Improved answer with explanation
        """
        grammar_errors = evaluation.get('grammar', {}).get('errors', [])
        coherence_band = evaluation.get('coherence', {}).get('band', 'N/A')
        lexical_band = evaluation.get('lexical_resource', {}).get('band', 'N/A')
        grammar_band = evaluation.get('grammar', {}).get('band', 'N/A')
        topic_band = evaluation.get('topic_relevance', {}).get('band', 'N/A')

        # Get relevance analysis if available
        relevance_analysis = evaluation.get('topic_relevance', {}).get('justification', {})
        missing_aspects = relevance_analysis.get('response_analysis', {}).get('missing_aspects', [])
        irrelevant_points = relevance_analysis.get('response_analysis', {}).get('irrelevant_points', [])

        improvement_prompt = f"""Based on the IELTS evaluation, provide an IMPROVED VERSION of this answer.

**CRITICAL: THE IMPROVED ANSWER MUST DIRECTLY ADDRESS THE QUESTION**

ORIGINAL QUESTION:
"{question if question else "General speaking task"}"

ORIGINAL ANSWER:
"{original_transcript}"

EVALUATION SUMMARY:
- Grammar errors: {len(grammar_errors)} errors
- Coherence band: {coherence_band}/9.0
- Lexical Resource band: {lexical_band}/9.0
- Grammar band: {grammar_band}/9.0
- Topic Relevance band: {topic_band}/9.0
- Missing aspects from question: {missing_aspects if missing_aspects else 'None identified'}
- Off-topic content: {irrelevant_points if irrelevant_points else 'None identified'}

Provide a JSON response:
{{
  "improved_answer": "<improved version that DIRECTLY ANSWERS THE QUESTION with better grammar, vocabulary, and coherence>",
  "improvements_made": ["<specific improvement 1>", "<specific improvement 2>"],
  "relevance_improvements": "<explain how the improved answer better addresses the question>",
  "estimated_band": {{
    "coherence": <float 1.0-9.0>,
    "lexical_resource": <float 1.0-9.0>,
    "grammar": <float 1.0-9.0>,
    "topic_relevance": <float 1.0-9.0>
  }}
}}

GUIDELINES (in order of priority):
1. **ANSWER THE QUESTION** - The improved answer MUST be relevant to the question
2. If original was off-topic, create a NEW answer that addresses the question while keeping any salvageable ideas
3. Fix ALL grammar errors
4. Use more sophisticated vocabulary related to the topic
5. Add connectives for better coherence
6. Keep natural, conversational tone
"""

        response = self.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": IMPROVEMENT_PROMPT},
                {"role": "user", "content": improvement_prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0
        )

        return json.loads(response.choices[0].message.content)

    def enhance_evaluation(self, transcript, question=None, azure_pronunciation_band=None, azure_fluency_band=None):
        """Evaluate speech using IELTS criteria with parallel processing"""
        result = self.evaluate_chunked_parallel(
            transcript=transcript,
            question=question,
            azure_pronunciation_band=azure_pronunciation_band,
            azure_fluency_band=azure_fluency_band
        )
        improved_answer = self._generate_improved_answer(transcript, question, result['openai_result'])
        result['openai_result']['improved_answer'] = improved_answer
        return result

    def _calculate_combined_result(self, results, pronunciation_band, fluency_band):
        """Calculate combined result from individual criterion results"""
        coherence_band = results.get('coherence', {}).get('band', 5.0)
        lexical_band = results.get('lexical_resource', {}).get('band', 5.0)
        grammar_band = results.get('grammar', {}).get('band', 5.0)
        topic_band = results.get('topic_relevance', {}).get('band', 5.0)

        overall_band = (
            fluency_band * 0.15 +
            coherence_band * 0.15 +
            lexical_band * 0.15 +
            grammar_band * 0.25 +
            pronunciation_band * 0.15 +
            topic_band * 0.15
        )
        return {
            'fluency': fluency_band,
            'coherence': coherence_band,
            'lexical_resource': lexical_band,
            'grammar': grammar_band,
            'pronunciation': pronunciation_band,
            'topic_relevance': topic_band,
            'overall_band': self._round_to_half(overall_band)
        }

    def evaluate_chunked_parallel(self, transcript, question=None, azure_pronunciation_band=None, azure_fluency_band=None):
        """Evaluate all criteria in parallel using ThreadPoolExecutor"""
        criteria = ['coherence', 'lexical_resource', 'grammar', 'topic_relevance']
        results = {}

        with ThreadPoolExecutor(max_workers=4) as executor:
            futures = {executor.submit(self._evaluate_single_criterion, c, transcript, question): c for c in criteria}
            for future in futures:
                criterion, result = future.result()
                results[criterion] = result

        pronunciation_band = self._round_to_half(azure_pronunciation_band) if azure_pronunciation_band else 5.0
        fluency_band = self._round_to_half(azure_fluency_band) if azure_fluency_band else 5.0
        combined_result = self._calculate_combined_result(results, pronunciation_band, fluency_band)

        return {'openai_result': results, 'combined_result': combined_result}

    def evaluate_chunked_streaming(self, transcript, question=None, azure_pronunciation_band=None, azure_fluency_band=None):
        """Generator that yields results as each criterion completes for streaming to frontend"""
        start_time = time.time()
        pronunciation_band = self._round_to_half(azure_pronunciation_band) if azure_pronunciation_band else 5.0
        fluency_band = self._round_to_half(azure_fluency_band) if azure_fluency_band else 5.0

        criteria = ['coherence', 'lexical_resource', 'grammar', 'topic_relevance']
        results = {}

        with ThreadPoolExecutor(max_workers=4) as executor:
            futures = {
                executor.submit(self._evaluate_single_criterion, c, transcript, question): c
                for c in criteria
            }
            for future in as_completed(futures):
                criterion, result = future.result()
                results[criterion] = result
                yield {
                    'type': 'criterion',
                    'criterion': criterion,
                    'result': result,
                    'elapsed': round(time.time() - start_time, 2)
                }

        combined_result = self._calculate_combined_result(results, pronunciation_band, fluency_band)
        yield {
            'type': 'complete',
            'openai_result': results,
            'combined_result': combined_result,
            'elapsed': round(time.time() - start_time, 2)
        }

    def generate_improved_answer_async(self, transcript, question, evaluation):
        """Generate improved answer (public method for streaming scenarios)"""
        return self._generate_improved_answer(transcript, question, evaluation)
