import os
import json
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()


class OpenAIEvaluator:
    """OpenAI integration for enhanced grammar, vocabulary, and coherence evaluation"""

    def __init__(self):
        """Initialize OpenAI client"""
        # Reload environment variables to ensure .env is loaded
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

    def enhance_evaluation(self, transcript, question=None):
        """Enhance grammar, vocabulary, coherence, and error evaluation using GPT-4

        Args:
            transcript (str): Transcribed speech text from SpeechAce
            question (str, optional): Question/context for relevance evaluation

        Returns:
            dict: Enhanced evaluation results for grammar, vocab, coherence, and relevance
        """
        print("Enhancing evaluation with OpenAI GPT-4...")

        # Step 1: Get evaluation
        evaluation_prompt = self._build_enhancement_prompt(transcript, question)

        evaluation_response = self.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert English language evaluator specializing in grammar, vocabulary, coherence, and IELTS assessment. Provide detailed, accurate linguistic analysis in JSON format."
                },
                {
                    "role": "user",
                    "content": evaluation_prompt
                }
            ],
            response_format={"type": "json_object"},
            temperature=0.3
        )

        result = json.loads(evaluation_response.choices[0].message.content)

        # Step 2: Generate improved answer suggestion
        print("Generating improved answer suggestion...")
        improved_answer = self._generate_improved_answer(transcript, question, result)
        result['improved_answer'] = improved_answer

        return result

    def _generate_improved_answer(self, original_transcript, question, evaluation):
        """Generate an improved version of the user's answer

        Args:
            original_transcript (str): Original user's answer
            question (str): The question asked
            evaluation (dict): Evaluation results with errors and suggestions

        Returns:
            dict: Improved answer with explanation
        """
        improvement_prompt = f"""Based on the following speech transcript and its evaluation, provide an IMPROVED VERSION of the answer that fixes all the issues.

ORIGINAL QUESTION:
{question if question else "General speaking task"}

ORIGINAL ANSWER:
"{original_transcript}"

ISSUES FOUND:
- Grammar errors: {len(evaluation.get('grammar', {}).get('errors', []))} errors
- Grammar accuracy level: {evaluation.get('grammar', {}).get('overall_metrics', {}).get('grammatical_accuracy', {}).get('level', 'N/A')}
- Vocabulary level: {evaluation.get('vocab', {}).get('overall_metrics', {}).get('word_sophistication', {}).get('level', 'N/A')}
- Coherence level: {evaluation.get('coherence', {}).get('overall_metrics', {}).get('lexical_density', {}).get('level', 'N/A')}

Please provide a JSON response with:
{{
  "improved_answer": "<the improved version with all grammar errors fixed, better vocabulary, and enhanced coherence>",
  "improvements_made": [
    "<list of specific improvements made>",
    "<e.g., Fixed subject-verb agreement in 'he go' to 'he goes'>",
    "<e.g., Replaced vague 'thing' with specific 'concept'>",
    "<e.g., Added connective 'however' to improve coherence>"
  ],
  "estimated_ielts": {{
    "grammar": <0-9 score for improved version>,
    "vocab": <0-9 score for improved version>,
    "coherence": <0-9 score for improved version>
  }}
}}

GUIDELINES:
1. Fix ALL grammar errors identified
2. Replace vague words with specific, sophisticated vocabulary
3. Add appropriate connectives for better coherence
4. Maintain the same meaning and content as original
5. Keep natural, conversational tone (not overly formal)
6. Ensure the improved answer directly addresses the question
"""

        response = self.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert English teacher providing improved answer suggestions."
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

    def _build_enhancement_prompt(self, transcript, question=None):
        """Build comprehensive evaluation prompt for OpenAI"""

        prompt = f"""Analyze the following English speech transcript and provide comprehensive evaluation for grammar, vocabulary, and coherence. Point out errors and make suggestions for improvement.

TRANSCRIPT:
"{transcript}"
"""

        if question:
            prompt += f'\nQUESTION/CONTEXT:\n"{question}"\n'

        prompt += """
Return a JSON object with this EXACT structure:

{
  "grammar": {
    "overall_metrics": {
      "grammatical_accuracy": {
        "score": <integer 0-100>,
        "level": "<low|mid|high>",
        "message": "<assessment of grammar correctness and error frequency>"
      },
      "grammatical_range": {
        "score": <integer 0-100>,
        "level": "<low|mid|high>",
        "message": "<evaluation of sentence structure complexity and variety>"
      }
    },
    "errors": [
      {
        "category": "<specific error type>",
        "message": "<original text> → Suggestion: <correction with <suggestion> tags>",
        "matched_text": "<exact problematic text>",
        "replacements": ["<corrected version>"],
        "span": [<start_char_position>, <end_char_position>]
      }
    ]
  },
  "vocab": {
    "overall_metrics": {
      "lexical_diversity": {
        "score": <integer 0-100>,
        "level": "<low|mid|high>",
        "message": "<Type-Token Ratio analysis and vocabulary variety>"
      },
      "word_sophistication": {
        "score": <integer 0-100>,
        "level": "<low|mid|high>",
        "message": "<use of advanced/academic vocabulary>"
      },
      "word_specificity": {
        "score": <integer 0-100>,
        "level": "<low|mid|high>",
        "message": "<precise vs vague language analysis>"
      },
      "academic_language_use": {
        "score": <integer 0-100>,
        "level": "<low|mid|high>",
        "message": "<formal register and academic tone>"
      },
      "collocation_commonality": {
        "score": <integer 0-100>,
        "level": "<low|mid|high>",
        "message": "<natural word combinations and collocations>"
      },
      "adverb_diversity": {
        "score": <integer 0-100>,
        "level": "<low|mid|high>",
        "message": "<variety and appropriate use of adverbs>"
      },
      "verb_diversity": {
        "score": <integer 0-100>,
        "level": "<low|mid|high>",
        "message": "<variety of verbs beyond basic ones>"
      }
    }
  },
  "coherence": {
    "overall_metrics": {
      "length": {
        "score": <integer 0-100>,
        "level": "<low|mid|high>",
        "message": "<assessment of response length adequacy and detail>"
      },
      "lexical_density": {
        "score": <integer 0-100>,
        "level": "<low|mid|high>",
        "message": "<ratio of content words to function words>"
      },
      "basic_connectives": {
        "score": <integer 0-100>,
        "level": "<low|mid|high>",
        "message": "<use of and, but, or, so>"
      },
      "causal_connectives": {
        "score": <integer 0-100>,
        "level": "<low|mid|high>",
        "message": "<use of because, therefore, thus, as a result>"
      },
      "negative_connectives": {
        "score": <integer 0-100>,
        "level": "<low|mid|high>",
        "message": "<use of however, although, despite, nevertheless>"
      }
    }
  },
"""

        if question:
            prompt += """  "relevance": {
    "class": "<On topic|Partially relevant|Off topic>",
    "explanation": "<detailed explanation of how well the response addresses the question>"
  },
"""

        prompt += """  "enhanced_ielts": {
    "grammar": <number 0-9 in 0.5 increments>,
    "vocab": <number 0-9 in 0.5 increments>,
    "coherence": <number 0-9 in 0.5 increments>
  }
}

EVALUATION INSTRUCTIONS:

**GRAMMAR ANALYSIS:**
1. Identify ALL grammatical errors with precision
2. Common error categories:
   - Subject-verb agreement ("he go" → "he goes")
   - Verb tense errors ("I go yesterday" → "I went yesterday")
   - Article errors ("I am teacher" → "I am a teacher")
   - Preposition errors ("depend of" → "depend on")
   - Word order ("I very much like" → "I like very much")
   - Pronoun errors ("me and John" → "John and I")
   - Singular/plural ("one of the student" → "one of the students")
   - Conditionals ("if I will" → "if I")
3. For each error:
   - Provide exact matched_text from transcript
   - Give corrected replacement
   - Calculate character span positions [start, end]
   - Format message as: "Original text → Suggestion: <suggestion>corrected text</suggestion>"
4. Score grammatical accuracy based on error frequency and severity
5. Score grammatical range based on complexity of structures used

**VOCABULARY ANALYSIS:**
1. Lexical diversity: Count unique words vs total words (Type-Token Ratio)
2. Word sophistication: Identify academic words, low-frequency words
3. Word specificity: Flag vague words (thing, stuff, get, do, nice)
4. Academic language: Formal register, nominalizations, precision
5. Collocations: Check for natural word pairings
6. Adverb diversity: Variety beyond simple time/place adverbs
7. Verb diversity: Use of varied verbs beyond be/have/do/make/get

**COHERENCE ANALYSIS:**
1. Response length: Assessment of response length adequacy and detail
2. Lexical density: Ratio of content words (nouns, verbs, adjectives, adverbs) to total words
3. Basic connectives: Count and, but, or, so
4. Causal connectives: Count because, therefore, thus, consequently, as a result
5. Negative connectives: Count however, although, despite, nevertheless, whereas
6. Discourse structure: Topic development, logical flow, paragraph organization

**IELTS SCORING (0-9 scale):**
- 9: Expert command
- 8: Very good command, rare inaccuracies
- 7: Good command, some inaccuracies
- 6: Effective command, some inaccuracies in unfamiliar situations
- 5: Partial command, frequent errors
- 4: Limited competence, frequent breakdown
- 3: Very limited ability
- 2: Isolated words only
- 1: No real communication

Be thorough, specific, and accurate. Provide actionable feedback.
"""

        return prompt
