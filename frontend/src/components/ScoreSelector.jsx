function ScoreSelector({ activeSystem, onSystemChange, availableSystems }) {
  const systems = [
    {
      id: "ielts",
      name: "IELTS",
      color: "from-cyan-500 to-blue-600",
      available: availableSystems?.ielts,
    },
    {
      id: "pte",
      name: "PTE",
      color: "from-blue-500 to-cyan-500",
      available: availableSystems?.pte,
    },
    {
      id: "toeic",
      name: "TOEIC",
      color: "from-teal-500 to-cyan-500",
      available: availableSystems?.toeic,
    },
    {
      id: "cefr",
      name: "CEFR",
      color: "from-sky-500 to-blue-500",
      available: availableSystems?.cefr,
    },
  ];

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-4 shadow-xl border border-slate-700/50 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🎯</span>
        <h3 className="text-white font-semibold">Scoring System</h3>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {systems.map((system) => {
          const isActive = activeSystem === system.id;
          const isAvailable = system.available !== false;

          return (
            <button
              key={system.id}
              onClick={() => isAvailable && onSystemChange(system.id)}
              disabled={!isAvailable}
              className={`
                relative p-4 rounded-xl font-semibold transition-all duration-300
                ${
                  isActive
                    ? `bg-gradient-to-r ${system.color} text-white shadow-lg scale-105`
                    : isAvailable
                    ? "bg-slate-700/50 text-slate-300 hover:bg-slate-700 hover:scale-102"
                    : "bg-slate-800/30 text-slate-600 cursor-not-allowed opacity-50"
                }
              `}
            >
              <div className="flex flex-col items-center gap-2">
                <span className="text-sm">{system.name}</span>
              </div>

              {isActive && (
                <div className="absolute top-2 right-2">
                  <div className="w-2 h-2 rounded-full bg-white animate-pulse"></div>
                </div>
              )}

              {!isAvailable && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50 rounded-xl">
                  <span className="text-xs text-slate-500">N/A</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 text-xs text-slate-500 text-center">
        Select a scoring system to view results
      </div>
    </div>
  );
}

export default ScoreSelector;
