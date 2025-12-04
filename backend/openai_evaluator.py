import os
import json
import time
import sys
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from openai import OpenAI
from dotenv import load_dotenv

# Results folder for debugging
RESULTS_FOLDER = os.path.join(os.path.dirname(__file__), 'results')
os.makedirs(RESULTS_FOLDER, exist_ok=True)

# =============================================================================
# CHUNKED EVALUATION PROMPTS - One per criterion for parallel processing
# =============================================================================

COHERENCE_PROMPT = """You are an expert English evaluator. Evaluate ONLY the COHERENCE of this speech transcript.

COHERENCE CRITERIA (IELTS Levels 1-5):
Ability to connect ideas, use connectors, and maintain logical flow in speech.

| Level | Description |
|-------|-------------|
| 1 (A2) | Limited ability to link sentences. Simple conjunctions only ("and," "but"). Can only produce simple answers, struggles to convey a coherent message. |
| 2 (B1) | Links simple sentences using basic connectors, sometimes overuses certain conjunctions. Can convey simple content clearly but struggles with complex ideas. |
| 3 (B2) | Has ability and desire to elaborate on sentences. Sometimes loses coherence due to repetition or unclear connections. Uses variety of conjunctions and discourse markers, but not always appropriately. |
| 4 (C1) | Develops topics clearly and logically with strong cohesion. Uses flexible and diverse connectors and discourse markers. Ideas are well-organized and easy to follow. |
| 5 (C2) | Speaks coherently with perfectly appropriate linguistic connections. Develops topics fully and logically. Seamless flow of ideas with sophisticated discourse markers. |

SCORING: Map levels to IELTS bands: Level 1→Band 3.0-3.5, Level 2→Band 4.0-5.0, Level 3→Band 5.5-6.5, Level 4→Band 7.0-8.0, Level 5→Band 8.5-9.0

Return JSON with DETAILED justification:
{
  "band": <float 1.0-9.0>,
  "level": <1-5 which level they match>,
  "feedback": "<detailed assessment>",
  "justification": {
    "matched_criteria": "<which specific criteria description they match>",
    "connectors_used": ["<list connectors/discourse markers found>"],
    "strengths": ["<specific examples from transcript showing good coherence>"],
    "weaknesses": ["<specific examples showing lack of coherence>"],
    "reason_for_score": "<explain exactly why this band was given based on the criteria>"
  }
}"""

LEXICAL_PROMPT = """You are an expert English evaluator. Evaluate ONLY the LEXICAL RESOURCE of this speech transcript.

LEXICAL RESOURCE CRITERIA (IELTS Levels 1-5):
Range and flexibility of vocabulary; ability to use words beyond the topic; idioms, paraphrase; appropriate word choice.

| Level | Description |
|-------|-------------|
| 1 (A2) | Can only use simple vocabulary for personal information. Lacks vocabulary for less familiar topics. |
| 2 (B1) | Has enough vocabulary for familiar topics in work, study, and daily life. Starts using simple paraphrase when lacking a word. Still makes mistakes in word choice, expression not yet smooth. |
| 3 (B2) | Has fairly wide vocabulary for many topics including unfamiliar ones. Can choose appropriate words in context with good variety, but lacks precision on abstract topics. Uses paraphrase more flexibly. |
| 4 (C1) | Has wide, flexible vocabulary to express complex or abstract ideas accurately. Easily uses idioms, collocations, and paraphrase naturally. Can adjust speaking style according to context. |
| 5 (C2) | Uses rich, flexible, and accurate vocabulary in all situations. Idioms, collocations, and paraphrase used naturally and subtly. Can choose words that convey nuance, emotion, or style. |

SCORING: Map levels to IELTS bands: Level 1→Band 3.0-3.5, Level 2→Band 4.0-5.0, Level 3→Band 5.5-6.5, Level 4→Band 7.0-8.0, Level 5→Band 8.5-9.0

Return JSON with DETAILED justification:
{
  "band": <float 1.0-9.0>,
  "level": <1-5 which level they match>,
  "feedback": "<detailed assessment>",
  "justification": {
    "matched_criteria": "<which specific criteria description they match>",
    "vocabulary_examples": {
      "advanced_words": ["<sophisticated vocabulary used>"],
      "basic_words": ["<simple/basic vocabulary used>"],
      "idioms_collocations": ["<any idioms or collocations found>"],
      "word_choice_errors": ["<inappropriate word choices if any>"]
    },
    "strengths": ["<specific examples showing good vocabulary use>"],
    "weaknesses": ["<specific examples showing limited vocabulary>"],
    "reason_for_score": "<explain exactly why this band was given based on the criteria>"
  }
}"""

GRAMMAR_PROMPT = """You are an expert English evaluator. Evaluate ONLY the GRAMMAR of this speech transcript.

IMPORTANT: This is a speech-to-text transcript. Some errors may be transcription artifacts (plural forms, homophones, word endings, punctuation), so ignore them. Focus on clear structural issues.

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
  "band": <float 1.0-9.0>,
  "level": <1-5 which level they match>,
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
    "reason_for_score": "<explain exactly why this band was given based on the criteria>"
  }
}"""

TOPIC_RELEVANCE_PROMPT = """You are an expert English evaluator. Evaluate ONLY the TOPIC RELEVANCE of this speech transcript.

TOPIC RELEVANCE CRITERIA (IELTS Levels 1-5):
Ability to understand the question/topic and respond appropriately with relevant content.

| Level | Description |
|-------|-------------|
| 1 (A2) | Can grasp main idea if the question is simple and clear. Understands simple instructions and familiar questions. Response may be partially off-topic. |
| 2 (B1) | Can follow familiar topics and respond with relevant content. Recognizes main idea and key details. May include some irrelevant information. |
| 3 (B2) | Understands main ideas and responds with relevant supporting details. Recognizes implied meaning in questions. Response is mostly on-topic with minor digressions. |
| 4 (C1) | Clearly understands complex questions and nuances. Responds with highly relevant and well-organized content. Addresses all aspects of the question. |
| 5 (C2) | Understands all nuances and subtleties in questions. Responds with perfectly relevant, comprehensive content. Demonstrates deep understanding of the topic. |

SCORING: Map levels to IELTS bands: Level 1→Band 3.0-3.5, Level 2→Band 4.0-5.0, Level 3→Band 5.5-6.5, Level 4→Band 7.0-8.0, Level 5→Band 8.5-9.0

Return JSON with DETAILED justification:
{
  "band": <float 1.0-9.0>,
  "level": <1-5 which level they match>,
  "feedback": "<detailed assessment>",
  "justification": {
    "matched_criteria": "<which specific criteria description they match>",
    "question_analysis": {
      "main_topic": "<what the question is asking about>",
      "key_aspects": ["<specific aspects the question requires addressing>"]
    },
    "response_analysis": {
      "relevant_points": ["<parts of response that directly address the question>"],
      "irrelevant_points": ["<parts of response that are off-topic>"],
      "missing_aspects": ["<aspects of the question not addressed>"]
    },
    "strengths": ["<specific examples showing good relevance>"],
    "weaknesses": ["<specific examples showing lack of relevance>"],
    "reason_for_score": "<explain exactly why this band was given based on the criteria>"
  }
}"""

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
                temperature=0.3
            )
            result = json.loads(response.choices[0].message.content)
            # Round band to nearest 0.5
            if 'band' in result:
                result['band'] = self._round_to_half(result['band'])

            elapsed = time.time() - start_time
            print(f"[OPENAI-GPT] Completed {criterion} in {elapsed:.2f}s. Band: {result.get('band', 'N/A')}", flush=True)

            # Save each criterion result to file
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S_%f')
            try:
                with open(os.path.join(RESULTS_FOLDER, f'openai_{criterion}_{timestamp}.json'), 'w', encoding='utf-8') as f:
                    json.dump({'criterion': criterion, 'result': result, 'elapsed': elapsed}, f, indent=2, ensure_ascii=False)
            except Exception:
                pass

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
            temperature=0.3
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
