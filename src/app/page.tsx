"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Thermometer, Droplets, MapPin, CalendarClock, AlertTriangle, WifiOff,
  ArrowDown, ArrowUp, Battery, Signal, Snowflake, Leaf, Activity, SlidersHorizontal,
  Droplet, Cloud, Zap, TrendingDown
} from "lucide-react";

// --- KONFIGURACJA SUPABASE ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);

// --- TYPY DANYCH ---
type ExtraData = {
  soil_moisture?: string | number;
  soil_temperature?: string | number;
  rain_intensity?: string | number; // ZMIENIONA NAZWA - to jest kumulacyjny rain gauge!
  [key: string]: any;
};

type Measurement = {
  created_at: string;
  temperature: number;
  humidity: number;
  battery_voltage: number;
  signal_strength: number;
  station_id: string;
  extra_data?: ExtraData;
};

type Station = {
  id: string; 
  name: string;
  sensors_config?: Record<string, { name: string; offset: number }>;
  rain_gauge_baseline?: number; // Kumulacyjna wartość z ostatniego resetu
};

const TIME_RANGES = [
  { label: "24h", hours: 24 },
  { label: "7 dni", hours: 168 },
  { label: "30 dni", hours: 720 },
];

// DFRobot rain gauge: każdy 0.1mm opad = wartość rośnie o 1
// Założenie: wartość w bazie to kumulacyjna liczba przechylów
// Jeśli ostatnio zmierzyliśmy 0.8, a teraz jest 0.9, to spadło 0.1mm
const RAIN_GAUGE_INCREMENT = 0.01; // mm per tick (jeśli DFRobot liczy w krokach co 0.01mm)

export default function Dashboard() {
  const [data, setData] = useState<Measurement[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [selectedRange, setSelectedRange] = useState(24);
  const [showRainChart, setShowRainChart] = useState(false);

  // --- 1. POBIERANIE LISTY STACJI ---
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

  // --- 3. KALIBRACJA TEMPERATURY I WILGOTNOŚCI ---
  const currentStation = stations.find(s => s.id === selectedStationId);
  const tempOffset = currentStation?.sensors_config?.temp_air?.offset || 0;
  const humOffset = currentStation?.sensors_config?.humidity?.offset || 0;

  const calibratedData = data.map(d => ({
    ...d,
    raw_temperature: d.temperature,
    raw_humidity: d.humidity,
    temperature: d.temperature + tempOffset,
    humidity: Math.max(0, Math.min(100, d.humidity + humOffset)), 
  }));

  // --- 4. MAGIA DESZCZU - OBLICZANIE OPADÓW GODZINOWYCH/DOBOWYCH ---
  // Kluczowa logika: rain gauge to LICZNIK PRZECHYLÓW (kumulacyjny)
  // Aby wiedzieć ile spadło w danym okresie, bierz różnicę między pomiarami
  
  const getRainData = () => {
    if (calibratedData.length < 2) return [];

    // Grupujemy pomiary po dniach (dla zakresu 24h+)
    const rainByDay: Record<string, { date: string; precipitation: number; count: number }> = {};

    for (let i = 1; i < calibratedData.length; i++) {
      const prev = calibratedData[i - 1];
      const curr = calibratedData[i];

      const prevRain = parseFloat(String(prev.extra_data?.rain_intensity || 0));
      const currRain = parseFloat(String(curr.extra_data?.rain_intensity || 0));

      // Jeśli wartość wzrosła, to padało
      const rainDiff = currRain > prevRain ? (currRain - prevRain) * RAIN_GAUGE_INCREMENT : 0;

      if (rainDiff > 0) {
        const dayKey = new Date(curr.created_at).toLocaleDateString("pl-PL");
        if (!rainByDay[dayKey]) {
          rainByDay[dayKey] = { date: dayKey, precipitation: 0, count: 0 };
        }
        rainByDay[dayKey].precipitation += rainDiff;
        rainByDay[dayKey].count += 1;
      }
    }

    // Konwertuj do tablicy dla wykresu
    return Object.values(rainByDay)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map(d => ({
        ...d,
        precipitation: parseFloat(d.precipitation.toFixed(2))
      }));
  };

  const rainChartData = getRainData();
  const totalRain = rainChartData.reduce((sum, d) => sum + d.precipitation, 0);
  const maxRainDay = rainChartData.length > 0 
    ? Math.max(...rainChartData.map(d => d.precipitation))
    : 0;

  // --- STATYSTYKI OGÓLNE ---
  const last = calibratedData.length > 0 ? calibratedData[calibratedData.length - 1] : null;
  const isOffline = last ? (new Date().getTime() - new Date(last.created_at).getTime()) > 30 * 60 * 1000 : true;

  const minTemp = calibratedData.length ? Math.min(...calibratedData.map(d => d.temperature)) : null;
  const maxTemp = calibratedData.length ? Math.max(...calibratedData.map(d => d.temperature)) : null;

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

  const formatAxisDate = (isoString: string) => new Date(isoString).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });

  // --- ALERTY SADOWNICZE ---
  const isFrostWarning = last && last.temperature <= 2.5;
  const isFungusWarning = last && last.humidity >= 85 && last.temperature >= 10;
  const isHighRain = totalRain > 20; // Jeśli spadło >20mm w wybranym okresie

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
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

          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-wider font-semibold block mb-2">Wybierz Stację</label>
              <select 
                value={selectedStationId} 
                onChange={(e) => setSelectedStationId(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-white px-3 py-2 rounded-lg text-sm"
              >
                {stations.map((s) => (
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
              <p className="text-sm text-red-300">Ostatni pomiar jest starszy niż 30 minut.</p>
            </div>
          </div>
        )}

        {/* --- KAFELKI KPI --- */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          
          {/* Temperatura Powietrza */}
          <div className={`p-6 rounded-xl border relative overflow-hidden transition-colors ${isFrostWarning ? 'bg-blue-950/40 border-blue-800' : 'bg-slate-900 border-slate-800'}`}>
            <div className="flex items-center gap-2 mb-4">
              <Thermometer className={`w-5 h-5 ${isFrostWarning ? 'text-blue-400' : 'text-orange-500'}`} />
              <span className="text-slate-400 text-xs uppercase tracking-wider font-semibold">Temperatura</span>
            </div>
            <div className={`text-4xl font-bold mb-2 ${isFrostWarning ? 'text-blue-100' : 'text-white'}`}>
              {last ? `${last.temperature.toFixed(1)}°C` : "--"}
            </div>
            <div className="text-xs text-slate-500 flex gap-2">
              <span className="text-blue-400">↓{minTemp?.toFixed(1)}°</span>
              <span className="text-red-400">↑{maxTemp?.toFixed(1)}°</span>
            </div>
          </div>

          {/* Wilgotność Powietrza */}
          <div className={`p-6 rounded-xl border relative overflow-hidden transition-colors ${isFungusWarning ? 'bg-emerald-950/40 border-emerald-800' : 'bg-slate-900 border-slate-800'}`}>
            <div className="flex items-center gap-2 mb-4">
              <Droplets className="w-5 h-5 text-sky-500" />
              <span className="text-slate-400 text-xs uppercase tracking-wider font-semibold">Wilgotność</span>
            </div>
            <div className="text-4xl font-bold text-white mb-2">
              {last ? `${last.humidity.toFixed(0)}%` : "--"}
            </div>
            <div className="text-xs text-slate-500">
              {isFungusWarning ? "⚠️ Ryzyko grzyba" : "Norma"}
            </div>
          </div>

          {/* Temperatura Gleby */}
          <div className="p-6 rounded-xl border bg-slate-900 border-slate-800">
            <div className="flex items-center gap-2 mb-4">
              <Thermometer className="w-5 h-5 text-amber-600" />
              <span className="text-slate-400 text-xs uppercase tracking-wider font-semibold">Gleba °C</span>
            </div>
            <div className="text-4xl font-bold text-amber-300 mb-2">
              {last?.extra_data?.soil_temperature ? `${parseFloat(String(last.extra_data.soil_temperature)).toFixed(1)}°` : "--"}
            </div>
            <div className="text-xs text-slate-500">Temperatura gruntu</div>
          </div>

          {/* Wilgotność Gleby */}
          <div className="p-6 rounded-xl border bg-slate-900 border-slate-800">
            <div className="flex items-center gap-2 mb-4">
              <Droplet className="w-5 h-5 text-cyan-500" />
              <span className="text-slate-400 text-xs uppercase tracking-wider font-semibold">Wilg. Gleby</span>
            </div>
            <div className="text-4xl font-bold text-cyan-300 mb-2">
              {last?.extra_data?.soil_moisture ? `${parseFloat(String(last.extra_data.soil_moisture)).toFixed(0)}%` : "--"}
            </div>
            <div className="text-xs text-slate-500">Zawartość wody</div>
          </div>

          {/* Opad - NOWA LOGIKA */}
          <div className={`p-6 rounded-xl border ${isHighRain ? 'bg-cyan-950/40 border-cyan-800' : 'bg-slate-900 border-slate-800'}`}>
            <div className="flex items-center gap-2 mb-4">
              <Cloud className={`w-5 h-5 ${isHighRain ? 'text-cyan-400' : 'text-slate-400'}`} />
              <span className="text-slate-400 text-xs uppercase tracking-wider font-semibold">Opad</span>
            </div>
            <div className={`text-4xl font-bold mb-2 ${isHighRain ? 'text-cyan-300' : 'text-white'}`}>
              {totalRain.toFixed(1)}mm
            </div>
            <div className="text-xs text-slate-500">
              {selectedRange === 24 ? "za 24h" : selectedRange === 168 ? "za 7 dni" : "za 30 dni"}
            </div>
          </div>
        </div>

        {/* --- DIAGNOSTYKA URZĄDZENIA --- */}
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-slate-400" />
            <span className="text-slate-400 text-xs uppercase tracking-wider font-semibold">Diagnostyka Urządzenia</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex justify-between items-center bg-slate-950 p-4 rounded-lg border border-slate-800/50">
              <div className="flex items-center gap-3">
                <Battery className={`w-6 h-6 ${getBatteryColor(last?.battery_voltage)}`} />
                <div>
                  <span className="text-sm font-medium text-slate-300 block">Zasilanie (18650)</span>
                  <span className="text-xs text-slate-500">{last?.battery_voltage ? `${last.battery_voltage.toFixed(2)} V` : "--"}</span>
                </div>
              </div>
              <div className={`text-2xl font-bold ${getBatteryColor(last?.battery_voltage)}`}>{getBatteryPercentage(last?.battery_voltage)}</div>
            </div>
            <div className="flex justify-between items-center bg-slate-950 p-4 rounded-lg border border-slate-800/50">
              <div className="flex items-center gap-3">
                <Signal className={`w-6 h-6 ${getSignalInfo(last?.signal_strength).color}`} />
                <div>
                  <span className="text-sm font-medium text-slate-300 block">Sieć Komórkowa</span>
                  <span className="text-xs text-slate-500">CSQ: {last?.signal_strength ?? "--"}/31</span>
                </div>
              </div>
              <div className={`text-sm font-bold ${getSignalInfo(last?.signal_strength).color}`}>{getSignalInfo(last?.signal_strength).text}</div>
            </div>
          </div>
        </div>

        {/* --- WYKRESY TEMPERATURY I WILGOTNOŚCI --- */}
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-slate-900 p-5 rounded-xl border border-slate-800">
            <h3 className="text-sm font-medium text-slate-400 mb-6">Historia Temperatury</h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
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
            <h3 className="text-sm font-medium text-slate-400 mb-6">Historia Wilgotności</h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
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

        {/* --- WYKRES OPADÓW DOBOWYCH (NOWY!) --- */}
        {rainChartData.length > 0 && (
          <div className="bg-slate-900 p-5 rounded-xl border border-slate-800">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-sm font-medium text-slate-400">Historia Opadów</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Łącznie: <span className="font-bold text-cyan-400">{totalRain.toFixed(1)} mm</span> | 
                  Max dziennie: <span className="font-bold text-cyan-400">{maxRainDay.toFixed(1)} mm</span>
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Cloud className="w-4 h-4" />
                {rainChartData.length} dni z opadem
              </div>
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rainChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    stroke="#475569" 
                    fontSize={11}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis stroke="#475569" fontSize={11} label={{ value: 'mm', angle: -90, position: 'insideLeft' }} width={45} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155" }} 
                    itemStyle={{ color: "#06b6d4" }}
                    formatter={(value) => [`${value.toFixed(2)} mm`, "Opad"]}
                    labelFormatter={(label) => `${label}`}
                  />
                  <Bar dataKey="precipitation" fill="#06b6d4" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Informacja o rain gauge */}
            <div className="mt-6 p-4 bg-slate-950 rounded-lg border border-slate-800">
              <div className="flex items-start gap-3">
                <TrendingDown className="w-5 h-5 text-cyan-400 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-slate-400 space-y-1">
                  <p><span className="font-semibold text-slate-300">DFRobot Rain Gauge (Kumulacyjny)</span></p>
                  <p>Sensor oblicza różnicę między pomiarami aby wyznaczyć rzeczywisty opad. Wartość w bazie to kumulacyjna liczba przechylów od włączenia.</p>
                  <p>Wykres pokazuje opady <span className="text-cyan-300 font-medium">według dni</span> w wybranym przedziale czasowym.</p>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
