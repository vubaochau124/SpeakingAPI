"""Score calculation utilities"""

# Azure score thresholds mapped to IELTS bands
AZURE_TO_IELTS = [
    (95, 9.0), (90, 8.5), (85, 8.0), (80, 7.5), (75, 7.0),
    (70, 6.5), (65, 6.0), (60, 5.5), (55, 5.0), (50, 4.5),
    (45, 4.0), (40, 3.5), (35, 3.0), (30, 2.5), (20, 2.0), (10, 1.5)
]


def azure_score_to_ielts(azure_score):
    """Convert Azure 0-100 score to IELTS 1.0-9.0 band"""
    for threshold, band in AZURE_TO_IELTS:
        if azure_score >= threshold:
            return band
    return 1.0


def calculate_azure_score(results):
    """Calculate overall score from Azure results"""
    scores = results.get('speech_score', {}).get('scores', {})

    pronunciation = scores.get('pronunciation', 0) or 0
    fluency = scores.get('fluency', 0) or 0
    accuracy = scores.get('accuracy', 0) or 0
    prosody = scores.get('prosody', 0) or 0

    # Dùng PronScore trực tiếp từ Azure
    pronunciation_raw = pronunciation

    print(f"[SCORING] Raw Azure scores - pronunciation: {pronunciation}, fluency: {fluency}, accuracy: {accuracy}, prosody: {prosody}", flush=True)
    print(f"[SCORING] Weighted pronunciation: {pronunciation_raw} -> IELTS band: {azure_score_to_ielts(pronunciation_raw)}", flush=True)

    return {
        'raw_scores': {
            'pronunciation': pronunciation,
            'fluency': fluency,
            'accuracy': accuracy,
            'prosody': prosody
        },
        'pronunciation_band': azure_score_to_ielts(pronunciation_raw),
        'fluency_band': azure_score_to_ielts(fluency),
        'total_score': round(pronunciation_raw, 2)
    }
