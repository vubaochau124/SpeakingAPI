import { useState, useRef, useEffect } from 'react';

function ConversationRolePlay({ conversations, onFinish, loading }) {
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [currentDialogueIndex, setCurrentDialogueIndex] = useState(0);
  const [dialogueEntries, setDialogueEntries] = useState([]);
  const [recordedAudios, setRecordedAudios] = useState({});
  const [isRecording, setIsRecording] = useState(false);
  const [recordStatus, setRecordStatus] = useState('');
  const [currentAudioUrl, setCurrentAudioUrl] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  useEffect(() => {
    if (selectedConversation) {
      const entries = Object.entries(selectedConversation.dialogue)
        .sort(([a], [b]) => {
          const numA = parseInt(a.replace('id', ''));
          const numB = parseInt(b.replace('id', ''));
          return numA - numB;
        })
        .map(([id, data]) => ({ id, ...data }));
      setDialogueEntries(entries);
      setCurrentDialogueIndex(0);
      setRecordedAudios({});
      setCurrentAudioUrl(null);
    }
  }, [selectedConversation]);

  const currentEntry = dialogueEntries[currentDialogueIndex];
  const isUserTurn = currentEntry?.role === 'me';
  const isLastDialogue = currentDialogueIndex >= dialogueEntries.length - 1;
  const hasRecordedCurrent = currentEntry && recordedAudios[currentEntry.id];

  const userEntries = dialogueEntries.filter(e => e.role === 'me');
  const allUserLinesRecorded = userEntries.every(e => recordedAudios[e.id]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setRecordedAudios(prev => ({
          ...prev,
          [currentEntry.id]: audioBlob
        }));
        setRecordStatus('Recording complete');
        if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);
        setCurrentAudioUrl(URL.createObjectURL(audioBlob));
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordStatus('Recording...');
    } catch (err) {
      alert('Error accessing microphone: ' + err.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleSpeakAgain = () => {
    if (currentEntry) {
      setRecordedAudios(prev => {
        const updated = { ...prev };
        delete updated[currentEntry.id];
        return updated;
      });
      if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);
      setCurrentAudioUrl(null);
      setRecordStatus('');
    }
  };

  const handleContinue = () => {
    if (currentDialogueIndex < dialogueEntries.length - 1) {
      setCurrentDialogueIndex(prev => prev + 1);
      setRecordStatus('');
      if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);
      setCurrentAudioUrl(null);
    }
  };

  const handleFinish = async () => {
    const audioBlobs = [];
    const texts = [];
    const lineAudios = [];

    for (const entry of dialogueEntries) {
      if (entry.role === 'me' && recordedAudios[entry.id]) {
        audioBlobs.push(recordedAudios[entry.id]);
        const cleanText = entry.line.replace(/\*\*/g, '');
        texts.push(cleanText);
        lineAudios.push(URL.createObjectURL(recordedAudios[entry.id]));
      }
    }

    if (audioBlobs.length === 0) {
      alert('No recordings found. Please record your lines first.');
      return;
    }

    const combinedBlob = new Blob(audioBlobs, { type: 'audio/webm' });
    const combinedFile = new File([combinedBlob], 'conversation.webm', { type: 'audio/webm' });

    onFinish(combinedFile, texts, { lineAudios });
  };

  const handleBack = () => {
    setSelectedConversation(null);
    setCurrentDialogueIndex(0);
    setDialogueEntries([]);
    setRecordedAudios({});
    setRecordStatus('');
    if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);
    setCurrentAudioUrl(null);
  };

  if (!selectedConversation) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold">1</span>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Conversation Practice</h2>
            <p className="text-slate-400">Select a conversation to practice</p>
          </div>
        </div>

        <div className="grid gap-4">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => setSelectedConversation(conv)}
              className="w-full p-6 bg-slate-700/30 hover:bg-slate-700/50 border border-slate-600 hover:border-cyan-500/50 rounded-xl text-left transition-all duration-300 group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white group-hover:text-cyan-400 transition-colors">
                    {conv.topic}
                  </h3>
                  <p className="text-slate-400 text-sm mt-1">
                    {Object.keys(conv.dialogue).length} lines
                  </p>
                </div>
                <svg className="w-6 h-6 text-slate-400 group-hover:text-cyan-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h2 className="text-xl font-bold text-white">{selectedConversation.topic}</h2>
            <p className="text-slate-400 text-sm">
              Line {currentDialogueIndex + 1} of {dialogueEntries.length}
            </p>
          </div>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2">
          {dialogueEntries.map((entry, idx) => (
            <div
              key={entry.id}
              className={`w-3 h-3 rounded-full transition-all ${
                idx < currentDialogueIndex
                  ? entry.role === 'me' && recordedAudios[entry.id]
                    ? 'bg-emerald-500'
                    : 'bg-slate-500'
                  : idx === currentDialogueIndex
                  ? 'bg-cyan-500 ring-2 ring-cyan-500/50'
                  : 'bg-slate-600'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Dialogue Display */}
      <div className="space-y-4">
        {/* Previous dialogues */}
        {currentDialogueIndex > 0 && (
          <div className="space-y-2 opacity-50">
            {dialogueEntries.slice(0, currentDialogueIndex).map((entry) => (
              <div
                key={entry.id}
                className={`p-3 rounded-xl ${
                  entry.role === 'me'
                    ? 'bg-cyan-500/10 border border-cyan-500/20 ml-8'
                    : 'bg-slate-700/30 border border-slate-600/30 mr-8'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-medium ${entry.role === 'me' ? 'text-cyan-400' : 'text-slate-400'}`}>
                    {entry.role === 'me' ? 'You' : 'Partner'}
                  </span>
                  {entry.role === 'me' && recordedAudios[entry.id] && (
                    <span className="text-emerald-400 text-xs">Recorded</span>
                  )}
                </div>
                <p className="text-slate-300 text-sm line-clamp-2">{entry.line.replace(/\*\*/g, '')}</p>
              </div>
            ))}
          </div>
        )}

        {/* Current dialogue */}
        {currentEntry && (
          <div
            className={`p-6 rounded-xl ${
              currentEntry.role === 'me'
                ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border-2 border-cyan-500/50 ml-4'
                : 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 border-2 border-purple-500/50 mr-4'
            }`}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                currentEntry.role === 'me' ? 'bg-cyan-500' : 'bg-purple-500'
              }`}>
                <span className="text-white text-sm font-bold">
                  {currentEntry.role === 'me' ? 'Y' : 'P'}
                </span>
              </div>
              <span className={`font-semibold ${currentEntry.role === 'me' ? 'text-cyan-400' : 'text-purple-400'}`}>
                {currentEntry.role === 'me' ? 'Your Turn' : 'Partner Says'}
              </span>
              {currentEntry.role === 'me' && hasRecordedCurrent && (
                <span className="ml-auto text-emerald-400 text-sm flex items-center gap-1">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Recorded
                </span>
              )}
            </div>
            <p className="text-white text-lg leading-relaxed whitespace-pre-wrap">
              {currentEntry.line.replace(/\*\*/g, '')}
            </p>
          </div>
        )}
      </div>

      {/* Recording Controls */}
      {isUserTurn && (
        <div className="bg-slate-700/30 border border-slate-600 rounded-xl p-6 space-y-4">
          <h3 className="text-lg font-semibold text-white">Speak this line:</h3>

          {currentAudioUrl && (
            <div className="bg-slate-800/50 rounded-lg p-4">
              <p className="text-slate-300 text-sm mb-2">Your recording:</p>
              <audio controls src={currentAudioUrl} className="w-full" />
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {!hasRecordedCurrent ? (
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={loading}
                className={`flex-1 min-w-[150px] py-3 px-6 rounded-xl font-semibold transition-all duration-300 ${
                  isRecording
                    ? 'bg-red-500 hover:bg-red-600 animate-pulse'
                    : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700'
                } text-white disabled:opacity-50 shadow-lg`}
              >
                {isRecording ? 'Stop Recording' : 'Speak'}
              </button>
            ) : (
              <>
                <button
                  onClick={handleSpeakAgain}
                  disabled={loading || isRecording}
                  className="flex-1 min-w-[150px] py-3 px-6 rounded-xl font-semibold bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50 transition-all shadow-lg"
                >
                  Speak Again
                </button>
                <button
                  onClick={handleContinue}
                  disabled={loading || isRecording || isLastDialogue}
                  className="flex-1 min-w-[150px] py-3 px-6 rounded-xl font-semibold bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white disabled:opacity-50 transition-all shadow-lg"
                >
                  Continue
                </button>
              </>
            )}
          </div>

          {recordStatus && (
            <p className={`text-sm ${isRecording ? 'text-red-400 animate-pulse' : 'text-emerald-400'}`}>
              {recordStatus}
            </p>
          )}
        </div>
      )}

      {/* Partner's Turn */}
      {!isUserTurn && currentEntry && (
        <div className="flex justify-center">
          <button
            onClick={handleContinue}
            disabled={loading || isLastDialogue}
            className="py-3 px-8 rounded-xl font-semibold bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white disabled:opacity-50 transition-all shadow-lg"
          >
            Continue
          </button>
        </div>
      )}

      {/* Recording Summary */}
      <div className="bg-slate-700/30 rounded-xl p-4 border border-slate-600">
        <h4 className="text-slate-300 font-medium mb-3">Recording Progress</h4>
        <div className="flex flex-wrap gap-2">
          {userEntries.map((entry, idx) => (
            <div
              key={entry.id}
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                recordedAudios[entry.id]
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-slate-600/50 text-slate-400 border border-slate-500/30'
              }`}
            >
              Line {idx + 1} {recordedAudios[entry.id] ? '(done)' : ''}
            </div>
          ))}
        </div>
      </div>

      {/* Finish Button */}
      <button
        onClick={handleFinish}
        disabled={!allUserLinesRecorded || loading}
        className="w-full py-4 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-bold text-lg rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-lg shadow-emerald-500/25"
      >
        {loading ? 'Evaluating...' : 'Finish & Get Feedback'}
      </button>
    </div>
  );
}

export default ConversationRolePlay;
