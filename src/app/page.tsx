"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Thermometer, Droplets, Activity, Cloud, Battery, Signal, WifiOff,
  Leaf, TrendingDown, Droplet, Zap
} from "lucide-react";

// --- KONFIGURACJA SUPABASE ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);

// --- TYPY DANYCH ---
type ExtraData = {
  soil_moisture?: string | number;
  soil_temperature?: string | number;
  rain_intensity?: string | number; 
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
  rain_gauge_baseline?: number; 
};

const TIME_RANGES = [
  { label: "24h", hours: 24 },
  { label: "48h", hours: 48 },
  { label: "7 dni", hours: 168 },
  { label: "30 dni", hours: 720 },
];

export default function Dashboard() {
  const [data, setData] = useState<Measurement[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [selectedRange, setSelectedRange] = useState(24);
  
  // Stany dla niezależnego wykresu deszczu
  const [rainRangeDays, setRainRangeDays] = useState(7); 
  const [rainData, setRainData] = useState<Measurement[]>([]);

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

  // --- 2. POBIERANIE POMIARÓW (Dla reszty czujników) ---
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

  // --- 3. ODDZIELNE POBIERANIE DANYCH TYLKO DLA DESZCZU ---
  useEffect(() => {
    if (!selectedStationId) return;

    const fetchRain = async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - rainRangeDays - 1); 

      const { data, error } = await supabase
        .from("measurements")
        .select("created_at, extra_data") // Zoptymalizowane zapytanie
        .eq("station_id", selectedStationId)
        .gte("created_at", startDate.toISOString())
        .order("created_at", { ascending: true });

      if (!error) {
        setRainData(data || []);
      }
    };

    fetchRain();
  }, [selectedStationId, rainRangeDays]);

  // --- 4. KALIBRACJA TEMPERATURY I WILGOTNOŚCI ---
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

  // --- 5. MAGIA DESZCZU - OBLICZANIE OPADÓW I PUSTYCH DNI ---
  const getRainChartData = () => {
    const rainByDay: Record<string, { sortKey: string; displayDate: string; precipitation: number }> = {};
    
    // Generowanie pustych dni
    for (let i = rainRangeDays - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const sortKey = d.toISOString().split('T')[0]; 
      const displayKey = d.toLocaleDateString("pl-PL", { day: '2-digit', month: '2-digit' });
      rainByDay[sortKey] = { sortKey, displayDate: displayKey, precipitation: 0 };
    }

    if (rainData.length >= 2) {
      for (let i = 1; i < rainData.length; i++) {
        const prev = rainData[i - 1];
        const curr = rainData[i];

        const prevRain = parseFloat(String(prev.extra_data?.rain_intensity || 0));
        const currRain = parseFloat(String(curr.extra_data?.rain_intensity || 0));

        // Bez niepotrzebnego mnożenia
        const rainDiff = currRain > prevRain ? (currRain - prevRain) : 0;

        if (rainDiff > 0) {
          const dateObj = new Date(curr.created_at);
          const sortKey = dateObj.toISOString().split('T')[0];
          
          if (rainByDay[sortKey]) {
            rainByDay[sortKey].precipitation += rainDiff;
          }
        }
      }
    }

    return Object.values(rainByDay).map(d => ({
      date: d.displayDate,
      precipitation: parseFloat(d.precipitation.toFixed(2))
    }));
  };

  const finalRainData = getRainChartData();
  const totalRain = finalRainData.reduce((sum, d) => sum + d.precipitation, 0);
  const maxRainDay = finalRainData.length > 0 ? Math.max(...finalRainData.map(d => d.precipitation)) : 0;

  // --- STATYSTYKI OGÓLNE ---
  const last = calibratedData.length > 0 ? calibratedData[calibratedData.length - 1] : null;
  const isOffline = last ? (new Date().getTime() - new Date(last.created_at).getTime()) > 30 * 60 * 1000 : true;

  const minTemp = calibratedData.length ? Math.min(...calibratedData.map(d => d.temperature)) : null;
  const maxTemp = calibratedData.length ? Math.max(...calibratedData.map(d => d.temperature)) : null;

  // --- WYKRYWANIE ŁADOWANIA BATERII ---
  let isCharging = false;
  if (calibratedData.length > 5) {
    const recentVoltage = calibratedData[calibratedData.length - 1].battery_voltage;
    const olderVoltage = calibratedData[calibratedData.length - 5].battery_voltage; 
    isCharging = (recentVoltage - olderVoltage) >= 0.02;
  } else if (calibratedData.length > 1) {
    isCharging = calibratedData[calibratedData.length - 1].battery_voltage - calibratedData[0].battery_voltage >= 0.01;
  }

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
  const isHighRain = totalRain > 20; 

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

          <div className={`p-6 rounded-xl border ${isHighRain ? 'bg-cyan-950/40 border-cyan-800' : 'bg-slate-900 border-slate-800'}`}>
            <div className="flex items-center gap-2 mb-4">
              <Cloud className={`w-5 h-5 ${isHighRain ? 'text-cyan-400' : 'text-slate-400'}`} />
              <span className="text-slate-400 text-xs uppercase tracking-wider font-semibold">Opad</span>
            </div>
            <div className={`text-4xl font-bold mb-2 ${isHighRain ? 'text-cyan-300' : 'text-white'}`}>
              {totalRain.toFixed(1)}mm
            </div>
            <div className="text-xs text-slate-500">
              W wybranym {rainRangeDays} dni
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
                <div className="relative">
                  <Battery className={`w-6 h-6 ${getBatteryColor(last?.battery_voltage)}`} />
                  {isCharging && (
                    <Zap className="w-3 h-3 text-yellow-400 absolute -bottom-1 -right-1 animate-pulse fill-yellow-400" />
                  )}
                </div>
                <div>
                  <span className="text-sm font-medium text-slate-300 flex items-center gap-2">
                    Zasilanie (18650)
                    {isCharging && (
                      <span className="text-[9px] text-yellow-400 font-bold uppercase tracking-wider bg-yellow-400/10 border border-yellow-400/20 px-1.5 py-0.5 rounded">
                        Ładuje
                      </span>
                    )}
                  </span>
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

        {/* --- WYKRES OPADÓW DOBOWYCH --- */}
        <div className="bg-slate-900 p-5 rounded-xl border border-slate-800">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <div>
              <h3 className="text-sm font-medium text-slate-400">Historia Opadów</h3>
              <p className="text-xs text-slate-500 mt-1">
                Łącznie: <span className="font-bold text-cyan-400">{totalRain.toFixed(1)} mm</span> | 
                Max dziennie: <span className="font-bold text-cyan-400">{maxRainDay.toFixed(1)} mm</span>
              </p>
            </div>
            
            <div className="flex bg-slate-950 border border-slate-800 rounded-lg p-1">
              {[7, 14, 30].map((days) => (
                <button
                  key={days}
                  onClick={() => setRainRangeDays(days)}
                  className={`px-3 py-1 text-xs rounded-md transition-all ${
                    rainRangeDays === days ? "bg-cyan-600 text-white font-medium" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {days} dni
                </button>
              ))}
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={finalRainData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  stroke="#475569" 
                  fontSize={11}
                  angle={rainRangeDays > 14 ? -90 : -45}
                  textAnchor="end"
                  height={80}
                  minTickGap={rainRangeDays > 14 ? 15 : 5} 
                />
                <YAxis stroke="#475569" fontSize={11} label={{ value: 'mm', angle: -90, position: 'insideLeft' }} width={45} />
                <Tooltip 
                  contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155" }} 
                  itemStyle={{ color: "#06b6d4" }}
                  formatter={(value: number) => [`${value.toFixed(2)} mm`, "Opad"]}
                  labelFormatter={(label) => `Data: ${label}`}
                  cursor={{ fill: '#1e293b' }} 
                />
                <Bar dataKey="precipitation" fill="#06b6d4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

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

      </div>
    </div>
  );
}