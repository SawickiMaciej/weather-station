"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Thermometer,
  Droplets,
  MapPin,
  CalendarClock,
  AlertTriangle,
  WifiOff,
  ArrowDown,
  ArrowUp,
  Clock,
  Battery, // <--- DODAŁEM IMPORT
  Signal   // <--- DODAŁEM IMPORT
} from "lucide-react";

// --- KONFIGURACJA SUPABASE ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// --- TYPY DANYCH ---
type Measurement = {
  created_at: string;
  temperature: number;
  humidity: number;
  battery_voltage: number;
  station_id: string;
};

type Station = {
  id: string; 
  name: string;
};

// --- OPCJE ZAKRESU CZASU ---
const TIME_RANGES = [
  { label: "1h", hours: 1 },
  { label: "6h", hours: 6 },
  { label: "12h", hours: 12 },
  { label: "24h", hours: 24 },
];

export default function Dashboard() {
  const [data, setData] = useState<Measurement[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  
  const [selectedRange, setSelectedRange] = useState(24);

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
  }, []);

  // --- 2. POBIERANIE POMIARÓW ---
  useEffect(() => {
    if (!selectedStationId) return;

    const fetchData = async () => {
      setLoading(true);
      setData([]); 
      console.log("Pobieram dane dla:", selectedStationId);

      const startDate = new Date();
      startDate.setHours(startDate.getHours() - selectedRange);

      const { data: measurements, error } = await supabase
        .from("measurements")
        .select("*")
        .eq("station_id", selectedStationId)
        .gte("created_at", startDate.toISOString())
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Błąd Supabase:", error);
      } else {
        console.log("Pobrano rekordów:", measurements?.length);
        setData(measurements || []);
      }
      setLoading(false);
    };

    fetchData();

    const channelName = `live-${selectedStationId}`; 
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { 
          event: "INSERT", 
          schema: "public", 
          table: "measurements",
          filter: `station_id=eq.${selectedStationId}`
        },
        (payload) => {
          console.log("Nowy pomiar live!", payload.new);
          setData((current) => [...current, payload.new as Measurement]);
        }
      )
      .subscribe();

    return () => {
      console.log("Odłączam kanał:", channelName);
      supabase.removeChannel(channel);
    };
  }, [selectedStationId, selectedRange]);

  // --- POMOCNICZE FUNKCJE ---
  const formatTooltipDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString("pl-PL", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatAxisDate = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
  };

  const last = data.length > 0 ? data[data.length - 1] : null;
  
  const isOffline = last 
    ? (new Date().getTime() - new Date(last.created_at).getTime()) > 30 * 60 * 1000
    : true;

  const temperatures = data.map(d => d.temperature);
  const minTemp = temperatures.length ? Math.min(...temperatures) : null;
  const maxTemp = temperatures.length ? Math.max(...temperatures) : null;

  // --- WKLEJ TO TUTAJ (przed return) ---
  const getBatteryStatus = (voltage: number | undefined) => {
    if (!voltage) return "text-slate-500"; 
    if (voltage > 3.9) return "text-green-400"; // Full
    if (voltage > 3.5) return "text-blue-400";  // OK
    if (voltage > 3.3) return "text-yellow-400"; // Ostrzeżenie
    return "text-red-500 animate-pulse font-bold"; // Krytyczny
  };
  // -------------------------------------


  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* --- NAGŁÓWEK --- */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-800 pb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <CalendarClock className="w-6 h-6 text-green-500" />
              Stacja Pogodowa
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Ostatnia aktualizacja: {last ? formatTooltipDate(last.created_at) : "--"}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto items-center">
            
            {/* --- NOWA SEKCJA: BATERIA I WIFI --- */}
            {/* --- TUTAJ WKLEJ NOWĄ SEKCJĘ BATERII --- */}
            <div className="flex items-center gap-4 mr-2">
              <div className={`flex items-center gap-2 text-sm transition-colors duration-500 ${getBatteryStatus(last?.battery_voltage)}`}>
                <Battery className="w-4 h-4" />
                {last?.battery_voltage ? `${last.battery_voltage.toFixed(2)}V` : "--"}
              </div>
              <div className="hidden sm:flex items-center gap-2 text-sm text-slate-400">
                <Signal className="w-4 h-4" />
              </div>
            </div>
            {/* --------------------------------------- */}

            {/* Wybór stacji */}
            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg px-3 py-2">
              <MapPin className="w-4 h-4 text-slate-400 mr-2" />
              <select
                value={selectedStationId}
                onChange={(e) => setSelectedStationId(e.target.value)}
                className="bg-transparent text-sm text-slate-200 focus:outline-none cursor-pointer w-full"
                disabled={stations.length === 0}
              >
                {stations.length === 0 ? (
                  <option>Ładowanie stacji...</option>
                ) : (
                  stations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Wybór zakresu czasu */}
            <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-1">
              {TIME_RANGES.map((range) => (
                <button
                  key={range.label}
                  onClick={() => setSelectedRange(range.hours)}
                  className={`px-3 py-1 text-sm rounded-md transition-all ${
                    selectedRange === range.hours
                      ? "bg-slate-700 text-white font-medium shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* --- ALERT OFFLINE --- */}
        {isOffline && data.length > 0 && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded-xl flex items-center gap-3 animate-pulse">
            <WifiOff className="w-6 h-6" />
            <div>
              <p className="font-bold">Utracono połączenie!</p>
              <p className="text-sm text-red-300">Ostatni pomiar jest starszy niż 30 minut. Sprawdź zasilanie lub WiFi stacji.</p>
            </div>
          </div>
        )}

        {/* --- KAFELKI KPI --- */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Temperatura */}
          <div className={`p-6 rounded-xl border transition-colors ${isOffline ? 'bg-slate-900/50 border-slate-800 opacity-75' : 'bg-slate-900 border-slate-800'}`}>
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-2">
                <Thermometer className="w-5 h-5 text-blue-500" />
                <span className="text-slate-400 text-xs uppercase tracking-wider font-semibold">Temperatura</span>
              </div>
              {/* Min / Max Tag */}
              <div className="flex gap-3 text-xs">
                <div className="flex items-center text-blue-300 bg-blue-500/10 px-2 py-1 rounded">
                  <ArrowDown className="w-3 h-3 mr-1" />
                  {minTemp?.toFixed(1)}°C
                </div>
                <div className="flex items-center text-red-300 bg-red-500/10 px-2 py-1 rounded">
                  <ArrowUp className="w-3 h-3 mr-1" />
                  {maxTemp?.toFixed(1)}°C
                </div>
              </div>
            </div>
            
            <div className="text-4xl font-bold text-white mb-1">
              {last ? `${last.temperature.toFixed(1)}°C` : "--"}
            </div>
            <div className="text-slate-500 text-sm">
              Aktualna temperatura powietrza
            </div>
          </div>

          {/* Wilgotność */}
          <div className={`p-6 rounded-xl border transition-colors ${isOffline ? 'bg-slate-900/50 border-slate-800 opacity-75' : 'bg-slate-900 border-slate-800'}`}>
            <div className="flex items-center gap-2 mb-4">
              <Droplets className="w-5 h-5 text-green-500" />
              <span className="text-slate-400 text-xs uppercase tracking-wider font-semibold">Wilgotność</span>
            </div>
            <div className="text-4xl font-bold text-white mb-1">
              {last ? `${last.humidity.toFixed(0)}%` : "--"}
            </div>
            <div className="text-slate-500 text-sm">
              {last && last.humidity > 90 ? "⚠️ Ryzyko chorób grzybowych" : "Poziom bezpieczny"}
            </div>
          </div>
        </div>

        {/* --- WYKRESY --- */}
        <div className="grid lg:grid-cols-2 gap-6">
          
          {/* Wykres Temperatury */}
          <div className="bg-slate-900 p-5 rounded-xl border border-slate-800">
            <h3 className="text-sm font-medium text-slate-400 mb-6 flex justify-between">
              <span>Wykres Temperatury</span>
              <span className="text-xs bg-slate-800 px-2 py-1 rounded">Ostatnie {selectedRange}h</span>
            </h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data}>
                  <defs>
                    <linearGradient id="gradTemp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis
                    dataKey="created_at"
                    tickFormatter={formatAxisDate}
                    stroke="#475569"
                    fontSize={11}
                    tick={{fill: '#64748b'}}
                    tickMargin={10}
                    minTickGap={30}
                  />
                  <YAxis stroke="#475569" fontSize={11} domain={['auto', 'auto']} width={35} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", color: "#f8fafc" }}
                    itemStyle={{ color: "#3b82f6" }}
                    labelFormatter={formatTooltipDate}
                    formatter={(value: any) => [`${Number(value).toFixed(1)}°C`, "Temperatura"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="temperature"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#gradTemp)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Wykres Wilgotności */}
          <div className="bg-slate-900 p-5 rounded-xl border border-slate-800">
            <h3 className="text-sm font-medium text-slate-400 mb-6 flex justify-between">
              <span>Wykres Wilgotności</span>
              <span className="text-xs bg-slate-800 px-2 py-1 rounded">Ostatnie {selectedRange}h</span>
            </h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis
                    dataKey="created_at"
                    tickFormatter={formatAxisDate}
                    stroke="#475569"
                    fontSize={11}
                    tick={{fill: '#64748b'}}
                    tickMargin={10}
                    minTickGap={30}
                  />
                  <YAxis stroke="#475569" fontSize={11} domain={[0, 100]} width={35} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", color: "#f8fafc" }}
                    itemStyle={{ color: "#22c55e" }}
                    labelFormatter={formatTooltipDate}
                    formatter={(value: any) => [`${Number(value).toFixed(0)}%`, "Wilgotność"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="humidity"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Informacja o braku danych */}
        {data.length === 0 && !loading && (
          <div className="text-center p-10 text-slate-500 bg-slate-900/50 rounded-xl border border-dashed border-slate-800">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            Brak danych dla stacji <strong>{selectedStationId}</strong> w ciągu ostatnich {selectedRange} godzin.
          </div>
        )}
      </div>
    </div>
  );
}