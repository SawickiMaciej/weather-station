export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(200).send('OK');

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    const MY_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    const { message } = req.body;
    if (!message || !message.text) return res.status(200).send('OK');
    if (message.chat.id.toString() !== MY_CHAT_ID) return res.status(200).send('OK');

    if (message.text === '/status') {
        try {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/station_data?select=*&order=created_at.desc&limit=50`, {
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
            });
            const data = await response.json();

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

        } catch (error) {
            console.error("Webhook error:", error);
        }
    }

    res.status(200).send('OK');
}
