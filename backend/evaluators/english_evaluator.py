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

GRAMMAR_PROMPT_EN = """You are an expert English evaluator. Evaluate ONLY the GRAMMAR of this speech transcript.

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

TOPIC_RELEVANCE_PROMPT_EN = """You are an expert English evaluator. Evaluate ONLY the TOPIC RELEVANCE of this speech transcript.

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
    'topic_relevance': TOPIC_RELEVANCE_PROMPT_EN,
    'improvement': IMPROVEMENT_PROMPT_EN
}
