function AudioPlayer({ audioData }) {
  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">Your Audio</h2>
      <audio controls className="w-full" src={audioData}>
        Your browser does not support the audio element.
      </audio>
    </div>
  );
}

export default AudioPlayer;
