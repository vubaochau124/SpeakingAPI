import { useState, useRef, useEffect } from 'react';

/**
 * ChunkedAudioRecorder - Records audio and sends chunks every 5 seconds for real-time transcription
 *
 * Props:
 * - onChunkTranscribed: (chunkIndex, transcript, startTime, endTime) => void
 * - onRecordingComplete: (allChunks, fullAudioBlob) => void
 * - chunkDuration: number (in seconds, default 5)
 * - language: string (default 'en-US')
 * - apiEndpoint: string (endpoint to send chunks to)
 */
function ChunkedAudioRecorder({
  onChunkTranscribed,
  onRecordingComplete,
  chunkDuration = 5,
  language = 'en-US',
  apiEndpoint = '/api/transcribe-chunk',
  disabled = false
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordStatus, setRecordStatus] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [chunkCount, setChunkCount] = useState(0);
  const [transcribedChunks, setTranscribedChunks] = useState([]);
  const [recordingTime, setRecordingTime] = useState(0);

  // Refs
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const allChunksRef = useRef([]);
  const currentChunkRef = useRef([]);
  const chunkTimerRef = useRef(null);
  const recordingStartTimeRef = useRef(0);
  const chunkStartTimeRef = useRef(0);
  const timerIntervalRef = useRef(null);

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
      if (chunkTimerRef.current) {
        clearInterval(chunkTimerRef.current);
      }
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, []);

  // Audio level visualizer
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

  // Send chunk to backend for transcription
  const sendChunkForTranscription = async (chunkBlob, chunkIndex, startTime, endTime) => {
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

      // Update transcribed chunks
      setTranscribedChunks(prev => [
        ...prev,
        {
          index: chunkIndex,
          transcript,
          startTime,
          endTime,
          duration: endTime - startTime
        }
      ]);

      // Callback to parent
      if (onChunkTranscribed) {
        onChunkTranscribed(chunkIndex, transcript, startTime, endTime);
      }

    } catch (error) {
      console.error(`[Chunk ${chunkIndex}] Transcription error:`, error);

      // Still add to UI but mark as error
      setTranscribedChunks(prev => [
        ...prev,
        {
          index: chunkIndex,
          transcript: `[Error: ${error.message}]`,
          startTime,
          endTime,
          duration: endTime - startTime,
          error: true
        }
      ]);
    }
  };

  // Process accumulated chunk data - restart recorder to get complete WebM file
  const processChunk = async (chunkIndex) => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') {
      return;
    }

    const currentTime = (Date.now() - recordingStartTimeRef.current) / 1000;
    const startTime = chunkStartTimeRef.current;
    const endTime = currentTime;

    console.log(`[Chunk ${chunkIndex}] Processing chunk ${startTime.toFixed(1)}s - ${endTime.toFixed(1)}s`);

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

        // Reset and restart recording if still in recording mode
        currentChunkRef.current = [];
        chunkStartTimeRef.current = currentTime;

        // Restart MediaRecorder for next chunk (always restart unless user manually stopped)
        if (streamRef.current && chunkTimerRef.current) {
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

        resolve();
      };

      oldRecorder.addEventListener('dataavailable', handleDataAvailable);
      oldRecorder.addEventListener('stop', handleStop);
      oldRecorder.stop();
    });
  };

  // Start recording with chunking
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

      // Setup audio analysis for visualizer
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
      recordingStartTimeRef.current = Date.now();
      chunkStartTimeRef.current = 0;
      setChunkCount(0);
      setTranscribedChunks([]);
      setRecordingTime(0);

      // Collect data continuously
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          currentChunkRef.current.push(event.data);
        }
      };

      // Start recording with 250ms timeslice for responsive chunking
      mediaRecorderRef.current.start(250);
      setIsRecording(true);
      setRecordStatus('🔴 Recording...');

      // Start audio level animation
      analyzeAudioLevel();

      // Timer to update recording time display
      timerIntervalRef.current = setInterval(() => {
        const elapsed = (Date.now() - recordingStartTimeRef.current) / 1000;
        setRecordingTime(elapsed);
      }, 100);

      // Setup chunk processing timer (every chunkDuration seconds)
      let chunkIndex = 0;
      chunkTimerRef.current = setInterval(async () => {
        await processChunk(chunkIndex);
        chunkIndex++;
        setChunkCount(chunkIndex);
      }, chunkDuration * 1000);

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

    if (chunkTimerRef.current) {
      clearInterval(chunkTimerRef.current);
      chunkTimerRef.current = null; // Important: set to null so processChunk knows to stop restarting
    }

    setIsRecording(false);

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
    setRecordStatus('Processing complete!');

    // Create full audio blob from all chunks
    const allBlobs = allChunksRef.current.map(c => c.blob);
    const fullAudioBlob = new Blob(allBlobs, { type: 'audio/webm' });

    // Callback to parent with all chunks and full audio
    if (onRecordingComplete) {
      onRecordingComplete(allChunksRef.current, fullAudioBlob);
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
        {isRecording ? 'Recording (Real-time Processing)' : 'Record Audio'}
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
        </div>
      )}

      {/* Audio Level Indicator */}
      {isRecording && (
        <div className="mb-4">
          <div className="h-2 bg-slate-600 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 transition-all duration-75"
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
