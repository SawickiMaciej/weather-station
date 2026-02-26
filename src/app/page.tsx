"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Thermometer, Droplets, MapPin, CalendarClock, AlertTriangle, WifiOff,
  ArrowDown, ArrowUp, Battery, Signal, Snowflake, Leaf, Activity, SlidersHorizontal
} from "lucide-react";

// --- KONFIGURACJA SUPABASE ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);

// --- TYPY DANYCH ---
type Measurement = {
  created_at: string;
  temperature: number;
  humidity: number;
  battery_voltage: number;
  signal_strength: number;
  station_id: string;
};

type Station = {
  id: string; 
  name: string;
  // Dodajemy nasz nowy JSON z ustawień!
  sensors_config?: Record<string, { name: string; offset: number }>;
};

const TIME_RANGES = [
  { label: "12h", hours: 12 },
  { label: "24h", hours: 24 },
  { label: "48h", hours: 48 },
  { label: "7 dni", hours: 168 },
];

export default function Dashboard() {
  const [data, setData] = useState<Measurement[]>([]); // Tu trzymamy surowe dane
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [selectedRange, setSelectedRange] = useState(24);

  // --- 1. POBIERANIE LISTY STACJI (z konfiguracją JSON) ---
  useEffect(() => {
    const fetchStations = async () => {
      const { data: stationsData } = await supabase.from("stations").select("*");
      if (stationsData && stationsData.length > 0) {
        setStations(stationsData);
        if (!selectedStationId) setSelectedStationId(stationsData[0].id);
      }
    };
    fetchStations();
  }, [selectedStationId]);

  // --- 2. POBIERANIE POMIARÓW ---
  useEffect(() => {
    if (!selectedStationId) return;

    const fetchData = async () => {
      setLoading(true);
      setData([]); 

      const startDate = new Date();
      startDate.setHours(startDate.getHours() - selectedRange);

      const { data: measurements, error } = await supabase
        .from("measurements")
        .select("*")
        .eq("station_id", selectedStationId)
        .gte("created_at", startDate.toISOString())
        .order("created_at", { ascending: true });

      if (!error) {
        setData(measurements || []);
      }
      setLoading(false);
    };

    fetchData();

    const channelName = `live-${selectedStationId}`; 
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "measurements", filter: `station_id=eq.${selectedStationId}` },
        (payload) => setData((current) => [...current, payload.new as Measurement])
      ).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedStationId, selectedRange]);

  // --- 3. MAGIA KALIBRACJI (Przeliczanie w locie) ---
  const currentStation = stations.find(s => s.id === selectedStationId);
  const tempOffset = currentStation?.sensors_config?.temp_air?.offset || 0;
  const humOffset = currentStation?.sensors_config?.humidity?.offset || 0;

  // Tworzymy nową tablicę ze skalibrowanymi wartościami, gotową do wyświetlenia
  const calibratedData = data.map(d => ({
    ...d,
    raw_temperature: d.temperature, // Zostawiamy w razie W
    raw_humidity: d.humidity,
    // Aplikujemy offsety z bazy:
    temperature: d.temperature + tempOffset,
    // Zabezpieczenie: wilgotność nie może wyjść poza 0-100%
    humidity: Math.max(0, Math.min(100, d.humidity + humOffset)), 
  }));

  // --- FUNKCJE FORMATUJĄCE ---
  const formatAxisDate = (isoString: string) => new Date(isoString).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
  
  // Używamy ZAWSZE zaktualizowanych danych (calibratedData) do statystyk!
  const last = calibratedData.length > 0 ? calibratedData[calibratedData.length - 1] : null;
  const isOffline = last ? (new Date().getTime() - new Date(last.created_at).getTime()) > 30 * 60 * 1000 : true;

  const minTemp = calibratedData.length ? Math.min(...calibratedData.map(d => d.temperature)) : null;
  const maxTemp = calibratedData.length ? Math.max(...calibratedData.map(d => d.temperature)) : null;

  // --- BATERIA I ZASIĘG ---
  const getBatteryPercentage = (voltage: number | undefined) => {
    if (!voltage) return "--";
    const percentage = ((voltage - 3.2) / (4.2 - 3.2)) * 100;
    return `${Math.max(0, Math.min(100, Math.round(percentage)))}%`;
  };

  const getBatteryColor = (voltage: number | undefined) => {
    if (!voltage) return "text-slate-500"; 
    if (voltage > 3.8) return "text-green-400"; 
    if (voltage > 3.5) return "text-blue-400";  
    if (voltage > 3.3) return "text-yellow-400"; 
    return "text-red-500 animate-pulse font-bold"; 
  };

  const getSignalInfo = (csq: number | undefined) => {
    if (csq === undefined || csq === 0) return { text: "Brak Zasięgu", color: "text-red-500" };
    if (csq >= 20) return { text: "Świetny (LTE)", color: "text-green-400" };
    if (csq >= 12) return { text: "Dobry", color: "text-blue-400" };
    return { text: "Słaby", color: "text-yellow-400" };
  };

  // --- ALERTY SADOWNICZE ---
  const isFrostWarning = last && last.temperature <= 2.5;
  const isFungusWarning = last && last.humidity >= 85 && last.temperature >= 10;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* --- NAGŁÓWEK --- */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-800 pb-6 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
              <Leaf className="w-8 h-8 text-emerald-500" />
              Panel Agrometeorologiczny
            </h1>
            <p className="text-slate-500 text-sm mt-1 flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Aktualizacja: {last ? new Date(last.created_at).toLocaleString("pl-PL") : "--"}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto items-center">
            <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 shadow-sm">
              <MapPin className="w-5 h-5 text-emerald-500 mr-2" />
              <select
                value={selectedStationId}
                onChange={(e) => setSelectedStationId(e.target.value)}
                className="bg-transparent text-sm font-medium text-white focus:outline-none cursor-pointer w-full"
                disabled={stations.length === 0}
              >
                {stations.length === 0 ? <option>Ładowanie stacji...</option> : stations.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-1">
              {TIME_RANGES.map((range) => (
                <button
                  key={range.label}
                  onClick={() => setSelectedRange(range.hours)}
                  className={`px-4 py-1.5 text-sm rounded-md transition-all ${
                    selectedRange === range.hours ? "bg-emerald-600 text-white font-medium shadow-md" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {isOffline && data.length > 0 && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded-xl flex items-center gap-3 animate-pulse">
            <WifiOff className="w-6 h-6" />
            <div>
              <p className="font-bold">Utracono połączenie ze stacją!</p>
              <p className="text-sm text-red-300">Ostatni pomiar jest starszy niż 30 minut. Sprawdź zasilanie w sadzie.</p>
            </div>
          </div>
        )}

        {/* --- KAFELKI KPI --- */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Temperatura */}
          <div className={`p-6 rounded-xl border relative overflow-hidden transition-colors ${isFrostWarning ? 'bg-blue-950/40 border-blue-800' : 'bg-slate-900 border-slate-800'}`}>
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-2">
                <Thermometer className={`w-5 h-5 ${isFrostWarning ? 'text-blue-400' : 'text-orange-500'}`} />
                <span className="text-slate-400 text-xs uppercase tracking-wider font-semibold">Temperatura Powietrza</span>
              </div>
              <div className="flex gap-2 text-xs font-mono">
                <span className="text-blue-400 bg-blue-500/10 px-2 rounded">↓ {minTemp?.toFixed(1)}°</span>
                <span className="text-red-400 bg-red-500/10 px-2 rounded">↑ {maxTemp?.toFixed(1)}°</span>
              </div>
            </div>
            <div className={`text-5xl font-bold mb-2 ${isFrostWarning ? 'text-blue-100' : 'text-white'}`}>
              {last ? `${last.temperature.toFixed(1)}°C` : "--"}
            </div>
            
            {/* Wskaźnik kalibracji */}
            <div className="flex items-center justify-between mt-2">
              <div className={`text-sm flex items-center gap-2 ${isFrostWarning ? 'text-blue-400 font-medium' : 'text-slate-500'}`}>
                {isFrostWarning ? <><Snowflake className="w-4 h-4"/> Uwaga! Ryzyko przymrozku</> : "Warunki optymalne"}
              </div>
              {tempOffset !== 0 && (
                <div className="text-xs text-slate-500 bg-slate-950 px-2 py-1 rounded flex items-center gap-1 border border-slate-800" title={`Odczyt surowy: ${last?.raw_temperature.toFixed(1)}°C`}>
                  <SlidersHorizontal className="w-3 h-3" /> Korekta {tempOffset > 0 ? `+${tempOffset}` : tempOffset}°C
                </div>
              )}
            </div>
          </div>

          {/* Wilgotność */}
          <div className={`p-6 rounded-xl border relative overflow-hidden transition-colors ${isFungusWarning ? 'bg-emerald-950/40 border-emerald-800' : 'bg-slate-900 border-slate-800'}`}>
            <div className="flex items-center gap-2 mb-4">
              <Droplets className="w-5 h-5 text-sky-500" />
              <span className="text-slate-400 text-xs uppercase tracking-wider font-semibold">Wilgotność Względna</span>
            </div>
            <div className="text-5xl font-bold text-white mb-2">
              {last ? `${last.humidity.toFixed(0)}%` : "--"}
            </div>
            
            <div className="flex items-center justify-between mt-2">
              <div className={`text-sm flex items-center gap-2 ${isFungusWarning ? 'text-emerald-400 font-medium' : 'text-slate-500'}`}>
                {isFungusWarning ? <><AlertTriangle className="w-4 h-4"/> Wysokie ryzyko infekcji grzybowej</> : "Brak zagrożeń"}
              </div>
              {humOffset !== 0 && (
                <div className="text-xs text-slate-500 bg-slate-950 px-2 py-1 rounded flex items-center gap-1 border border-slate-800" title={`Odczyt surowy: ${last?.raw_humidity.toFixed(0)}%`}>
                  <SlidersHorizontal className="w-3 h-3" /> Korekta {humOffset > 0 ? `+${humOffset}` : humOffset}%
                </div>
              )}
            </div>
          </div>

          {/* Diagnostyka (Bateria i Sygnał) - Bez zmian */}
          <div className="p-6 rounded-xl border bg-slate-900 border-slate-800 flex flex-col justify-between">
             <div className="flex items-center gap-2 mb-4">
              <Activity className="w-5 h-5 text-slate-400" />
              <span className="text-slate-400 text-xs uppercase tracking-wider font-semibold">Diagnostyka Urządzenia</span>
            </div>
            <div className="space-y-4">
              <div className="flex justify-between items-center bg-slate-950 p-3 rounded-lg border border-slate-800/50">
                <div className="flex items-center gap-3">
                  <Battery className={`w-6 h-6 ${getBatteryColor(last?.battery_voltage)}`} />
                  <span className="text-sm font-medium text-slate-300">Zasilanie (18650)</span>
                </div>
                <div className="text-right">
                  <div className={`text-lg font-bold ${getBatteryColor(last?.battery_voltage)}`}>{getBatteryPercentage(last?.battery_voltage)}</div>
                  <div className="text-xs text-slate-500">{last?.battery_voltage ? `${last.battery_voltage.toFixed(2)} V` : "--"}</div>
                </div>
              </div>
              <div className="flex justify-between items-center bg-slate-950 p-3 rounded-lg border border-slate-800/50">
                <div className="flex items-center gap-3">
                  <Signal className={`w-6 h-6 ${getSignalInfo(last?.signal_strength).color}`} />
                  <span className="text-sm font-medium text-slate-300">Sieć Komórkowa</span>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-bold ${getSignalInfo(last?.signal_strength).color}`}>{getSignalInfo(last?.signal_strength).text}</div>
                  <div className="text-xs text-slate-500">CSQ: {last?.signal_strength ?? "--"}/31</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* --- WYKRESY (Zasilone skalibrowanymi danymi!) --- */}
        <div className="grid lg:grid-cols-2 gap-6 mt-6">
          <div className="bg-slate-900 p-5 rounded-xl border border-slate-800">
            <h3 className="text-sm font-medium text-slate-400 mb-6 flex justify-between">
              <span>Historia Temperatury</span>
            </h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                {/* TUTAJ WCHODZĄ PRZELICZONE DANE: data={calibratedData} */}
                <AreaChart data={calibratedData}>
                  <defs>
                    <linearGradient id="gradTemp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="created_at" tickFormatter={formatAxisDate} stroke="#475569" fontSize={11} minTickGap={30} />
                  <YAxis stroke="#475569" fontSize={11} domain={['auto', 'auto']} width={35} />
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155" }} itemStyle={{ color: "#f97316" }} labelFormatter={(v) => new Date(v).toLocaleString()} />
                  <Area type="monotone" dataKey="temperature" stroke="#f97316" strokeWidth={2} fill="url(#gradTemp)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-slate-900 p-5 rounded-xl border border-slate-800">
            <h3 className="text-sm font-medium text-slate-400 mb-6 flex justify-between">
              <span>Historia Wilgotności</span>
            </h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                {/* TUTAJ WCHODZĄ PRZELICZONE DANE: data={calibratedData} */}
                <LineChart data={calibratedData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="created_at" tickFormatter={formatAxisDate} stroke="#475569" fontSize={11} minTickGap={30} />
                  <YAxis stroke="#475569" fontSize={11} domain={[0, 100]} width={35} />
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155" }} itemStyle={{ color: "#0ea5e9" }} labelFormatter={(v) => new Date(v).toLocaleString()} />
                  <Line type="monotone" dataKey="humidity" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}