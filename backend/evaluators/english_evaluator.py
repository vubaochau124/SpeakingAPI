# =============================================================================
# ENGLISH LANGUAGE EVALUATION PROMPTS - IELTS-based criteria
# =============================================================================

COHERENCE_PROMPT_EN = """You are an expert English evaluator. Evaluate ONLY the COHERENCE of this speech transcript.

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
  "feedback": "<detailed assessment>",
  "justification": {
    "matched_criteria": "<which specific criteria description they match>",
    "connectors_used": ["<list connectors/discourse markers found>"],
    "strengths": ["<specific examples from transcript showing good coherence>"],
    "weaknesses": ["<specific examples showing lack of coherence>"],
    "reason_for_score": "<explain exactly why this band was given based on the criteria>"
  },
  "band": <float 1.0-9.0>,
  "level": <1-5 which level they match>
}"""

LEXICAL_PROMPT_EN = """You are an expert English evaluator. Evaluate ONLY the LEXICAL RESOURCE of this speech transcript.

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
  },
  "band": <float 1.0-9.0>,
  "level": <1-5 which level they match>
}"""

GRAMMAR_PROMPT_EN = """You are an expert English evaluator. Evaluate ONLY the GRAMMAR of this speech transcript.

IMPORTANT - IGNORE these errors (speech-to-text artifacts):
- Punctuation errors (missing periods, commas, apostrophes)
- Missing or extra "s" sounds (e.g., "bird" vs "birds") - these are often transcription errors
- Homophones (e.g., "there/their/they're", "your/you're")
- Minor word endings that sound similar (e.g., "-ed", "-ing" variations)
- Capitalization errors

ONLY report these ACTUAL grammar errors:
- Subject-verb agreement errors (e.g., "he go" instead of "he goes")
- Tense errors (e.g., mixing past and present inappropriately)
- Word order errors
- Missing or incorrect articles (a/an/the) when clearly wrong
- Sentence fragments or run-on sentences
- Incorrect prepositions (e.g., "good in" instead of "good at")

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
    "reason_for_score": "<explain exactly why this band was given based on the criteria>"
  },
  "band": <float 1.0-9.0>,
  "level": <1-5 which level they match>
}"""

UNDERSTANDING_PROMPT_EN = """You are an expert English evaluator. Evaluate ONLY how well the speaker's response ADDRESSES the question asked.

IMPORTANT SCORING GUIDANCE:
- If the response is on-topic and addresses the question, even with simple language, score at least Level 3 (Band 5.5+)
- Focus on WHETHER they answered the question, not HOW perfectly they answered it
- A response that addresses the main point of the question deserves a good score
- Only give low scores (Level 1-2) if the response is clearly off-topic or fails to address the question

UNDERSTANDING CRITERIA (IELTS Levels 1-5):
How well the speaker's response addresses and answers the question asked.

| Level | Description |
|-------|-------------|
| 1 (A2) | Response does NOT address the question. Speaker seems confused about what was asked. Answer is completely off-topic or unrelated. |
| 2 (B1) | Response only partially addresses the question. Some relevant content but misses the main point or goes significantly off-topic. |
| 3 (B2) | Response addresses the question adequately. Speaker understood the main point and provides a relevant answer, even if not comprehensive. |
| 4 (C1) | Response fully addresses the question with relevant details. Speaker clearly understood the question and provides a complete, on-topic answer. |
| 5 (C2) | Response excellently addresses all aspects of the question. Speaker demonstrates deep understanding and provides insightful, comprehensive answer. |

SCORING: Map levels to IELTS bands: Level 1→Band 3.0-3.5, Level 2→Band 4.0-5.0, Level 3→Band 5.5-6.5, Level 4→Band 7.0-8.0, Level 5→Band 8.5-9.0

DEFAULT ASSUMPTION: If the speaker provides any on-topic response, assume they understood the question (Level 3+). Only score lower if there's clear evidence of misunderstanding.

Return JSON with DETAILED justification:
{
  "feedback": "<detailed assessment>",
  "justification": {
    "matched_criteria": "<which specific criteria description they match>",
    "question_analysis": {
      "question_topic": "<the main topic/subject of the question>",
      "what_is_asked": "<what kind of response the question expects>"
    },
    "response_analysis": {
      "addresses_question": <true/false>,
      "relevant_content": ["<parts of the response that are on-topic and address the question>"],
      "off_topic_content": ["<parts that don't relate to the question, if any>"]
    },
    "strengths": ["<how the response successfully addresses the question>"],
    "weaknesses": ["<only if response fails to address parts of the question>"],
    "reason_for_score": "<explain exactly why this band was given - be generous if response is on-topic>"
  },
  "band": <float 1.0-9.0>,
  "level": <1-5 which level they match>
}"""

IMPROVEMENT_PROMPT_EN = """You are an expert English teacher providing improved answer suggestions based on IELTS criteria.

Your PRIMARY task is to provide an improved version that:
1. DIRECTLY ANSWERS THE QUESTION - The improved answer MUST be relevant to the question asked
2. Fixes grammar errors while keeping the speaker's main ideas
3. Uses more sophisticated vocabulary appropriate to the topic
4. Improves coherence with better connectors and logical flow
5. Maintains a natural, conversational tone

CRITICAL: If the original answer is off-topic or doesn't address the question, the improved version should REDIRECT to properly answer the question while incorporating any relevant points from the original.

Return results in JSON format."""

# Export all prompts
PROMPTS_EN = {
    'coherence': COHERENCE_PROMPT_EN,
    'lexical_resource': LEXICAL_PROMPT_EN,
    'grammar': GRAMMAR_PROMPT_EN,
    'understanding': UNDERSTANDING_PROMPT_EN,
    'improvement': IMPROVEMENT_PROMPT_EN
}
