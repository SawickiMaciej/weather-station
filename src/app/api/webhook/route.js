import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        const body = await request.json();
        const message = body.message;

        if (!message || !message.text) return new Response('OK', { status: 200 });

        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
        const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
        const MY_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

        if (message.chat.id.toString() !== MY_CHAT_ID) return new Response('OK', { status: 200 });

        if (message.text === '/status') {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/stations?select=*&order=created_at.desc&limit=50`, {
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
                cache: 'no-store'
            });
            const data = await response.json();

            console.log("Supabase status:", response.status);
            console.log("Supabase data:", JSON.stringify(data));

            if (!Array.isArray(data)) {
                console.error("Supabase nie zwrócił tablicy:", JSON.stringify(data));
                return new Response('OK', { status: 200 });
            }

            const stations = {};
            for (const row of data) {
                if (!stations[row.station_id]) stations[row.station_id] = row;
            }

            let replyText = "🌍 *RAPORT STANU SIECI AgroControl* 🌍\n\n";
            const now = new Date();

            for (const [stationId, lastRecord] of Object.entries(stations)) {
                const recordTime = new Date(lastRecord.created_at);
                const diffHours = (now - recordTime) / (1000 * 60 * 60);

                let statusIcon = "🟢";
                let statusText = "Online";

                if (diffHours > 1) {
                    statusIcon = "🔴";
                    statusText = `Offline (${Math.round(diffHours)}h)`;
                } else if (lastRecord.battery_voltage < 3.55 || lastRecord.temperature == -999) {
                    statusIcon = "🟡";
                    statusText = "Ostrzeżenie";
                }

                replyText += `${statusIcon} *Stacja:* ${stationId} [${statusText}]\n`;
                replyText += `   🔋 ${lastRecord.battery_voltage}V | 🌡 ${lastRecord.temperature}°C | 💧 ${lastRecord.humidity}% | 📶 Sygnał: ${lastRecord.signal_strength}\n`;
                replyText += `   🕒 Ostatni sygnał: ${recordTime.toLocaleTimeString('pl-PL')}\n\n`;
            }

            const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage?chat_id=${MY_CHAT_ID}&text=${encodeURIComponent(replyText)}&parse_mode=Markdown`;
            await fetch(telegramUrl);
        }

        return new Response('OK', { status: 200 });
    } catch (error) {
        console.error("Webhook Error:", error);
        return new Response('OK', { status: 200 });
    }
}
