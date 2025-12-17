import { useState, useRef, useEffect } from 'react';

// ============================================================================
// SILENCE DETECTION CONFIGURATION
// ============================================================================
// These thresholds control when audio chunks are sent for transcription.
// Instead of sending every N seconds, we detect natural pauses in speech.
// ============================================================================

const SILENCE_THRESHOLD = 0.015;  // RMS threshold below which audio is considered silence (0-1 scale)
const SILENCE_DURATION_MS = 800;  // How long silence must persist to trigger chunk send (ms)
const MIN_AUDIO_LENGTH_MS = 1500; // Minimum audio length before considering silence trigger (ms)
const MAX_CHUNK_DURATION_MS = 15000; // Maximum chunk duration before forcing send (ms)
const ANALYSIS_INTERVAL_MS = 100; // How often to analyze audio levels (ms)

/**
 * ChunkedAudioRecorder - Records audio and sends chunks based on silence detection
 *
 * Uses a more robust approach than fixed-interval chunking:
 * - Detects natural pauses in speech (silence detection)
 * - Only sends chunks when the speaker pauses
 * - Respects minimum and maximum chunk durations
 *
 * Props:
 * - onChunkTranscribed: (chunkIndex, transcript, startTime, endTime) => void
 * - onRecordingComplete: (allChunks, fullAudioBlob) => void
 * - chunkDuration: number (max chunk duration in seconds, default 15)
 * - language: string (default 'en-US')
 * - apiEndpoint: string (endpoint to send chunks to)
 * - silenceThreshold: number (0-1, default 0.015)
 * - silenceDuration: number (ms of silence to trigger, default 800)
 */
function ChunkedAudioRecorder({
  onChunkTranscribed,
  onRecordingComplete,
  chunkDuration = 15,  // Now used as max duration
  language = 'en-US',
  apiEndpoint = '/api/transcribe-chunk',
  disabled = false,
  silenceThreshold = SILENCE_THRESHOLD,
  silenceDuration = SILENCE_DURATION_MS
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordStatus, setRecordStatus] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [chunkCount, setChunkCount] = useState(0);
  const [transcribedChunks, setTranscribedChunks] = useState([]);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isSilent, setIsSilent] = useState(false);  // Visual indicator for silence detection

  // Refs
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const allChunksRef = useRef([]);
  const currentChunkRef = useRef([]);
  const recordingStartTimeRef = useRef(0);
  const chunkStartTimeRef = useRef(0);
  const timerIntervalRef = useRef(null);
  const pendingTranscriptionsRef = useRef([]);  // Track pending transcription promises
  const transcribedChunksRef = useRef([]);  // Store transcripts in ref for reliable access

  // Silence detection refs
  const silenceStartTimeRef = useRef(null);  // When silence started (null if not silent)
  const silenceCheckIntervalRef = useRef(null);  // Interval for checking silence
  const isProcessingChunkRef = useRef(false);  // Prevent concurrent chunk processing
  const chunkIndexRef = useRef(0);  // Track chunk index

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (silenceCheckIntervalRef.current) {
        clearInterval(silenceCheckIntervalRef.current);
      }
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, []);

  // Audio level visualizer (for UI only)
  const analyzeAudioLevel = () => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sum / dataArray.length);
    const db = 20 * Math.log10(rms / 255);

    setAudioLevel(Math.max(0, (db + 60) / 60 * 100));

    animationFrameRef.current = requestAnimationFrame(analyzeAudioLevel);
  };

  // Calculate RMS (Root Mean Square) for silence detection
  const calculateRMS = () => {
    if (!analyserRef.current) return 0;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] * dataArray[i];
    }
    // Normalize to 0-1 range
    return Math.sqrt(sum / dataArray.length) / 255;
  };

  // Check for silence and trigger chunk processing
  const checkSilenceAndProcess = async () => {
    if (!isRecording || isProcessingChunkRef.current) return;

    const rms = calculateRMS();
    const now = Date.now();
    const chunkDurationMs = now - (recordingStartTimeRef.current + chunkStartTimeRef.current * 1000);

    // Check if audio is below silence threshold
    if (rms < silenceThreshold) {
      // Start tracking silence if not already
      if (silenceStartTimeRef.current === null) {
        silenceStartTimeRef.current = now;
      }
      setIsSilent(true);

      const silenceDurationMs = now - silenceStartTimeRef.current;

      // Trigger chunk if:
      // 1. Silence has persisted long enough AND we have minimum audio, OR
      // 2. We've exceeded max chunk duration
      const shouldTrigger =
        (silenceDurationMs >= silenceDuration && chunkDurationMs >= MIN_AUDIO_LENGTH_MS) ||
        (chunkDurationMs >= chunkDuration * 1000);  // Max duration reached

      if (shouldTrigger && currentChunkRef.current.length > 0) {
        console.log(`[Silence] Triggering chunk after ${silenceDurationMs}ms silence, ${chunkDurationMs}ms audio`);
        await processChunk(chunkIndexRef.current);
        chunkIndexRef.current++;
        setChunkCount(chunkIndexRef.current);
      }
    } else {
      // Audio detected - reset silence tracking
      silenceStartTimeRef.current = null;
      setIsSilent(false);
    }
  };

  // Send chunk to backend for transcription (returns promise for tracking)
  const sendChunkForTranscription = (chunkBlob, chunkIndex, startTime, endTime) => {
    const transcriptionPromise = (async () => {
      try {
        console.log(`[Chunk ${chunkIndex}] Sending for transcription (${startTime.toFixed(1)}s - ${endTime.toFixed(1)}s, ${chunkBlob.size} bytes)`);

        const formData = new FormData();
        formData.append('audio', chunkBlob, `chunk_${chunkIndex}.webm`);
        formData.append('language', language);
        formData.append('chunk_index', chunkIndex);
        formData.append('start_time', startTime);
        formData.append('end_time', endTime);

        const response = await fetch(apiEndpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: formData
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        const transcript = result.transcript || '';

        console.log(`[Chunk ${chunkIndex}] Transcription received: "${transcript}"`);

        const chunkData = {
          index: chunkIndex,
          transcript,
          startTime,
          endTime,
          duration: endTime - startTime
        };

        // Store in ref for reliable access when recording completes
        transcribedChunksRef.current.push(chunkData);

        // Update state for UI display
        setTranscribedChunks(prev => [...prev, chunkData]);

        // Callback to parent
        if (onChunkTranscribed) {
          onChunkTranscribed(chunkIndex, transcript, startTime, endTime);
        }

        return chunkData;

      } catch (error) {
        console.error(`[Chunk ${chunkIndex}] Transcription error:`, error);

        const errorData = {
          index: chunkIndex,
          transcript: '',  // Empty transcript on error
          startTime,
          endTime,
          duration: endTime - startTime,
          error: true
        };

        // Store in ref even on error
        transcribedChunksRef.current.push(errorData);

        // Still add to UI but mark as error
        setTranscribedChunks(prev => [...prev, { ...errorData, transcript: `[Error: ${error.message}]` }]);

        return errorData;
      }
    })();

    // Track the promise
    pendingTranscriptionsRef.current.push(transcriptionPromise);
    return transcriptionPromise;
  };

  // Process accumulated chunk data - restart recorder to get complete WebM file
  const processChunk = async (chunkIndex) => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') {
      return;
    }

    // Prevent concurrent chunk processing
    if (isProcessingChunkRef.current) {
      console.log(`[Chunk ${chunkIndex}] Already processing, skipping`);
      return;
    }
    isProcessingChunkRef.current = true;

    const currentTime = (Date.now() - recordingStartTimeRef.current) / 1000;
    const startTime = chunkStartTimeRef.current;
    const endTime = currentTime;

    console.log(`[Chunk ${chunkIndex}] Processing chunk ${startTime.toFixed(1)}s - ${endTime.toFixed(1)}s (silence-triggered)`);

    // Stop current recording to finalize the WebM file
    return new Promise((resolve) => {
      const oldRecorder = mediaRecorderRef.current;

      const handleDataAvailable = (event) => {
        if (event.data.size > 0) {
          currentChunkRef.current.push(event.data);
        }
      };

      const handleStop = () => {
        oldRecorder.removeEventListener('dataavailable', handleDataAvailable);
        oldRecorder.removeEventListener('stop', handleStop);

        if (currentChunkRef.current.length === 0) {
          console.log(`[Chunk ${chunkIndex}] No data collected`);
          isProcessingChunkRef.current = false;
          resolve();
          return;
        }

        // Create complete WebM blob
        const chunkBlob = new Blob(currentChunkRef.current, { type: 'audio/webm' });

        // Store chunk for final audio
        allChunksRef.current.push({
          blob: chunkBlob,
          index: chunkIndex,
          startTime,
          endTime
        });

        // Send for transcription
        sendChunkForTranscription(chunkBlob, chunkIndex, startTime, endTime);

        // Reset for next chunk
        currentChunkRef.current = [];
        chunkStartTimeRef.current = currentTime;
        silenceStartTimeRef.current = null;  // Reset silence tracking

        // Restart MediaRecorder for next chunk (if still recording)
        if (streamRef.current && silenceCheckIntervalRef.current) {
          console.log(`[Chunk ${chunkIndex}] Restarting recorder for next chunk`);
          mediaRecorderRef.current = new MediaRecorder(streamRef.current, {
            mimeType: 'audio/webm;codecs=opus'
          });

          mediaRecorderRef.current.ondataavailable = (e) => {
            if (e.data.size > 0) {
              currentChunkRef.current.push(e.data);
            }
          };

          mediaRecorderRef.current.start(250);
        }

        isProcessingChunkRef.current = false;
        resolve();
      };

      oldRecorder.addEventListener('dataavailable', handleDataAvailable);
      oldRecorder.addEventListener('stop', handleStop);
      oldRecorder.stop();
    });
  };

  // Start recording with silence-detection based chunking
  const startRecording = async () => {
    try {
      setRecordStatus('Starting...');

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000
        }
      });
      streamRef.current = stream;

      // Setup audio analysis for visualizer AND silence detection
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      // Setup MediaRecorder with shorter timeslice for better chunking
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      // Reset state
      allChunksRef.current = [];
      currentChunkRef.current = [];
      pendingTranscriptionsRef.current = [];
      transcribedChunksRef.current = [];
      recordingStartTimeRef.current = Date.now();
      chunkStartTimeRef.current = 0;
      chunkIndexRef.current = 0;
      silenceStartTimeRef.current = null;
      isProcessingChunkRef.current = false;
      setChunkCount(0);
      setTranscribedChunks([]);
      setRecordingTime(0);
      setIsSilent(false);

      // Collect data continuously
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          currentChunkRef.current.push(event.data);
        }
      };

      // Start recording with 250ms timeslice for responsive chunking
      mediaRecorderRef.current.start(250);
      setIsRecording(true);
      setRecordStatus('🔴 Recording (silence detection active)');

      // Start audio level animation
      analyzeAudioLevel();

      // Timer to update recording time display
      timerIntervalRef.current = setInterval(() => {
        const elapsed = (Date.now() - recordingStartTimeRef.current) / 1000;
        setRecordingTime(elapsed);
      }, 100);

      // Setup silence detection interval (replaces fixed chunk timer)
      silenceCheckIntervalRef.current = setInterval(() => {
        checkSilenceAndProcess();
      }, ANALYSIS_INTERVAL_MS);

    } catch (err) {
      console.error('Error starting recording:', err);
      alert('Error accessing microphone: ' + err.message);
      setRecordStatus('');
    }
  };

  // Stop recording
  const stopRecording = async () => {
    if (!isRecording) return;

    // Clear timers first to prevent new chunks from being processed
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }

    if (silenceCheckIntervalRef.current) {
      clearInterval(silenceCheckIntervalRef.current);
      silenceCheckIntervalRef.current = null; // Important: set to null so processChunk knows to stop restarting
    }

    setIsRecording(false);
    setIsSilent(false);

    // Process any remaining data as final chunk
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      await new Promise((resolve) => {
        const handleStop = () => {
          mediaRecorderRef.current.removeEventListener('stop', handleStop);

          // Create final chunk if there's data
          if (currentChunkRef.current.length > 0) {
            const currentTime = (Date.now() - recordingStartTimeRef.current) / 1000;
            const chunkBlob = new Blob(currentChunkRef.current, { type: 'audio/webm' });
            const chunkIndex = allChunksRef.current.length;

            allChunksRef.current.push({
              blob: chunkBlob,
              index: chunkIndex,
              startTime: chunkStartTimeRef.current,
              endTime: currentTime
            });

            sendChunkForTranscription(chunkBlob, chunkIndex, chunkStartTimeRef.current, currentTime);
          }

          resolve();
        };

        mediaRecorderRef.current.addEventListener('stop', handleStop);
        mediaRecorderRef.current.stop();
      });
    }

    // Stop audio stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setAudioLevel(0);
    setRecordStatus('Waiting for transcriptions...');

    // Wait for all pending transcriptions to complete
    console.log(`[Recording] Waiting for ${pendingTranscriptionsRef.current.length} pending transcriptions...`);
    await Promise.all(pendingTranscriptionsRef.current);
    console.log(`[Recording] All transcriptions complete. Total: ${transcribedChunksRef.current.length} chunks`);

    setRecordStatus('Processing complete!');

    // Create full audio blob from all chunks
    const allBlobs = allChunksRef.current.map(c => c.blob);
    const fullAudioBlob = new Blob(allBlobs, { type: 'audio/webm' });

    // Sort transcripts by index to ensure correct order
    const sortedTranscripts = [...transcribedChunksRef.current].sort((a, b) => a.index - b.index);

    // Callback to parent with all chunks, full audio, and transcripts
    if (onRecordingComplete) {
      onRecordingComplete(allChunksRef.current, fullAudioBlob, sortedTranscripts);
    }
  };

  return (
    <div className="bg-slate-700/30 border-2 border-dashed rounded-xl p-6 text-center transition-all duration-300"
         style={{
           borderColor: isRecording ? 'rgba(239, 68, 68, 0.7)' : 'rgb(71, 85, 105)',
           backgroundColor: isRecording ? 'rgba(127, 29, 29, 0.1)' : 'rgba(51, 65, 85, 0.3)'
         }}>

      {/* Microphone Icon */}
      <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center transition-all ${
        isRecording
          ? 'bg-red-500 animate-pulse'
          : 'bg-gradient-to-r from-cyan-500 to-blue-600'
      }`}>
        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
      </div>

      {/* Title */}
      <h3 className="text-lg font-semibold text-white mb-3">
        {isRecording ? 'Recording (Smart Silence Detection)' : 'Record Audio'}
      </h3>

      {/* Recording Stats */}
      {isRecording && (
        <div className="mb-4 space-y-2">
          <div className="text-sm text-slate-300">
            <span className="font-mono">{recordingTime.toFixed(1)}s</span>
            {' · '}
            <span>{chunkCount} chunks sent</span>
            {' · '}
            <span>{transcribedChunks.length} transcribed</span>
          </div>
          {/* Silence Detection Indicator */}
          <div className="flex items-center justify-center gap-2 text-xs">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${
              isSilent ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'
            }`}>
              <span className={`w-2 h-2 rounded-full ${isSilent ? 'bg-yellow-400' : 'bg-green-400 animate-pulse'}`} />
              {isSilent ? 'Pause detected...' : 'Listening'}
            </span>
          </div>
        </div>
      )}

      {/* Audio Level Indicator */}
      {isRecording && (
        <div className="mb-4">
          <div className="h-2 bg-slate-600 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-75 ${
                isSilent
                  ? 'bg-yellow-500'
                  : 'bg-gradient-to-r from-green-500 via-yellow-500 to-red-500'
              }`}
              style={{ width: `${audioLevel}%` }}
            />
          </div>
        </div>
      )}

      {/* Transcribed Chunks Preview */}
      {transcribedChunks.length > 0 && (
        <div className="mb-4 max-h-32 overflow-y-auto bg-slate-800/50 rounded-lg p-3 text-left">
          <div className="text-xs text-slate-400 mb-2">Real-time Transcript:</div>
          <div className="text-sm text-white space-y-1">
            {transcribedChunks.map((chunk, idx) => (
              <div key={idx} className={`border-l-2 pl-2 ${chunk.error ? 'border-red-500' : 'border-cyan-500'}`}>
                <span className={`text-xs ${chunk.error ? 'text-red-400' : 'text-cyan-400'}`}>
                  [{chunk.startTime.toFixed(1)}s-{chunk.endTime.toFixed(1)}s]
                </span>
                {' '}
                <span className={chunk.error ? 'text-red-300' : 'text-white'}>
                  {chunk.transcript || '(silent)'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Control Button */}
      <button
        onClick={isRecording ? stopRecording : startRecording}
        disabled={disabled}
        className={`font-semibold py-3 px-8 rounded-xl transition-all duration-300 ${
          isRecording
            ? 'bg-red-500 hover:bg-red-600'
            : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700'
        } text-white disabled:opacity-50 disabled:cursor-not-allowed shadow-lg`}
      >
        {isRecording ? '⏹ Stop Recording' : '🎙 Start Recording'}
      </button>

      {/* Status Message */}
      {recordStatus && (
        <p className={`mt-3 text-sm ${
          isRecording ? 'text-red-400' :
          recordStatus.includes('complete') ? 'text-emerald-400' : 'text-slate-400'
        }`}>
          {recordStatus}
        </p>
      )}
    </div>
  );
}

export default ChunkedAudioRecorder;
