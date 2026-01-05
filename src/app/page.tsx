"use client";
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Battery, Signal, Droplets, Thermometer } from 'lucide-react';

// 1. Podłączamy się do bazy (korzysta z kluczy z pliku .env.local)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function Home() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // 2. Funkcja pobierająca dane
  useEffect(() => {
    async function fetchData() {
      // Pobierz ostatnie 24 pomiary dla stacji testowej
      const { data: measurements, error } = await supabase
        .from('measurements')
        .select('*')
        .eq('station_id', 'test-001') // Tutaj szukamy naszej stacji
        .order('created_at', { ascending: true }) // Od najstarszych do najnowszych (do wykresu)
        .limit(24);

      if (error) console.error('Błąd pobierania:', error);
      else setData(measurements || []);
      
      setLoading(false);
    }

    fetchData();
    // Odświeżaj co minutę (opcjonalne)
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  // 3. Obliczamy aktualne wartości (ostatni pomiar)
  const current = data[data.length - 1] || { temperature: 0, humidity: 0, battery_voltage: 0 };
  
  // Formatowanie daty na wykresie (np. 14:00)
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getHours()}:00`;
  };

  if (loading) return <div className="p-10 text-white">Ładowanie danych z sadu...</div>;

  return (
    <main className="min-h-screen bg-slate-900 text-white p-4 md:p-8">
      {/* NAGŁÓWEK */}
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-green-400">Sad Jabłoniowy</h1>
          <p className="text-slate-400 text-sm">Stacja: test-001</p>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-2 justify-end text-sm text-slate-300">
            <Battery className="w-4 h-4" /> {current.battery_voltage}V
          </div>
          <div className="flex items-center gap-2 justify-end text-sm text-slate-300">
            <Signal className="w-4 h-4" /> Dobry zasięg
          </div>
        </div>
      </header>

      {/* GŁÓWNE KAFELKI */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        
        {/* KAFEJEK TEMPERATURY */}
        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-lg">
          <div className="flex items-center gap-2 text-slate-400 mb-2">
            <Thermometer className="w-5 h-5 text-red-400" /> Temperatura
          </div>
          <div className="text-5xl font-bold tracking-tighter">
            {current.temperature}°C
          </div>
          <div className="text-sm text-slate-500 mt-2">
            Norma: Powyżej 0°C
          </div>
        </div>

        {/* KAFEJEK WILGOTNOŚCI */}
        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-lg">
          <div className="flex items-center gap-2 text-slate-400 mb-2">
            <Droplets className="w-5 h-5 text-blue-400" /> Wilgotność
          </div>
          <div className="text-5xl font-bold tracking-tighter text-blue-100">
            {current.humidity}%
          </div>
          <div className="text-sm text-slate-500 mt-2">
            Ryzyko parcha: Niskie
          </div>
        </div>
      </div>

      {/* WYKRES */}
      <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 h-64 md:h-80">
        <h3 className="text-slate-400 mb-4 text-sm font-medium">Historia temperatury (24h)</h3>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis 
              dataKey="created_at" 
              tickFormatter={formatTime} 
              stroke="#94a3b8" 
              fontSize={12}
            />
            <YAxis stroke="#94a3b8" fontSize={12} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }}
              itemStyle={{ color: '#fff' }}
            />
            <Line 
              type="monotone" 
              dataKey="temperature" 
              stroke="#ef4444" 
              strokeWidth={3} 
              dot={false} 
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

    </main>
  );
}