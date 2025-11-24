function AudioPlayer({ audioData }) {
  return (
    <div className="space-y-4">
      <audio
        controls
        className="w-full h-12 rounded-xl bg-slate-700/50 border border-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
        src={audioData}
        style={{
          filter: 'invert(0.9) hue-rotate(180deg)',
        }}
      >
        Your browser does not support the audio element.
      </audio>
    </div>
  );
}

export default AudioPlayer;
