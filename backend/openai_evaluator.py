import os
import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from openai import OpenAI
from dotenv import load_dotenv

# Import language-specific prompts
from evaluators.english_evaluator import PROMPTS_EN
from evaluators.japanese_evaluator import PROMPTS_JA
from evaluators.korean_evaluator import PROMPTS_KO
from evaluators.chinese_evaluator import PROMPTS_ZH


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

    def _get_prompts_for_language(self, language='en-US'):
        """Get the appropriate prompts based on language.

        Args:
            language (str): Language code (en-US, ja-JP, ko-KR, zh-CN)

        Returns:
            dict: Dictionary of prompts for each criterion
        """
        # Map language codes to prompt dictionaries
        language_prompts = {
            'en-US': PROMPTS_EN,
            'ja-JP': PROMPTS_JA,
            'ko-KR': PROMPTS_KO,
            'zh-CN': PROMPTS_ZH,
        }

        return language_prompts.get(language, PROMPTS_EN)

    def _evaluate_single_criterion(self, criterion, transcript, question=None, language='en-US'):
        """Evaluate a single criterion (for parallel execution)

        Args:
            criterion (str): One of 'coherence', 'lexical_resource', 'grammar', 'topic_relevance'
            transcript (str): Speech transcript
            question (str, optional): Question/context
            language (str): Language code for evaluation prompts

        Returns:
            tuple: (criterion_name, result_dict)
        """
        prompts = self._get_prompts_for_language(language)

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

            return (criterion, result)
        except Exception as e:
            print(f"[OPENAI-GPT] Error evaluating {criterion}: {e}", flush=True)
            return (criterion, {"band": 5.0, "feedback": f"Evaluation failed: {str(e)}"})

    def _generate_improved_answer(self, original_transcript, question, evaluation, language='en-US'):
        """Generate an improved version of the user's answer

        Args:
            original_transcript (str): Original user's answer
            question (str): The question asked
            evaluation (dict): Evaluation results
            language (str): Language code for prompts

        Returns:
            dict: Improved answer with explanation
        """
        prompts = self._get_prompts_for_language(language)
        improvement_system_prompt = prompts.get('improvement', IMPROVEMENT_PROMPT)
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
                {"role": "system", "content": improvement_system_prompt},
                {"role": "user", "content": improvement_prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.3
        )

        return json.loads(response.choices[0].message.content)

    def enhance_evaluation(self, transcript, question=None, azure_pronunciation_band=None, azure_fluency_band=None, language='en-US'):
        """Evaluate speech using language-appropriate criteria with parallel processing"""
        result = self.evaluate_chunked_parallel(
            transcript=transcript,
            question=question,
            azure_pronunciation_band=azure_pronunciation_band,
            azure_fluency_band=azure_fluency_band,
            language=language
        )
        improved_answer = self._generate_improved_answer(transcript, question, result['openai_result'], language)
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

    def evaluate_chunked_parallel(self, transcript, question=None, azure_pronunciation_band=None, azure_fluency_band=None, language='en-US'):
        """Evaluate all criteria in parallel using ThreadPoolExecutor"""
        criteria = ['coherence', 'lexical_resource', 'grammar', 'topic_relevance']
        results = {}

        with ThreadPoolExecutor(max_workers=4) as executor:
            futures = {executor.submit(self._evaluate_single_criterion, c, transcript, question, language): c for c in criteria}
            for future in futures:
                criterion, result = future.result()
                results[criterion] = result

        pronunciation_band = self._round_to_half(azure_pronunciation_band) if azure_pronunciation_band else 5.0
        fluency_band = self._round_to_half(azure_fluency_band) if azure_fluency_band else 5.0
        combined_result = self._calculate_combined_result(results, pronunciation_band, fluency_band)

        return {'openai_result': results, 'combined_result': combined_result}

    def evaluate_chunked_streaming(self, transcript, question=None, azure_pronunciation_band=None, azure_fluency_band=None, language='en-US'):
        """Generator that yields results as each criterion completes for streaming to frontend"""
        start_time = time.time()
        pronunciation_band = self._round_to_half(azure_pronunciation_band) if azure_pronunciation_band else 5.0
        fluency_band = self._round_to_half(azure_fluency_band) if azure_fluency_band else 5.0

        criteria = ['coherence', 'lexical_resource', 'grammar', 'topic_relevance']
        results = {}

        with ThreadPoolExecutor(max_workers=4) as executor:
            futures = {
                executor.submit(self._evaluate_single_criterion, c, transcript, question, language): c
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

    def generate_improved_answer_async(self, transcript, question, evaluation, language='en-US'):
        """Generate improved answer (public method for streaming scenarios)"""
        return self._generate_improved_answer(transcript, question, evaluation, language)
