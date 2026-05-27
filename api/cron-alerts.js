export default async function handler(req, res) {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/station_data?select=*&order=created_at.desc&limit=50`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        const data = await response.json();

        const stations = {};
        for (const row of data) {
            if (!stations[row.station_id]) stations[row.station_id] = row;
        }

        let alerts = [];
        const now = new Date();

        for (const [stationId, lastRecord] of Object.entries(stations)) {
            const recordTime = new Date(lastRecord.created_at);
            const diffHours = (now - recordTime) / (1000 * 60 * 60);

            // Dolna sekcja z parametrami
            const msgFooter = `\n\n📊 *Ostatni odczyt:*\n🔋 Bateria: ${lastRecord.field3}V\n🌡 Temp: ${lastRecord.field1}°C\n💧 Wilgotność: ${lastRecord.field2}%`;

            if (diffHours > 1) {
                alerts.push(`🔴 *KRYTYCZNA AWARIA* 🔴\n📡 Stacja: *${stationId}*\n⏱ Brak transmisji od ${Math.round(diffHours)} godzin! Prawdopodobny zgon zasilania.` + msgFooter);
            }
            else if (lastRecord.field3 < 3.55) {
                alerts.push(`🪫 *ALARM ZASILANIA* 🪫\n📡 Stacja: *${stationId}*\n⚠️ Bateria nie ładuje się (Napięcie: ${lastRecord.field3}V). Solar może być odłączony!` + msgFooter);
            }
            else if (lastRecord.field1 == -999) {
                alerts.push(`🔧 *BŁĄD CZUJNIKÓW* 🔧\n📡 Stacja: *${stationId}*\n❌ Wykryto -999. Możliwe zwarcie I2C lub wypięta wtyczka!` + msgFooter);
            }
        }

        for (const msg of alerts) {
            const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage?chat_id=${CHAT_ID}&text=${encodeURIComponent(msg)}&parse_mode=Markdown`;
            await fetch(telegramUrl);
        }

        res.status(200).json({ status: "OK", alerts_sent: alerts.length });

    } catch (error) {
        res.status(500).json({ error: "Błąd skryptu crona" });
    }
}
