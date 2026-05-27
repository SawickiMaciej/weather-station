export async function POST(request) {
    try {
        const body = await request.json();
        const message = body.message;

        if (!message || !message.text) return new Response('OK', { status: 200 });

        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
        const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
        const MY_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

        // Blokada – tylko Twój chat
        if (message.chat.id.toString() !== MY_CHAT_ID) {
            return new Response('OK', { status: 200 });
        }

        if (message.text === '/status') {

            // 1. Pobierz listę wszystkich stacji
            const stationsRes = await fetch(
                `${SUPABASE_URL}/rest/v1/stations?select=id,name`,
                { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
            );
            const stationsList = await stationsRes.json();

            if (!Array.isArray(stationsList) || stationsList.length === 0) {
                await sendTelegram(TELEGRAM_TOKEN, MY_CHAT_ID, "❌ Brak stacji w bazie.");
                return new Response('OK', { status: 200 });
            }

            // 2. Pobierz ostatni pomiar osobno dla każdej stacji
            const latest = {};
            for (const station of stationsList) {
                const res = await fetch(
                    `${SUPABASE_URL}/rest/v1/measurements?station_id=eq.${station.id}&select=*&order=created_at.desc&limit=1`,
                    {
                        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
                        cache: 'no-store'
                    }
                );
                const rows = await res.json();
                if (Array.isArray(rows) && rows.length > 0) {
                    latest[station.id] = rows[0];
                }
            }

            // 3. Buduj wiadomość
            const now = new Date();
            const lines = [];

            lines.push("━━━━━━━━━━━━━━━━━━━━");
            lines.push("🌿 *AgroControl – STATUS SIECI*");
            lines.push(`🕒 ${formatDate(now)}`);
            lines.push("━━━━━━━━━━━━━━━━━━━━");
            lines.push("");

            let onlineCount = 0;
            let offlineCount = 0;

            // Sortuj alfabetycznie po id
            const sortedStations = stationsList.sort((a, b) => a.id.localeCompare(b.id));

            for (const station of sortedStations) {
                const rec = latest[station.id];

                // Brak jakichkolwiek danych
                if (!rec) {
                    lines.push(`⚫ *${station.name}* (${station.id})`);
                    lines.push(`   📡 Nigdy nie wysłała danych`);
                    lines.push("");
                    offlineCount++;
                    continue;
                }

                const recordTime = new Date(rec.created_at);
                const diffMin = Math.round((now - recordTime) / 60000);

                // Status na podstawie czasu ostatniej transmisji
                // Stacja wysyła co 15 min – margines do 25 min
                let statusIcon, statusLabel;
                if (diffMin <= 25) {
                    statusIcon = "🟢";
                    statusLabel = "ONLINE";
                    onlineCount++;
                } else if (diffMin <= 60) {
                    statusIcon = "🟡";
                    statusLabel = "OPÓŹNIENIE";
                    offlineCount++;
                } else {
                    statusIcon = "🔴";
                    statusLabel = "OFFLINE";
                    offlineCount++;
                }

                // Czytelny czas ostatniej transmisji
                let lastSeen;
                if (diffMin < 1) {
                    lastSeen = "przed chwilą";
                } else if (diffMin < 60) {
                    lastSeen = `${diffMin} min temu`;
                } else if (diffMin < 1440) {
                    const h = Math.floor(diffMin / 60);
                    const m = diffMin % 60;
                    lastSeen = m > 0 ? `${h}h ${m}min temu` : `${h}h temu`;
                } else {
                    const d = Math.floor(diffMin / 1440);
                    lastSeen = `${d} dni temu`;
                }

                // Ikona baterii
                const bat = parseFloat(rec.battery_voltage);
                let batIcon;
                if (bat >= 3.9) batIcon = "🔋";
                else if (bat >= 3.7) batIcon = "🔋";
                else if (bat >= 3.55) batIcon = "🪫";
                else batIcon = "⚠️";

                // Ostrzeżenie o przymrozku
                const temp = parseFloat(rec.temperature);
                let tempWarning = "";
                if (temp !== -999 && temp <= 2) tempWarning = " ❄️ RYZYKO PRZYMROZKU";
                if (temp === -999) tempWarning = " ⚠️ błąd czujnika";

                lines.push(`${statusIcon} *${station.name}* (${station.id})`);
                lines.push(`   📡 ${statusLabel} – ${lastSeen}`);
                lines.push(`   🌡 ${temp}°C${tempWarning}  💧 ${rec.humidity}%`);
                lines.push(`   ${batIcon} ${bat}V  📶 ${rec.signal_strength} dBm`);

                // Extra data (np. deszcz dla AgroRain)
                if (rec.extra_data) {
                    if (rec.extra_data.rain_intensity !== undefined) {
                        lines.push(`   🌧 Deszcz: ${rec.extra_data.rain_intensity} mm/h`);
                    }
                    if (rec.extra_data.soil_moisture !== undefined) {
                        lines.push(`   🌱 Wilg. gleby: ${rec.extra_data.soil_moisture}%`);
                    }
                }

                lines.push("");
            }

            // Podsumowanie
            lines.push("━━━━━━━━━━━━━━━━━━━━");
            lines.push(`📊 Stacji: *${stationsList.length}*  |  🟢 *${onlineCount}* online  |  🔴 *${offlineCount}* offline`);

            await sendTelegram(TELEGRAM_TOKEN, MY_CHAT_ID, lines.join("\n"));
        }

        return new Response('OK', { status: 200 });

    } catch (error) {
        console.error("Webhook Error:", error);
        return new Response('OK', { status: 200 });
    }
}

async function sendTelegram(token, chatId, text) {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: 'Markdown',
        })
    });
    const data = await res.json();
    if (!data.ok) {
        console.error("Telegram error:", JSON.stringify(data));
    }
}

function formatDate(date) {
    return date.toLocaleString('pl-PL', {
        timeZone: 'Europe/Warsaw',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}
