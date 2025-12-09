import { useState, useRef, useEffect } from "react";
import AudioDownload from "./AudioDownload";

function AudioPlayer({ audioData }) {
  const audioRef = useRef(null);
  const progressRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [showVolume, setShowVolume] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      } else {
        // WebM workaround: seek to end to get duration
        audio.currentTime = 1e10;
      }
    };

    const handleDurationChange = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const handleSeeked = () => {
      // After seeking to end, duration should be available
      if (audio.duration && isFinite(audio.duration) && duration === 0) {
        setDuration(audio.duration);
        audio.currentTime = 0; // Reset to beginning
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      // Fallback: get duration during playback
      if (audio.duration && isFinite(audio.duration) && duration === 0) {
        setDuration(audio.duration);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("durationchange", handleDurationChange);
    audio.addEventListener("seeked", handleSeeked);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("durationchange", handleDurationChange);
      audio.removeEventListener("seeked", handleSeeked);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [audioData, duration]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleProgressClick = (e) => {
    const audio = audioRef.current;
    const progressBar = progressRef.current;
    if (!audio || !progressBar || !duration || !isFinite(duration)) return;

    const rect = progressBar.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const percent = clickX / width;
    audio.currentTime = percent * duration;
  };

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  };

  const handleSpeedChange = () => {
    const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
    const currentIndex = speeds.indexOf(playbackRate);
    const nextIndex = (currentIndex + 1) % speeds.length;
    const newRate = speeds[nextIndex];
    setPlaybackRate(newRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = newRate;
    }
  };

  const skipTime = (seconds) => {
    const audio = audioRef.current;
    if (!audio) return;
    const maxTime = duration && isFinite(duration) ? duration : audio.duration || 0;
    audio.currentTime = Math.max(0, Math.min(audio.currentTime + seconds, maxTime));
  };

  const formatTime = (time) => {
    if (!time || isNaN(time) || !isFinite(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  const getVolumeIcon = () => {
    if (volume === 0)
      return (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
          />
        </svg>
      );
    if (volume < 0.5)
      return (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M15.536 8.464a5 5 0 010 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
          />
        </svg>
      );
    return (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
        />
      </svg>
    );
  };

  return (
    <div className="bg-gradient-to-r from-slate-800/80 to-slate-700/80 backdrop-blur-sm rounded-2xl p-5 border border-slate-600/50 shadow-xl">
      <audio ref={audioRef} src={audioData} preload="metadata" />

      {/* Main Controls Row */}
      <div className="flex items-center gap-4">
        {/* Play/Pause Button */}
        <button
          onClick={togglePlay}
          className="w-14 h-14 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 flex items-center justify-center text-white shadow-lg shadow-cyan-500/30 hover:shadow-cyan-500/50 transition-all duration-300 hover:scale-105 active:scale-95"
        >
          {isPlaying ? (
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          ) : (
            <svg
              className="w-6 h-6 ml-1"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Progress Section */}
        <div className="flex-1 space-y-2">
          {/* Time Display */}
          <div className="flex justify-between text-xs text-slate-400 font-medium">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>

          {/* Progress Bar */}
          <div
            ref={progressRef}
            onClick={handleProgressClick}
            className="relative h-2 bg-slate-600/50 rounded-full cursor-pointer group overflow-hidden"
          >
            {/* Background track */}
            <div className="absolute inset-0 bg-slate-600/50 rounded-full" />

            {/* Progress fill */}
            <div
              className="absolute h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-100"
              style={{ width: `${progressPercent}%` }}
            />

            {/* Hover effect */}
            <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-full" />

            {/* Thumb */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-200 hover:scale-110"
              style={{ left: `calc(${progressPercent}% - 8px)` }}
            />
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2">
          {/* Skip Backward */}
          <button
            onClick={() => skipTime(-5)}
            className="w-9 h-9 rounded-lg bg-slate-700/50 hover:bg-slate-600/50 flex items-center justify-center text-slate-400 hover:text-white transition-all duration-200 hover:scale-105"
            title="Rewind 5s"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z"
              />
            </svg>
          </button>

          {/* Skip Forward */}
          <button
            onClick={() => skipTime(5)}
            className="w-9 h-9 rounded-lg bg-slate-700/50 hover:bg-slate-600/50 flex items-center justify-center text-slate-400 hover:text-white transition-all duration-200 hover:scale-105"
            title="Forward 5s"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z"
              />
            </svg>
          </button>

          {/* Speed Control */}
          <button
            onClick={handleSpeedChange}
            className="h-9 px-3 rounded-lg bg-slate-700/50 hover:bg-slate-600/50 flex items-center justify-center text-slate-400 hover:text-white transition-all duration-200 hover:scale-105 text-xs font-bold min-w-[48px]"
            title="Playback speed"
          >
            {playbackRate}x
          </button>

          {/* Volume Control */}
          <div className="relative">
            <button
              onClick={() => setShowVolume(!showVolume)}
              onBlur={() => setTimeout(() => setShowVolume(false), 200)}
              className="w-9 h-9 rounded-lg bg-slate-700/50 hover:bg-slate-600/50 flex items-center justify-center text-slate-400 hover:text-white transition-all duration-200 hover:scale-105"
              title="Volume"
            >
              {getVolumeIcon()}
            </button>

            {/* Volume Slider Popup */}
            {showVolume && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-3 bg-slate-800 border border-slate-600 rounded-xl shadow-xl">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={volume}
                  onChange={handleVolumeChange}
                  className="w-24 h-2 appearance-none bg-slate-600 rounded-full cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-cyan-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:hover:bg-cyan-400 [&::-webkit-slider-thumb]:transition-colors"
                />
                <div className="text-center text-xs text-slate-400 mt-1">
                  {Math.round(volume * 100)}%
                </div>
              </div>
            )}
          </div>

          {/* Download Button */}
          <AudioDownload audioData={audioData} />
        </div>
      </div>
    </div>
  );
}

export default AudioPlayer;
