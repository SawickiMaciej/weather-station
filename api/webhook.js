export default async function handler(req, res) {
    // Odpowiadamy od razu na zapytania inne niż POST (wymóg Vercela)
    if (req.method !== 'POST') return res.status(200).send('OK');

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    const MY_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    // Wyciągamy wiadomość z Telegrama
    const { message } = req.body;
    if (!message || !message.text) return res.status(200).send('OK');

    // Zabezpieczenie: Odpowiadaj tylko Tobie!
    if (message.chat.id.toString() !== MY_CHAT_ID) return res.status(200).send('OK');

    // Jeśli ktoś wpisał komendę /status
    if (message.text === '/status') {
        try {
            // Pobieramy dane
            const response = await fetch(`${SUPABASE_URL}/rest/v1/station_data?select=*&order=created_at.desc&limit=50`, {
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
            });
            const data = await response.json();

            // Grupowanie
            const stations = {};
            for (const row of data) {
                if (!stations[row.station_id]) stations[row.station_id] = row;
            }

            let replyText = "🌍 *RAPORT STANU SIECI AgroControl* 🌍\n\n";
            const now = new Date();

            for (const [stationId, lastRecord] of Object.entries(stations)) {
                const recordTime = new Date(lastRecord.created_at);
                const diffHours = (now - recordTime) / (1000 * 60 * 60);

                // Logika statusów i emotek
                let statusIcon = "🟢"; // Domyślnie zielone
                let statusText = "Online";

                if (diffHours > 1) {
                    statusIcon = "🔴";
                    statusText = `Offline (${Math.round(diffHours)}h)`;
                } else if (lastRecord.field3 < 3.55 || lastRecord.field1 == -999) {
                    statusIcon = "🟡";
                    statusText = "Ostrzeżenie";
                }

                // Dodawanie stacji do raportu
                replyText += `${statusIcon} *Stacja:* ${stationId} [${statusText}]\n`;
                replyText += `   🔋 ${lastRecord.field3}V | 🌡 ${lastRecord.field1}°C | 💧 ${lastRecord.field2}%\n`;
                replyText += `   🕒 Ostatni sygnał: ${recordTime.toLocaleTimeString('pl-PL')}\n\n`;
            }

            // Odsyłanie wiadomości na Telegram
            const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage?chat_id=${MY_CHAT_ID}&text=${encodeURIComponent(replyText)}&parse_mode=Markdown`;
            await fetch(telegramUrl);

        } catch (error) {
            console.error(error);
        }
    }

    // Zawsze musimy zwrócić 200 OK do Telegrama, inaczej będzie spamował zapytaniami
    res.status(200).send('OK');
}
