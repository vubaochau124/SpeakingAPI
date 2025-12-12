/**
 * RecordRTC-based PCM audio recorder for real-time streaming
 * This records directly to WAV/PCM format compatible with Azure Speech
 */

export class PCMAudioRecorder {
  constructor(stream, onDataAvailable) {
    this.stream = stream;
    this.onDataAvailable = onDataAvailable;
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    this.processor = null;
    this.source = null;
    this.isRecording = false;
  }

  async start() {
    this.source = this.audioContext.createMediaStreamSource(this.stream);

    // Use ScriptProcessorNode for real-time PCM extraction
    // Note: This is deprecated but widely supported. For production, use AudioWorklet
    const bufferSize = 4096;
    this.processor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

    this.processor.onaudioprocess = (e) => {
      if (!this.isRecording) return;

      // Get PCM data (Float32Array)
      const inputData = e.inputBuffer.getChannelData(0);

      // Convert Float32 to Int16 (Azure expects 16-bit PCM)
      const pcm16 = this.float32ToInt16(inputData);

      // Send to callback
      if (this.onDataAvailable) {
        this.onDataAvailable(pcm16.buffer);
      }
    };

    this.source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);
    this.isRecording = true;
  }

  stop() {
    this.isRecording = false;
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
  }

  /**
   * Convert Float32Array PCM samples to Int16Array
   */
  float32ToInt16(buffer) {
    const int16 = new Int16Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
      const s = Math.max(-1, Math.min(1, buffer[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16;
  }

  async close() {
    this.stop();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.close();
    }
  }
}
