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
      <label className="block text-gray-600 font-medium mb-2">
        Question{" "}
        <span className="text-gray-500 text-sm">
          (optional - for relevance scoring)
        </span>
      </label>

      {/* Selection Mode */}
      <div className="grid grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => handleModeChange("topic")}
          disabled={disabled}
          className={`py-3 px-4 rounded-xl font-semibold transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-50 ${
            selectionMode === "topic"
              ? "bg-blue-600 text-gray-900 shadow-lg shadow-blue-500/25 scale-105 focus:ring-blue-400"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 hover:scale-102 focus:ring-gray-400"
          }`}
        >
          <span className="mr-2">📋</span>
          Topic
        </button>
        <button
          type="button"
          onClick={() => handleModeChange("custom")}
          disabled={disabled}
          className={`py-3 px-4 rounded-xl font-semibold transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-50 ${
            selectionMode === "custom"
              ? "bg-blue-600 text-gray-900 shadow-lg shadow-blue-500/25 scale-105 focus:ring-blue-400"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 hover:scale-102 focus:ring-gray-400"
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
          className={`py-3 px-4 rounded-xl font-semibold transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-50 ${
            selectionMode === "random"
              ? "bg-blue-600 text-gray-900 shadow-lg shadow-blue-500/25 scale-105 focus:ring-blue-400"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 hover:scale-102 focus:ring-gray-400"
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
            className="w-full px-4 py-3 bg-gray-100 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent hover:border-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                className="flex-1 px-4 py-3 bg-gray-100 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent hover:border-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-gray-900 text-xl rounded-xl transition-all duration-300 shadow-lg shadow-blue-500/25 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
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
          className="w-full px-4 py-3 bg-gray-100 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent hover:border-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        />
      )}

      {/* Random Mode - Show selected question */}
      {selectionMode === "random" && selectedQuestion && (
        <div className="px-4 py-4 bg-blue-50 border border-blue-200 rounded-xl backdrop-blur-sm">
          <p className="text-blue-600 text-xs font-semibold mb-2 uppercase tracking-wider">
            📍 Topic: {selectedTopic}
          </p>
          <p className="text-gray-900 leading-relaxed">{selectedQuestion}</p>
        </div>
      )}
    </div>
  );
}

export default QuestionSelector;
