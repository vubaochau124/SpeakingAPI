import { useState, useEffect, useRef } from 'react';

function AudioDownload({ audioData }) {
  const [converting, setConverting] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showOptions) return;

    const handleClickOutside = (event) => {
      if (
        menuRef.current && !menuRef.current.contains(event.target) &&
        buttonRef.current && !buttonRef.current.contains(event.target)
      ) {
        setShowOptions(false);
      }
    };

    // Add listener with slight delay to avoid immediate close
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showOptions]);

  // Get original format from data URL
  const getOriginalFormat = () => {
    if (!audioData) return 'unknown';
    const match = audioData.match(/data:audio\/(\w+)/);
    return match ? match[1] : 'unknown';
  };

  // Convert base64 to blob
  const base64ToBlob = (base64, mimeType) => {
    const base64Data = base64.split(',')[1];
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  };

  // Download original format
  const downloadOriginal = () => {
    const format = getOriginalFormat();
    const mimeType = `audio/${format}`;
    const blob = base64ToBlob(audioData, mimeType);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recording.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowOptions(false);
  };

  // Convert to WAV using Web Audio API
  const downloadAsWav = async () => {
    setConverting(true);
    try {
      const format = getOriginalFormat();
      const mimeType = `audio/${format}`;
      const blob = base64ToBlob(audioData, mimeType);

      // Decode audio data
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      // Convert to WAV
      const wavBlob = audioBufferToWav(audioBuffer);

      // Download
      const url = URL.createObjectURL(wavBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'recording.wav';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      audioContext.close();
    } catch (error) {
      console.error('Error converting to WAV:', error);
      alert('Failed to convert to WAV. Try downloading original format.');
    } finally {
      setConverting(false);
      setShowOptions(false);
    }
  };

  // Convert to MP3 using backend
  const downloadAsMp3 = async () => {
    setConverting(true);
    try {
      const format = getOriginalFormat();
      const mimeType = `audio/${format}`;
      const blob = base64ToBlob(audioData, mimeType);

      const formData = new FormData();
      formData.append('audio', blob, `recording.${format}`);
      formData.append('format', 'mp3');

      const response = await fetch('/api/convert-audio', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Conversion failed');
      }

      const mp3Blob = await response.blob();
      const url = URL.createObjectURL(mp3Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'recording.mp3';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error converting to MP3:', error);
      alert('Failed to convert to MP3. Try downloading WAV format.');
    } finally {
      setConverting(false);
      setShowOptions(false);
    }
  };

  // Convert AudioBuffer to WAV Blob
  const audioBufferToWav = (buffer) => {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;

    // Interleave channels
    let interleaved;
    if (numChannels === 2) {
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);
      interleaved = new Float32Array(left.length + right.length);
      for (let i = 0; i < left.length; i++) {
        interleaved[i * 2] = left[i];
        interleaved[i * 2 + 1] = right[i];
      }
    } else {
      interleaved = buffer.getChannelData(0);
    }

    const dataLength = interleaved.length * bytesPerSample;
    const bufferLength = 44 + dataLength;
    const arrayBuffer = new ArrayBuffer(bufferLength);
    const view = new DataView(arrayBuffer);

    // Write WAV header
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, bufferLength - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);

    // Write audio data
    let offset = 44;
    for (let i = 0; i < interleaved.length; i++) {
      const sample = Math.max(-1, Math.min(1, interleaved[i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  };

  if (!audioData) return null;

  const originalFormat = getOriginalFormat().toUpperCase();

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setShowOptions(!showOptions)}
        disabled={converting}
        className="flex items-center gap-2 px-4 py-2 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 hover:text-white rounded-lg transition-all duration-200 disabled:opacity-50"
        title="Download audio"
      >
        {converting ? (
          <>
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>Converting...</span>
          </>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span>Download</span>
          </>
        )}
      </button>

      {/* Dropdown Options - Popup above the button */}
      {showOptions && (
          <div
            ref={menuRef}
            className="absolute right-0 bottom-full mb-2 w-56 bg-slate-800 border border-slate-600 rounded-xl shadow-xl z-20 overflow-hidden">
            <div className="p-2 border-b border-slate-700">
              <p className="text-xs text-slate-400 px-2">Original: {originalFormat}</p>
            </div>

            <div className="p-2 space-y-1">
              {/* Original Format */}
              <button
                onClick={downloadOriginal}
                className="w-full flex items-center gap-3 px-3 py-2 text-left text-slate-300 hover:bg-slate-700/50 rounded-lg transition-colors"
              >
                <span className="text-lg">📁</span>
                <div>
                  <p className="font-medium">Original ({originalFormat})</p>
                  <p className="text-xs text-slate-400">As recorded</p>
                </div>
              </button>

              {/* WAV */}
              <button
                onClick={downloadAsWav}
                disabled={converting}
                className="w-full flex items-center gap-3 px-3 py-2 text-left text-slate-300 hover:bg-slate-700/50 rounded-lg transition-colors disabled:opacity-50"
              >
                <span className="text-lg">🎵</span>
                <div>
                  <p className="font-medium">WAV</p>
                  <p className="text-xs text-slate-400">Lossless quality</p>
                </div>
              </button>

              {/* MP3 */}
              <button
                onClick={downloadAsMp3}
                disabled={converting}
                className="w-full flex items-center gap-3 px-3 py-2 text-left text-slate-300 hover:bg-slate-700/50 rounded-lg transition-colors disabled:opacity-50"
              >
                <span className="text-lg">🎧</span>
                <div>
                  <p className="font-medium">MP3</p>
                  <p className="text-xs text-slate-400">Smaller file size</p>
                </div>
              </button>
            </div>
          </div>
      )}
    </div>
  );
}

export default AudioDownload;
