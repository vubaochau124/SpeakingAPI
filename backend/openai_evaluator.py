import os
import json
import time
import hashlib
from functools import lru_cache
from concurrent.futures import ThreadPoolExecutor, as_completed
from openai import OpenAI
from dotenv import load_dotenv

# Import language-specific prompts
from evaluators.english_evaluator import PROMPTS_EN
from evaluators.japanese_evaluator import PROMPTS_JA
from evaluators.korean_evaluator import PROMPTS_KO
from evaluators.chinese_evaluator import PROMPTS_ZH

# ============================================================================
# PROMPT CACHING CONFIGURATION
# ============================================================================
# OpenAI Prompt Caching automatically caches prompts longer than 1024 tokens
# that are used repeatedly. To maximize cache hits:
# 1. Keep system prompts static and at the beginning of messages
# 2. Put dynamic content (transcript, question) at the end
# 3. Use the same prompt structure across requests
#
# Cached prompts are billed at 50% discount (input tokens)
# Cache is maintained for ~5-10 minutes of inactivity
# ============================================================================

# Pre-loaded language prompts (cached at module level - loaded once)
_LANGUAGE_PROMPTS = {
    'en-US': PROMPTS_EN,
    'ja-JP': PROMPTS_JA,
    'ko-KR': PROMPTS_KO,
    'zh-CN': PROMPTS_ZH,
}


@lru_cache(maxsize=32)
def _get_cached_prompts(language: str) -> dict:
    """Get prompts for language with LRU caching.

    This caches the prompt dictionary lookup to avoid repeated dict access.
    """
    return _LANGUAGE_PROMPTS.get(language, PROMPTS_EN)


@lru_cache(maxsize=128)
def _get_cached_system_prompt(language: str, criterion: str) -> str:
    """Get specific system prompt with LRU caching.

    Caches individual system prompts to avoid dict lookups on every call.
    """
    prompts = _get_cached_prompts(language)
    return prompts.get(criterion, '')


def clear_prompt_caches():
    """Clear all prompt caches. Call this after updating prompt files."""
    _get_cached_prompts.cache_clear()
    _get_cached_system_prompt.cache_clear()
    print("[OPENAI] Prompt caches cleared")


class OpenAIEvaluator:
    """OpenAI integration for IELTS-based speech evaluation with parallel chunked processing.

    Uses OpenAI's automatic Prompt Caching for cost savings:
    - System prompts are cached when they exceed 1024 tokens
    - Cached prompts get 50% discount on input tokens
    - Structure: [cached system prompt] + [dynamic user content]
    """

    def __init__(self):
        """Initialize OpenAI client with prompt caching support"""
        load_dotenv(override=True)
        self.api_key = os.getenv('OPENAI_API_KEY')
        if not self.api_key or self.api_key == 'your_openai_api_key_here':
            raise ValueError("OPENAI_API_KEY environment variable not set or invalid.")
        self.client = OpenAI(api_key=self.api_key)

        # Cache for tracking prompt cache statistics
        self._cache_stats = {
            'requests': 0,
            'cached_tokens': 0,
            'total_tokens': 0
        }

    def _round_to_half(self, value):
        """Round to nearest 0.5 for IELTS band scoring"""
        return round(value * 2) / 2

    def _get_prompts_for_language(self, language='en-US'):
        """Get the appropriate prompts based on language (cached).

        Args:
            language (str): Language code (en-US, ja-JP, ko-KR, zh-CN)

        Returns:
            dict: Dictionary of prompts for each criterion
        """
        return _get_cached_prompts(language)

    def _evaluate_single_criterion(self, criterion, transcript, question=None, language='en-US'):
        """Evaluate a single criterion (for parallel execution)

        Uses cached system prompts for OpenAI Prompt Caching optimization.
        OpenAI automatically caches prompts >1024 tokens at 50% discount.

        Args:
            criterion (str): One of 'coherence', 'lexical_resource', 'grammar', 'understanding'
            transcript (str): Speech transcript
            question (str, optional): Question/context
            language (str): Language code for evaluation prompts

        Returns:
            tuple: (criterion_name, result_dict)
        """
        # Use LRU-cached function to get system prompt (avoids repeated dict lookups)
        system_prompt = _get_cached_system_prompt(language, criterion)
        if not system_prompt:
            print(f"[OPENAI-GPT] WARNING: No prompt found for {criterion} in {language}", flush=True)
            return (criterion, None)

        # User prompt contains dynamic content - kept minimal and at the end
        # This structure maximizes OpenAI's automatic prompt caching
        user_prompt = f'TRANSCRIPT: "{transcript}"'
        if question:
            user_prompt += f'\n\nQUESTION/CONTEXT: "{question}"'

        start_time = time.time()
        print(f"[OPENAI-GPT] Starting {criterion}... (t={start_time:.2f})", flush=True)

        try:
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    # System prompt first - this gets cached by OpenAI
                    {"role": "system", "content": system_prompt},
                    # Dynamic user content last - not cached
                    {"role": "user", "content": user_prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.3
            )

            # Track cache statistics from response if available
            if hasattr(response, 'usage') and response.usage:
                self._cache_stats['requests'] += 1
                self._cache_stats['total_tokens'] += response.usage.prompt_tokens
                # Check for cached_tokens in usage (available in newer API versions)
                if hasattr(response.usage, 'prompt_tokens_details'):
                    cached = getattr(response.usage.prompt_tokens_details, 'cached_tokens', 0)
                    self._cache_stats['cached_tokens'] += cached

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

        Uses cached system prompts for OpenAI Prompt Caching optimization.

        Args:
            original_transcript (str): Original user's answer
            question (str): The question asked
            evaluation (dict): Evaluation results
            language (str): Language code for prompts

        Returns:
            dict: Improved answer with explanation
        """
        # Use LRU-cached function to get improvement prompt
        improvement_system_prompt = _get_cached_system_prompt(language, 'improvement')
        if not improvement_system_prompt:
            improvement_system_prompt = _get_cached_system_prompt('en-US', 'improvement')
        grammar_errors = evaluation.get('grammar', {}).get('errors', [])
        coherence_band = evaluation.get('coherence', {}).get('band', 'N/A')
        lexical_band = evaluation.get('lexical_resource', {}).get('band', 'N/A')
        grammar_band = evaluation.get('grammar', {}).get('band', 'N/A')
        understanding_band = evaluation.get('understanding', {}).get('band', 'N/A')

        # Get understanding analysis if available
        understanding_analysis = evaluation.get('understanding', {}).get('justification', {})
        misunderstood_aspects = understanding_analysis.get('comprehension_analysis', {}).get('misunderstood_aspects', [])
        understood_aspects = understanding_analysis.get('comprehension_analysis', {}).get('understood_aspects', [])

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
- Understanding band: {understanding_band}/9.0
- Aspects speaker understood well: {understood_aspects if understood_aspects else 'None identified'}
- Aspects speaker misunderstood: {misunderstood_aspects if misunderstood_aspects else 'None identified'}

Provide a JSON response:
{{
  "improved_answer": "<improved version that DIRECTLY ANSWERS THE QUESTION with better grammar, vocabulary, and coherence>",
  "improvements_made": ["<specific improvement 1>", "<specific improvement 2>"],
  "understanding_improvements": "<explain how the improved answer better demonstrates understanding of the question>",
  "estimated_band": {{
    "coherence": <float 1.0-9.0>,
    "lexical_resource": <float 1.0-9.0>,
    "grammar": <float 1.0-9.0>,
    "understanding": <float 1.0-9.0>
  }}
}}

GUIDELINES (in order of priority):
1. **ANSWER THE QUESTION** - The improved answer MUST demonstrate clear understanding of what is being asked
2. If original showed misunderstanding, create a NEW answer that correctly addresses the question while keeping any salvageable ideas
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
        understanding_band = results.get('understanding', {}).get('band', 5.0)

        overall_band = (
            fluency_band * 0.15 +
            coherence_band * 0.15 +
            lexical_band * 0.15 +
            grammar_band * 0.25 +
            pronunciation_band * 0.15 +
            understanding_band * 0.15
        )
        return {
            'fluency': fluency_band,
            'coherence': coherence_band,
            'lexical_resource': lexical_band,
            'grammar': grammar_band,
            'pronunciation': pronunciation_band,
            'understanding': understanding_band,
            'overall_band': self._round_to_half(overall_band)
        }

    def evaluate_chunked_parallel(self, transcript, question=None, azure_pronunciation_band=None, azure_fluency_band=None, language='en-US'):
        """Evaluate all criteria in parallel using ThreadPoolExecutor"""
        criteria = ['coherence', 'lexical_resource', 'grammar', 'understanding']
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

        criteria = ['coherence', 'lexical_resource', 'grammar', 'understanding']
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

    def get_cache_stats(self):
        """Get prompt caching statistics.

        Returns:
            dict: Cache statistics including:
                - requests: Total API requests made
                - total_tokens: Total input tokens used
                - cached_tokens: Tokens served from OpenAI cache (50% discount)
                - cache_hit_rate: Percentage of tokens from cache
                - estimated_savings: Estimated cost savings from caching
        """
        stats = self._cache_stats.copy()
        if stats['total_tokens'] > 0:
            stats['cache_hit_rate'] = round(stats['cached_tokens'] / stats['total_tokens'] * 100, 2)
            # Estimated savings: cached tokens cost 50% less
            # gpt-4o-mini: $0.15 per 1M input tokens
            saved_tokens = stats['cached_tokens']
            stats['estimated_savings_usd'] = round(saved_tokens * 0.15 / 1_000_000 * 0.5, 6)
        else:
            stats['cache_hit_rate'] = 0
            stats['estimated_savings_usd'] = 0
        return stats

    def reset_cache_stats(self):
        """Reset cache statistics"""
        self._cache_stats = {
            'requests': 0,
            'cached_tokens': 0,
            'total_tokens': 0
        }

    @staticmethod
    def clear_prompt_cache():
        """Clear the LRU prompt caches.

        Useful when prompts are updated and you want to reload them.
        """
        _get_cached_prompts.cache_clear()
        _get_cached_system_prompt.cache_clear()
        print("[OPENAI-GPT] Prompt caches cleared", flush=True)

    @staticmethod
    def get_prompt_cache_info():
        """Get LRU cache statistics for prompts.

        Returns:
            dict: Cache info for both prompt caches
        """
        return {
            'language_prompts': _get_cached_prompts.cache_info()._asdict(),
            'system_prompts': _get_cached_system_prompt.cache_info()._asdict()
        }
