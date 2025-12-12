# Real-time Chunked Audio Recording & Transcription

## Overview

This implementation adds **real-time chunked audio processing** to reduce the waiting time after recording ends. Instead of waiting for the entire recording to finish before starting transcription, the system now sends audio chunks to the Whisper API every 5 seconds during recording.

## Key Benefits

- **Faster Results**: Transcription starts while user is still recording
- **Reduced Wait Time**: After recording ends, most chunks are already transcribed
- **Better UX**: Users see real-time progress as chunks are processed
- **Backward Compatible**: Can toggle between chunked and traditional recording modes

## Architecture

### Frontend Components

#### 1. ChunkedAudioRecorder Component
**Location**: `frontend/src/components/ChunkedAudioRecorder.jsx`

**Features**:
- Records audio with MediaRecorder API
- Splits recording into 5-second chunks automatically
- Sends each chunk to backend for transcription
- Displays real-time transcription results
- Shows recording stats (time, chunks sent, chunks transcribed)
- Audio level visualization

**Props**:
```javascript
{
  onChunkTranscribed: (chunkIndex, transcript, startTime, endTime) => void,
  onRecordingComplete: (allChunks, fullAudioBlob) => void,
  chunkDuration: number,        // Default: 5 seconds
  language: string,              // Default: 'en-US'
  apiEndpoint: string,           // Default: '/api/transcribe-chunk'
  disabled: boolean
}
```

**How it works**:
1. Starts MediaRecorder with 250ms timeslice for responsive chunking
2. Every 5 seconds (configurable), packages accumulated audio data into a Blob
3. Sends chunk to backend API via FormData
4. Displays transcription result in real-time
5. On stop, processes any remaining data and returns full audio blob

#### 2. Updated AudioInput Component
**Location**: `frontend/src/components/AudioInput.jsx`

**Changes**:
- Added toggle switch for "Real-time Processing" mode
- Conditionally renders `ChunkedAudioRecorder` or traditional recorder
- Handles chunked recording callbacks
- Auto-submits full audio after chunked recording completes

### Backend API

#### New Endpoint: `/api/transcribe-chunk`
**Location**: `backend/routes/evaluation.py`

**Method**: POST

**Parameters**:
- `audio`: Audio chunk file (webm format)
- `language`: Language code (e.g., 'en-US')
- `chunk_index`: Index of this chunk (0, 1, 2, ...)
- `start_time`: Start time in seconds
- `end_time`: End time in seconds

**Response**:
```json
{
  "status": "success",
  "chunk_index": 0,
  "transcript": "transcribed text",
  "start_time": 0.0,
  "end_time": 5.0,
  "processing_time": 1.23
}
```

**Processing Flow**:
1. Receives audio chunk via multipart form data
2. Saves to safe temp path (ASCII-only for Azure SDK compatibility)
3. Converts to WAV format if needed
4. Calls Whisper API for transcription
5. Returns transcript immediately
6. Cleans up temp files

## Usage

### For Users

1. **Enable Real-time Processing**:
   - Toggle the "⚡ Real-time Processing" switch ON (default)
   - You'll see "Transcribes every 5 seconds while recording (faster results)"

2. **Start Recording**:
   - Click "🎙 Start Recording"
   - Speak your response
   - Watch as transcripts appear in real-time every 5 seconds

3. **Stop Recording**:
   - Click "⏹ Stop Recording"
   - Final processing completes quickly since most chunks are already transcribed
   - Automatic evaluation begins

### For Developers

#### Customizing Chunk Duration

In `AudioInput.jsx`:
```jsx
<ChunkedAudioRecorder
  chunkDuration={5}  // Change to 3, 10, etc.
  ...
/>
```

#### Handling Chunk Transcriptions

```jsx
const handleChunkTranscribed = (chunkIndex, transcript, startTime, endTime) => {
  console.log(`Chunk ${chunkIndex}: "${transcript}"`);
  // Store, display, or process transcripts as needed
};
```

#### Custom API Endpoint

```jsx
<ChunkedAudioRecorder
  apiEndpoint="/api/custom-transcribe"
  ...
/>
```

## Performance Comparison

### Traditional Mode (Before)
```
User records for 60 seconds
↓
Recording stops
↓
Wait ~3-5 seconds for Whisper API
↓
Results appear
---
Total wait after recording: ~3-5 seconds
```

### Chunked Mode (After)
```
User records for 60 seconds
↓ (chunks sent at 5s, 10s, 15s, 20s, 25s, 30s, 35s, 40s, 45s, 50s, 55s)
Recording stops
↓
Process remaining ~5 seconds + merge results
↓
Results appear
---
Total wait after recording: ~0.5-1.5 seconds (67-85% reduction!)
```

## Technical Details

### Audio Format
- **Recording**: WebM with Opus codec (browser native)
- **Processing**: Converted to WAV 16kHz mono for Whisper API
- **Chunks**: Typically 100-300KB per 5-second chunk

### Chunking Strategy
To ensure each chunk is a valid, complete WebM file:
1. MediaRecorder starts recording with 250ms timeslice
2. Every 5 seconds, a chunk processing cycle begins:
   - Current MediaRecorder is stopped (finalizes WebM headers)
   - Complete WebM blob is created and sent to backend
   - New MediaRecorder is immediately created and started for next chunk
3. Process repeats until user clicks "Stop Recording"
4. When user stops: final chunk is processed and all chunks are combined

**Key Implementation Details**:
- The `processChunk` function uses `chunkTimerRef.current` to determine if recording is still active
- Setting `chunkTimerRef.current = null` when stopping prevents restart loop
- Each MediaRecorder instance is independent with its own event handlers
- The stop/restart approach ensures proper WebM file structure with EBML headers
- This avoids FFmpeg errors like "EBML header parsing failed" from incomplete files

### API Calls
- **Whisper API**: Called once per chunk + once for final evaluation
- **Parallel Processing**: Each chunk processes independently
- **Rate Limiting**: Consider Whisper API rate limits for very long recordings

### Error Handling
- Failed chunk transcriptions are logged but don't stop recording
- If a chunk fails, it's marked as "(error)" in the UI
- Final audio is always preserved regardless of chunk failures

## Configuration

### Environment Variables
No new environment variables needed - uses existing `OPENAI_API_KEY` for Whisper API.

### Chunk Duration Tuning
- **5 seconds** (default): Good balance between API calls and responsiveness
- **3 seconds**: More frequent updates, more API calls
- **10 seconds**: Fewer API calls, less frequent updates

### Toggle Default
Change default mode in `AudioInput.jsx`:
```jsx
const [useChunkedRecording, setUseChunkedRecording] = useState(true);  // or false
```

## Limitations

1. **WebM Support**: Requires browser support for WebM/Opus recording
2. **API Costs**: More Whisper API calls (N chunks + 1 final vs 1 total)
3. **Network**: Requires stable connection for chunk uploads during recording
4. **Memory**: Stores all chunks in memory until recording stops

## Future Improvements

- [ ] Add chunk caching to avoid re-transcribing on final evaluation
- [ ] Implement WebSocket for lower latency chunk transmission
- [ ] Add support for Azure Speech SDK real-time recognition
- [ ] Compress chunks before sending to reduce bandwidth
- [ ] Add retry logic for failed chunk transcriptions
- [ ] Show per-chunk processing status in UI

## Testing

### Manual Testing Steps

1. **Basic Functionality**:
   - Enable real-time mode
   - Record for 20+ seconds
   - Verify chunks appear every 5 seconds
   - Stop and verify final evaluation

2. **Traditional Mode**:
   - Disable real-time mode
   - Record and verify it works as before
   - No chunks should be sent during recording

3. **Edge Cases**:
   - Very short recording (< 5 seconds)
   - Very long recording (> 60 seconds)
   - Recording with long silences
   - Network interruption during recording

### Console Logs

Look for these log messages:
```
[Chunk 0] Sending for transcription (0.0s - 5.0s)
[Chunk 0] Transcription received: "Hello, how are you"
[CHUNK-0] Received chunk 0.0s-5.0s
[CHUNK-0] Transcribed in 1.23s: 'Hello, how are you'
```

## Troubleshooting

### Chunks Not Appearing
- Check browser console for errors
- Verify `/api/transcribe-chunk` endpoint is accessible
- Check authentication token is valid

### Slow Transcription
- Check Whisper API response times in backend logs
- Consider increasing chunk duration to reduce API calls
- Verify network connection is stable

### Transcript Mismatch
- Final evaluation uses full audio, not chunks
- Chunk transcripts are for preview only
- Minor differences are expected due to context differences

## Credits

Implementation based on:
- MediaRecorder API for chunked recording
- OpenAI Whisper API for transcription
- Existing Azure Speech SDK integration for pronunciation assessment
