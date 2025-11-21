import { useState, useEffect } from "react";

function QuestionSelector({ questions, topics, onQuestionChange, disabled }) {
  const [selectionMode, setSelectionMode] = useState("topic"); // 'topic', 'custom', 'random'
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
        <span className="text-slate-500">
          (optional - for relevance scoring)
        </span>
      </label>

      {/* Selection Mode */}
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => handleModeChange("topic")}
          disabled={disabled}
          className={`py-2 px-4 rounded-lg font-medium transition-all ${
            selectionMode === "topic"
              ? "bg-purple-500 text-white"
              : "bg-slate-600 text-slate-300 hover:bg-slate-500"
          }`}
        >
          📋 Select Topic
        </button>
        <button
          type="button"
          onClick={() => handleModeChange("custom")}
          disabled={disabled}
          className={`py-2 px-4 rounded-lg font-medium transition-all ${
            selectionMode === "custom"
              ? "bg-pink-500 text-white"
              : "bg-slate-600 text-slate-300 hover:bg-slate-500"
          }`}
        >
          ✏️ Custom Input
        </button>
        <button
          type="button"
          onClick={() => {
            handleModeChange("random");
            handleRandomAll();
          }}
          disabled={disabled}
          className={`py-2 px-4 rounded-lg font-medium transition-all ${
            selectionMode === "random"
              ? "bg-amber-500 text-white"
              : "bg-slate-600 text-slate-300 hover:bg-slate-500"
          }`}
        >
          🎲 Random
        </button>
      </div>

      {/* Topic Selection Mode */}
      {selectionMode === "topic" && (
        <div className="space-y-3">
          <select
            value={selectedTopic}
            onChange={(e) => handleTopicChange(e.target.value)}
            disabled={disabled}
            className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50"
          >
            <option value="">-- Select a topic --</option>
            {topics.map((topic) => (
              <option key={topic} value={topic}>
                {topic}
              </option>
            ))}
          </select>

          {selectedTopic && (
            <>
              <div className="flex gap-2">
                <select
                  value={selectedQuestion}
                  onChange={(e) => setSelectedQuestion(e.target.value)}
                  disabled={disabled}
                  className="flex-1 px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50"
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
                  className="px-4 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition-all"
                  title="Random question in this topic"
                >
                  🎲
                </button>
              </div>
            </>
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
          className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-pink-500 focus:border-transparent disabled:opacity-50"
        />
      )}

      {/* Random Mode - Show selected question */}
      {selectionMode === "random" && selectedQuestion && (
        <div className="space-y-2">
          <div className="px-4 py-3 bg-slate-700/50 border border-amber-500/50 rounded-xl text-white">
            <p className="text-amber-400 text-xs mb-1">
              Topic: {selectedTopic}
            </p>
            <p>{selectedQuestion}</p>
          </div>
          {/*
          <button
            type="button"
            onClick={handleRandomAll}
            disabled={disabled}
            className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition-all"
          >
            🎲 Get Another Random Question
          </button>
          */}
        </div>
      )}

      {/* Display selected question */}
      {selectionMode === "topic" && selectedQuestion && (
        <div className="px-4 py-3 bg-slate-700/30 border border-purple-500/50 rounded-xl text-emerald-400 text-sm">
          Selected: {selectedQuestion}
        </div>
      )}
    </div>
  );
}

export default QuestionSelector;
