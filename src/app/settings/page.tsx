export default function SettingsPage() {
  return (
    <main className="min-h-screen bg-slate-900 text-white p-4 md:p-8">
      <h1 className="text-2xl font-bold mb-6 text-slate-100">Ustawienia Systemu</h1>
      
      <div className="max-w-2xl space-y-6">
        
        {/* SEKCJA 1: Powiadomienia */}
        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700">
          <h2 className="text-lg font-semibold mb-4 text-green-400">Powiadomienia SMS</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span>Alarm przymrozkowy (poniżej 0°C)</span>
              <div className="w-12 h-6 bg-green-600 rounded-full relative cursor-pointer">
                <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full"></div>
              </div>
            </div>
            <div className="flex items-center justify-between opacity-50">
              <span>Alarm wilgotności (Parch)</span>
              <div className="w-12 h-6 bg-slate-600 rounded-full relative cursor-pointer">
                <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full"></div>
              </div>
            </div>
          </div>
        </div>

        {/* SEKCJA 2: Stacja */}
        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700">
          <h2 className="text-lg font-semibold mb-4 text-blue-400">Konfiguracja Stacji</h2>
          <div className="grid gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Nazwa stacji</label>
              <input type="text" value="Sad Jabłoniowy - Kwatera 4" className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white" readOnly />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Interwał pomiarów</label>
              <select className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white">
                <option>Co 15 minut</option>
                <option>Co 30 minut</option>
                <option>Co godzinę</option>
              </select>
            </div>
          </div>
        </div>

      </div>
    </main>
  );
}