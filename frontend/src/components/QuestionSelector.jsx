import { useState, useEffect } from "react";

function QuestionSelector({ questions, topics, onQuestionChange, disabled }) {
  const [selectionMode, setSelectionMode] = useState("topic");
  const [selectedTopic, setSelectedTopic] = useState("");
  const [selectedQuestion, setSelectedQuestion] = useState("");
  const [customQuestion, setCustomQuestion] = useState("");

  const filteredQuestions = selectedTopic
    ? questions.filter((q) => q.topic === selectedTopic)
    : questions;

  useEffect(() => {
    if (selectionMode === "custom") {
      onQuestionChange(customQuestion);
    } else if (selectionMode === "random") {
      onQuestionChange(selectedQuestion);
    } else {
      onQuestionChange(selectedQuestion);
    }
  }, [selectedQuestion, customQuestion, selectionMode]);

  const handleModeChange = (mode) => {
    setSelectionMode(mode);
    setSelectedQuestion("");
    setCustomQuestion("");
    setSelectedTopic("");
    onQuestionChange("");
  };

  const handleTopicChange = (topic) => {
    setSelectedTopic(topic);
    setSelectedQuestion("");
  };

  const handleRandomQuestion = () => {
    const pool = selectedTopic ? filteredQuestions : questions;
    if (pool.length > 0) {
      const randomIndex = Math.floor(Math.random() * pool.length);
      setSelectedQuestion(pool[randomIndex].question);
    }
  };

  const handleRandomAll = () => {
    if (questions.length > 0) {
      const randomIndex = Math.floor(Math.random() * questions.length);
      const q = questions[randomIndex];
      setSelectedTopic(q.topic);
      setSelectedQuestion(q.question);
    }
  };

  return (
    <div className="space-y-4">
      <label className="block text-slate-300 font-medium mb-2">
        Question{" "}
        <span className="text-slate-500 text-sm">
          (optional - for relevance scoring)
        </span>
      </label>

      {/* Selection Mode */}
      <div className="grid grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => handleModeChange("topic")}
          disabled={disabled}
          className={`py-3 px-4 rounded-xl font-semibold transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 ${
            selectionMode === "topic"
              ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/25 scale-105 focus:ring-purple-400"
              : "bg-slate-700/50 text-slate-300 hover:bg-slate-700 hover:text-white hover:scale-102 focus:ring-slate-600"
          }`}
        >
          <span className="mr-2">📋</span>
          Topic
        </button>
        <button
          type="button"
          onClick={() => handleModeChange("custom")}
          disabled={disabled}
          className={`py-3 px-4 rounded-xl font-semibold transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 ${
            selectionMode === "custom"
              ? "bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-lg shadow-pink-500/25 scale-105 focus:ring-pink-400"
              : "bg-slate-700/50 text-slate-300 hover:bg-slate-700 hover:text-white hover:scale-102 focus:ring-slate-600"
          }`}
        >
          <span className="mr-2">✏️</span>
          Custom
        </button>
        <button
          type="button"
          onClick={() => {
            handleModeChange("random");
            handleRandomAll();
          }}
          disabled={disabled}
          className={`py-3 px-4 rounded-xl font-semibold transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 ${
            selectionMode === "random"
              ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/25 scale-105 focus:ring-amber-400"
              : "bg-slate-700/50 text-slate-300 hover:bg-slate-700 hover:text-white hover:scale-102 focus:ring-slate-600"
          }`}
        >
          <span className="mr-2">🎲</span>
          Random
        </button>
      </div>

      {/* Topic Selection Mode */}
      {selectionMode === "topic" && (
        <div className="space-y-3">
          <select
            value={selectedTopic}
            onChange={(e) => handleTopicChange(e.target.value)}
            disabled={disabled}
            className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent hover:border-slate-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">-- Select a topic --</option>
            {topics.map((topic) => (
              <option key={topic} value={topic}>
                {topic}
              </option>
            ))}
          </select>

          {selectedTopic && (
            <div className="flex gap-2">
              <select
                value={selectedQuestion}
                onChange={(e) => setSelectedQuestion(e.target.value)}
                disabled={disabled}
                className="flex-1 px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent hover:border-slate-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">-- Select a question --</option>
                {filteredQuestions.map((q) => (
                  <option key={q.id} value={q.question}>
                    {q.question}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleRandomQuestion}
                disabled={disabled}
                className="px-5 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-xl rounded-xl transition-all duration-300 shadow-lg shadow-amber-500/25 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Random question in this topic"
              >
                🎲
              </button>
            </div>
          )}
        </div>
      )}

      {/* Custom Input Mode */}
      {selectionMode === "custom" && (
        <input
          type="text"
          value={customQuestion}
          onChange={(e) => setCustomQuestion(e.target.value)}
          placeholder="Enter your custom question..."
          disabled={disabled}
          className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent hover:border-slate-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        />
      )}

      {/* Random Mode - Show selected question */}
      {selectionMode === "random" && selectedQuestion && (
        <div className="px-4 py-4 bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/30 rounded-xl backdrop-blur-sm">
          <p className="text-amber-400 text-xs font-semibold mb-2 uppercase tracking-wider">
            📍 Topic: {selectedTopic}
          </p>
          <p className="text-white leading-relaxed">{selectedQuestion}</p>
        </div>
      )}
    </div>
  );
}

export default QuestionSelector;
