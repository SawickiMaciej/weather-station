"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Save, Settings2, MapPin, Plus, Trash2, Loader2, Thermometer } from "lucide-react";

// Inicjalizacja klienta Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);

type Station = {
  id: string;
  name: string;
  sensors_config: Record<string, { name: string; offset: number }>;
};

type SensorInput = {
  key: string;
  name: string;
  offset: number;
};

export default function SettingsPage() {
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Stan przechowujący aktualnie edytowane czujniki
  const [sensors, setSensors] = useState<SensorInput[]>([]);

  // 1. POBIERANIE STACJI Z BAZY
  useEffect(() => {
    const fetchStations = async () => {
      setLoading(true);
      const { data, error } = await supabase.from("stations").select("*");
      
      if (data && data.length > 0) {
        setStations(data);
        const firstStation = data[0];
        setSelectedStationId(firstStation.id);
        loadSensorsIntoState(firstStation.sensors_config);
      }
      setLoading(false);
    };
    fetchStations();
  }, []);

  // 2. ŁADOWANIE JSON-A DO FORMULARZA
  const loadSensorsIntoState = (config: Record<string, { name: string; offset: number }> | null) => {
    if (!config || Object.keys(config).length === 0) {
      // Domyślny zestaw, jeśli JSON w bazie jest pusty
      setSensors([
        { key: "temp_air", name: "Temperatura Powietrza", offset: 0.0 },
        { key: "humidity", name: "Wilgotność Względna", offset: 0.0 }
      ]);
      return;
    }

    // Zamiana obiektu JSON na tablicę, żeby łatwo to renderować w React
    const loadedSensors = Object.entries(config).map(([key, val]) => ({
      key,
      name: val.name,
      offset: val.offset,
    }));
    setSensors(loadedSensors);
  };

  // Obsługa zmiany wybranej stacji w dropdownie
  const handleStationChange = (id: string) => {
    setSelectedStationId(id);
    const station = stations.find(s => s.id === id);
    if (station) {
      loadSensorsIntoState(station.sensors_config);
    }
  };

  // 3. ZAPIS DO BAZY DATY
  const handleSave = async () => {
    setSaving(true);
    
    // Pakujemy tablicę z powrotem do zgrabnego obiektu JSON
    const updatedConfig: Record<string, { name: string; offset: number }> = {};
    sensors.forEach(s => {
      updatedConfig[s.key] = { name: s.name, offset: s.offset };
    });

    const { error } = await supabase
      .from("stations")
      .update({ sensors_config: updatedConfig })
      .eq("id", selectedStationId);

    if (error) {
      alert("Błąd podczas zapisywania!");
      console.error(error);
    } else {
      // Aktualizujemy stan lokalny, żeby nie musieć odświeżać strony
      setStations(stations.map(st => st.id === selectedStationId ? { ...st, sensors_config: updatedConfig } : st));
      alert("Zapisano pomyślnie!");
    }
    setSaving(false);
  };

  // Dodawanie nowego pustego czujnika
  const addSensor = () => {
    const newKey = `sensor_${Date.now()}`;
    setSensors([...sensors, { key: newKey, name: "Nowy czujnik", offset: 0.0 }]);
  };

  // Usuwanie czujnika
  const removeSensor = (keyToRemove: string) => {
    setSensors(sensors.filter(s => s.key !== keyToRemove));
  };

  // Aktualizacja wartości w polach tekstowych
  const updateSensor = (key: string, field: "name" | "offset", value: string | number) => {
    setSensors(sensors.map(s => {
      if (s.key === key) {
        return { ...s, [field]: value };
      }
      return s;
    }));
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-emerald-500"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* NAGŁÓWEK */}
        <div className="flex items-center gap-3 border-b border-slate-800 pb-6">
          <Settings2 className="w-8 h-8 text-emerald-500" />
          <h1 className="text-3xl font-bold text-white tracking-tight">Ustawienia Stacji</h1>
        </div>

        {/* WYBÓR STACJI */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <label className="block text-sm font-medium text-slate-400 mb-2 flex items-center gap-2">
            <MapPin className="w-4 h-4" /> Wybierz stację do konfiguracji
          </label>
          <select
            value={selectedStationId}
            onChange={(e) => handleStationChange(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-emerald-500 transition-colors"
          >
            {stations.map((s) => (
              <option key={s.id} value={s.id}>{s.name} (ID: {s.id})</option>
            ))}
          </select>
        </div>

        {/* KALIBRACJA CZUJNIKÓW */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Thermometer className="w-5 h-5 text-emerald-500" /> Kalibracja Czujników
              </h2>
              <p className="text-sm text-slate-400 mt-1">Skoryguj błędy pomiarowe (offset). Wartość zostanie dodana lub odjęta od odczytu.</p>
            </div>
            <button 
              onClick={addSensor}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Dodaj czujnik
            </button>
          </div>

          <div className="space-y-4">
            {sensors.map((sensor) => (
              <div key={sensor.key} className="flex flex-col sm:flex-row gap-4 items-center bg-slate-950 p-4 rounded-lg border border-slate-800/50">
                
                {/* Nazwa czujnika */}
                <div className="w-full sm:w-1/2">
                  <label className="block text-xs text-slate-500 mb-1 uppercase tracking-wider">Nazwa Wyświetlana</label>
                  <input
                    type="text"
                    value={sensor.name}
                    onChange={(e) => updateSensor(sensor.key, "name", e.target.value)}
                    className="w-full bg-transparent border-b border-slate-700 text-white py-1 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Offset (Korekta) */}
                <div className="w-full sm:w-1/3">
                  <label className="block text-xs text-slate-500 mb-1 uppercase tracking-wider">Korekta (np. -1.5)</label>
                  <div className="flex items-center">
                    <input
                      type="number"
                      step="0.1"
                      value={sensor.offset}
                      onChange={(e) => updateSensor(sensor.key, "offset", parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500 text-center"
                    />
                  </div>
                </div>

                {/* Usuń */}
                <div className="w-full sm:w-auto flex justify-end">
                  <button 
                    onClick={() => removeSensor(sensor.key)}
                    className="text-slate-500 hover:text-red-400 transition-colors p-2"
                    title="Usuń czujnik z konfiguracji"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
            
            {sensors.length === 0 && (
              <div className="text-center py-8 text-slate-500 border border-dashed border-slate-800 rounded-lg">
                Brak skonfigurowanych czujników. Kliknij "Dodaj czujnik", aby zacząć.
              </div>
            )}
          </div>

          {/* PRZYCISK ZAPISZ */}
          <div className="mt-8 flex justify-end border-t border-slate-800 pt-6">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2.5 rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              {saving ? "Zapisywanie..." : "Zapisz Ustawienia"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}