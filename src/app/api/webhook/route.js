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

            // 1. Pobierz listę stacji (nazwy)
            const stationsRes = await fetch(
                `${SUPABASE_URL}/rest/v1/stations?select=id,name`,
                { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
            );
            const stationsList = await stationsRes.json();

            // Mapa id -> nazwa
            const stationNames = {};
            if (Array.isArray(stationsList)) {
                for (const s of stationsList) {
                    stationNames[s.id] = s.name;
                }
            }

            // 2. Pobierz ostatnie pomiary – po jednym na stację
            // Bierzemy 200 rekordów posortowanych od najnowszych
            const measRes = await fetch(
                `${SUPABASE_URL}/rest/v1/measurements?select=*&order=created_at.desc&limit=200`,
                {
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
                    cache: 'no-store'
                }
            );
            const measurements = await measRes.json();

            if (!Array.isArray(measurements)) {
                console.error("Błąd Supabase:", JSON.stringify(measurements));
                await sendTelegram(TELEGRAM_TOKEN, MY_CHAT_ID, "❌ Błąd połączenia z bazą danych.");
                return new Response('OK', { status: 200 });
            }

            // 3. Zostaw tylko najnowszy rekord dla każdej stacji
            const latest = {};
            for (const row of measurements) {
                if (!latest[row.station_id]) {
                    latest[row.station_id] = row;
                }
            }

            if (Object.keys(latest).length === 0) {
                await sendTelegram(TELEGRAM_TOKEN, MY_CHAT_ID, "📭 Brak danych w bazie.");
                return new Response('OK', { status: 200 });
            }

            // 4. Buduj wiadomość
            const now = new Date();
            const lines = [];

            // Nagłówek
            lines.push("━━━━━━━━━━━━━━━━━━━━");
            lines.push("🌿 *AgroControl – STATUS SIECI*");
            lines.push(`🕒 ${formatDate(now)}`);
            lines.push("━━━━━━━━━━━━━━━━━━━━");
            lines.push("");

            // Zliczanie online/offline
            let onlineCount = 0;
            let offlineCount = 0;

            // Sortuj stacje alfabetycznie
            const sortedStations = Object.entries(latest).sort(([a], [b]) => a.localeCompare(b));

            for (const [stationId, rec] of sortedStations) {
                const recordTime = new Date(rec.created_at);
                const diffMin = Math.round((now - recordTime) / 60000);
                const stationName = stationNames[stationId] || stationId;

                // Status na podstawie czasu ostatniej transmisji
                // Stacja wysyła co 15 min – dajemy margines do 25 min
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
                    statusLabel = `OFFLINE`;
                    offlineCount++;
                }

                // Ostatnia transmisja – czytelny opis
                let lastSeen;
                if (diffMin < 1) {
                    lastSeen = "przed chwilą";
                } else if (diffMin < 60) {
                    lastSeen = `${diffMin} min temu`;
                } else {
                    const h = Math.floor(diffMin / 60);
                    const m = diffMin % 60;
                    lastSeen = m > 0 ? `${h}h ${m}min temu` : `${h}h temu`;
                }

                // Ocena baterii
                const bat = parseFloat(rec.battery_voltage);
                let batIcon;
                if (bat >= 4.0) batIcon = "🔋";
                else if (bat >= 3.7) batIcon = "🔋";
                else if (bat >= 3.55) batIcon = "🪫";
                else batIcon = "⚠️";

                // Ocena temperatury
                const temp = parseFloat(rec.temperature);
                let tempWarning = "";
                if (temp <= 2 && temp !== -999) tempWarning = " ❄️ *RYZYKO PRZYMROZKU*";
                if (temp === -999) tempWarning = " ⚠️ błąd czujnika";

                lines.push(`${statusIcon} *${stationName}* (${stationId})`);
                lines.push(`   📡 Status: *${statusLabel}* – ${lastSeen}`);

                if (rec.temperature !== null) {
                    lines.push(`   🌡 Temp: *${temp}°C*${tempWarning}  💧 Wilg: *${rec.humidity}%*`);
                }
                if (rec.battery_voltage !== null) {
                    lines.push(`   ${batIcon} Bateria: *${bat}V*  📶 Sygnał: *${rec.signal_strength} dBm*`);
                }

                // Extra data (np. deszcz dla AgroRain)
                if (rec.extra_data && Object.keys(rec.extra_data).length > 0) {
                    const extras = [];
                    if (rec.extra_data.rain_intensity !== undefined) {
                        extras.push(`🌧 Deszcz: *${rec.extra_data.rain_intensity} mm/h*`);
                    }
                    if (extras.length > 0) lines.push(`   ${extras.join("  ")}`);
                }

                lines.push("");
            }

            // Podsumowanie
            lines.push("━━━━━━━━━━━━━━━━━━━━");
            lines.push(`📊 Łącznie: *${sortedStations.length}* stacji  |  🟢 *${onlineCount}* online  |  🔴 *${offlineCount}* offline`);

            const replyText = lines.join("\n");

            await sendTelegram(TELEGRAM_TOKEN, MY_CHAT_ID, replyText);
        }

        return new Response('OK', { status: 200 });

    } catch (error) {
        console.error("Webhook Error:", error);
        return new Response('OK', { status: 200 });
    }
}

// ── Helpers ──────────────────────────────────────────────

async function sendTelegram(token, chatId, text) {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: 'Markdown',
        })
    });
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
