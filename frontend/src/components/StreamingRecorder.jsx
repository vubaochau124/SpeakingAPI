import { useState, useRef, useEffect } from 'react';

const StreamingRecorder = ({ onFinalResult, language = 'en-US' }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState("");
  
  const socketRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);

  // Helper: Convert Blob to Base64
  const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result.split(',')[1];
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const startRecording = async () => {
    try {
      // 1. Get Microphone Stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // 2. Initialize WebSocket
      // Adjust URL to match your FastAPI backend
      socketRef.current = new WebSocket('ws://localhost:8000/api/ws/evaluate-realtime');

      socketRef.current.onopen = () => {
        console.log("WebSocket connected");
        // Send Init Message
        socketRef.current.send(JSON.stringify({ 
          type: 'init', 
          language: language 
        }));

        // 3. Start MediaRecorder
        // Note: Chrome records in audio/webm by default. 
        // Ensure your backend can handle WebM or use a library to record WAV.
        const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        mediaRecorderRef.current = mediaRecorder;

        // 4. Send Chunks as they become available
        mediaRecorder.ondataavailable = async (event) => {
          if (event.data.size > 0 && socketRef.current?.readyState === WebSocket.OPEN) {
            const base64Audio = await blobToBase64(event.data);
            socketRef.current.send(JSON.stringify({
              type: 'chunk',
              audio: base64Audio
            }));
          }
        };

        // Start recording with 250ms timeslices (This sends chunks continuously)
        mediaRecorder.start(250); 
        setIsRecording(true);
        setPartialTranscript("");
      };

      // 5. Handle Incoming Messages (Real-time text)
      socketRef.current.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'transcript_partial') {
          // Update UI immediately while user is speaking
          setPartialTranscript(data.text);
        } 
        else if (data.type === 'transcript_final') {
          // Final sentence confirmed by Azure
          setPartialTranscript(prev => prev + " " + data.text);
        }
        else if (data.type === 'done') {
           // Analysis complete
           console.log("Session finished");
        }
      };

      socketRef.current.onerror = (error) => {
        console.error("WebSocket Error:", error);
      };

    } catch (err) {
      console.error("Error starting recording:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      // Stop Recorder
      mediaRecorderRef.current.stop();
      streamRef.current.getTracks().forEach(track => track.stop());
      setIsRecording(false);

      // Tell Backend we are done
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'finish' }));
      }
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) socketRef.current.close();
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Live Transcript Display */}
      <div className="w-full p-4 bg-slate-800 rounded-lg min-h-[100px] border border-slate-600 text-slate-200">
        {partialTranscript || <span className="text-slate-500 italic">Start speaking to see text...</span>}
      </div>

      {/* Controls */}
      {!isRecording ? (
        <button 
          onClick={startRecording}
          className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-full font-bold flex items-center gap-2"
        >
          <span className="w-3 h-3 bg-white rounded-full animate-pulse"></span>
          Start Live Recording
        </button>
      ) : (
        <button 
          onClick={stopRecording}
          className="px-6 py-3 bg-slate-600 hover:bg-slate-700 text-white rounded-full font-bold"
        >
          Stop
        </button>
      )}
    </div>
  );
};

export default StreamingRecorder;