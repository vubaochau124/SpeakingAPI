"""
Batch Speech Evaluation Script

Reads BenchmarkSpeaking.csv and audio files from speech/ folder,
performs speech assessment, and outputs evaluation results with LLM reasoning.

Usage:
    python batch_evaluate.py
    python batch_evaluate.py --output results.csv
    python batch_evaluate.py --start 5 --end 10  # Process only questions 5-10
"""

import os
import sys
import csv
import json
import argparse
import time
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

from azure_api import AzureSpeechAPI
from openai_evaluator import OpenAIEvaluator
from utils.audio import convert_to_wav
from utils.scoring import calculate_azure_score

# Default paths (relative to this script)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
DEFAULT_CSV = os.path.join(ROOT_DIR, 'BenchmarkSpeaking.csv')
DEFAULT_AUDIO_DIR = os.path.join(ROOT_DIR, 'speech')
DEFAULT_OUTPUT = os.path.join(ROOT_DIR, 'evaluation_results.csv')


def find_audio_file(audio_dir: str, question_num: int) -> str | None:
    """Find audio file for a question number, handling typos in filenames."""
    # Try different naming patterns (including typos like 'quesion')
    patterns = [
        f'question{question_num}.mp3',
        f'question{question_num}.wav',
        f'quesion{question_num}.mp3',  # Handle typo
        f'quesion{question_num}.wav',
        f'Question{question_num}.mp3',
        f'Question{question_num}.wav',
        f'{question_num}.mp3',
        f'{question_num}.wav',
    ]

    for pattern in patterns:
        filepath = os.path.join(audio_dir, pattern)
        if os.path.exists(filepath):
            return filepath

    return None


def evaluate_single_audio(
    audio_path: str,
    question: str,
    language: str = 'en-US',
    azure_client: AzureSpeechAPI = None,
    openai_client: OpenAIEvaluator = None
) -> dict:
    """Evaluate a single audio file and return all scores with LLM reasoning."""
    result = {
        'status': 'error',
        'error': None,
        'transcript': '',
        # Azure scores (0-100)
        'azure_pronunciation': None,
        'azure_fluency': None,
        'azure_accuracy': None,
        'azure_prosody': None,
        # IELTS bands (1-9)
        'pronunciation_band': None,
        'fluency_band': None,
        # OpenAI evaluation bands
        'coherence_band': None,
        'lexical_resource_band': None,
        'grammar_band': None,
        'topic_relevance_band': None,
        # Combined overall band
        'overall_band': None,
        # LLM Reasoning/Feedback
        'coherence_feedback': '',
        'coherence_justification': '',
        'lexical_feedback': '',
        'lexical_justification': '',
        'grammar_feedback': '',
        'grammar_errors': '',
        'grammar_justification': '',
        'topic_relevance_feedback': '',
        'topic_relevance_justification': '',
        # Improved answer
        'improved_answer': '',
        'improvements_made': '',
    }

    if azure_client is None:
        azure_client = AzureSpeechAPI()
    if openai_client is None:
        openai_client = OpenAIEvaluator()

    wav_path = None
    needs_cleanup = False

    try:
        # Step 1: Prepare audio
        wav_path, needs_cleanup = convert_to_wav(audio_path)

        # Step 2: Transcribe
        print(f"  [1/4] Transcribing...")
        whisper_result = azure_client._transcribe_with_timestamps(wav_path, language)
        transcript = whisper_result.get('text', '')

        if not transcript:
            result['error'] = 'No speech detected'
            return result

        result['transcript'] = transcript

        # Step 3: Azure pronunciation assessment
        print(f"  [2/4] Azure assessment...")
        azure_result = azure_client.assess_pronunciation_chunked(
            wav_path, transcript, language, whisper_result=whisper_result
        )

        azure_scores = calculate_azure_score(azure_result)
        raw_scores = azure_scores.get('raw_scores', {})

        result['azure_pronunciation'] = raw_scores.get('pronunciation')
        result['azure_fluency'] = raw_scores.get('fluency')
        result['azure_accuracy'] = raw_scores.get('accuracy')
        result['azure_prosody'] = raw_scores.get('prosody')
        result['pronunciation_band'] = azure_scores.get('pronunciation_band')
        result['fluency_band'] = azure_scores.get('fluency_band')

        # Step 4: OpenAI evaluation
        print(f"  [3/4] OpenAI evaluation...")
        openai_eval = openai_client.evaluate_chunked_parallel(
            transcript=transcript,
            question=question,
            azure_pronunciation_band=result['pronunciation_band'],
            azure_fluency_band=result['fluency_band']
        )

        openai_result = openai_eval.get('openai_result', {})
        combined_result = openai_eval.get('combined_result', {})

        # Extract bands and feedback
        coherence = openai_result.get('coherence', {})
        result['coherence_band'] = coherence.get('band')
        result['coherence_feedback'] = coherence.get('feedback', '')
        result['coherence_justification'] = json.dumps(coherence.get('justification', {}), ensure_ascii=False)

        lexical = openai_result.get('lexical_resource', {})
        result['lexical_resource_band'] = lexical.get('band')
        result['lexical_feedback'] = lexical.get('feedback', '')
        result['lexical_justification'] = json.dumps(lexical.get('justification', {}), ensure_ascii=False)

        grammar = openai_result.get('grammar', {})
        result['grammar_band'] = grammar.get('band')
        result['grammar_feedback'] = grammar.get('feedback', '')
        result['grammar_errors'] = json.dumps(grammar.get('errors', []), ensure_ascii=False)
        result['grammar_justification'] = json.dumps(grammar.get('justification', {}), ensure_ascii=False)

        topic = openai_result.get('topic_relevance', {})
        result['topic_relevance_band'] = topic.get('band')
        result['topic_relevance_feedback'] = topic.get('feedback', '')
        result['topic_relevance_justification'] = json.dumps(topic.get('justification', {}), ensure_ascii=False)

        result['overall_band'] = combined_result.get('overall_band')

        # Step 5: Generate improved answer
        print(f"  [4/4] Generating improved answer...")
        try:
            improved = openai_client._generate_improved_answer(transcript, question, openai_result)
            result['improved_answer'] = improved.get('improved_answer', '')
            result['improvements_made'] = json.dumps(improved.get('improvements_made', []), ensure_ascii=False)
        except Exception as e:
            print(f"  Warning: Failed to generate improved answer: {e}")

        result['status'] = 'success'

    except Exception as e:
        result['error'] = str(e)
        print(f"  Error: {e}")

    finally:
        if needs_cleanup and wav_path and os.path.exists(wav_path):
            try:
                os.remove(wav_path)
            except Exception:
                pass

    return result


def main():
    parser = argparse.ArgumentParser(description='Batch speech evaluation')
    parser.add_argument('--csv', default=DEFAULT_CSV, help='Input CSV file')
    parser.add_argument('--audio_dir', default=DEFAULT_AUDIO_DIR, help='Audio folder')
    parser.add_argument('--output', default=DEFAULT_OUTPUT, help='Output CSV file')
    parser.add_argument('--language', default='en-US', help='Language code')
    parser.add_argument('--start', type=int, default=1, help='Start question number')
    parser.add_argument('--end', type=int, default=None, help='End question number')

    args = parser.parse_args()

    print(f"\n{'='*60}")
    print(f"Batch Speech Evaluation")
    print(f"{'='*60}")
    print(f"CSV: {args.csv}")
    print(f"Audio: {args.audio_dir}")
    print(f"Output: {args.output}")
    print(f"{'='*60}\n")

    # Read CSV
    with open(args.csv, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    # Determine range
    end = args.end if args.end else len(rows)
    start = args.start

    print(f"Processing questions {start} to {end} (total: {end - start + 1})\n")

    # Initialize clients
    azure_client = AzureSpeechAPI()
    openai_client = OpenAIEvaluator()

    # Output columns
    output_columns = [
        'question_num', 'topic', 'question', 'reference_answer',
        'status', 'error', 'transcript',
        'azure_pronunciation', 'azure_fluency', 'azure_accuracy', 'azure_prosody',
        'pronunciation_band', 'fluency_band',
        'coherence_band', 'lexical_resource_band', 'grammar_band', 'topic_relevance_band',
        'overall_band',
        'coherence_feedback', 'coherence_justification',
        'lexical_feedback', 'lexical_justification',
        'grammar_feedback', 'grammar_errors', 'grammar_justification',
        'topic_relevance_feedback', 'topic_relevance_justification',
        'improved_answer', 'improvements_made'
    ]

    results = []
    start_time = time.time()

    for idx in range(start - 1, min(end, len(rows))):
        question_num = idx + 1
        row = rows[idx]

        topic = row.get('Topic', '')
        question = row.get('Question', '')
        reference_answer = row.get('Answer', '')

        print(f"[{question_num}/{end}] {topic}: {question[:50]}...")

        # Find audio file
        audio_path = find_audio_file(args.audio_dir, question_num)

        if not audio_path:
            print(f"  ✗ Audio not found for question {question_num}")
            result = {
                'question_num': question_num,
                'topic': topic,
                'question': question,
                'reference_answer': reference_answer,
                'status': 'error',
                'error': f'Audio file not found for question {question_num}'
            }
        else:
            print(f"  Audio: {os.path.basename(audio_path)}")
            eval_result = evaluate_single_audio(
                audio_path=audio_path,
                question=question,
                language=args.language,
                azure_client=azure_client,
                openai_client=openai_client
            )

            result = {
                'question_num': question_num,
                'topic': topic,
                'question': question,
                'reference_answer': reference_answer,
                **eval_result
            }

        results.append(result)

        # Print summary
        if result.get('status') == 'success':
            print(f"  ✓ Overall: {result.get('overall_band')} | "
                  f"Pron: {result.get('pronunciation_band')} | "
                  f"Gram: {result.get('grammar_band')} | "
                  f"Topic: {result.get('topic_relevance_band')}")
        print()

    # Write output
    with open(args.output, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=output_columns, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(results)

    elapsed = time.time() - start_time
    success_count = sum(1 for r in results if r.get('status') == 'success')

    print(f"\n{'='*60}")
    print(f"Complete!")
    print(f"{'='*60}")
    print(f"Processed: {len(results)} | Success: {success_count} | Failed: {len(results) - success_count}")
    print(f"Time: {elapsed:.1f}s ({elapsed/len(results):.1f}s avg)")
    print(f"Output: {args.output}")
    print(f"{'='*60}\n")


if __name__ == '__main__':
    main()
