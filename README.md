# Min pendling – första prototypen

Två fasta alternativ: buss 575 Vikingstad–Forskningsbyn eller Östgötapendeln + buss 4 via Linköping C till Nobeltorget. På eftermiddagen omvänt.

## Driftsättning

1. Logga in på Cloudflare och öppna Workers & Pages. Skapa en Worker.
2. Ersätt Workers startkod med `worker.js` och publicera (Deploy).
3. Öppna Worker → Settings → Variables and Secrets och skapa en **Secret** med namnet `TRAFIKLAB_KEY` och värdet av din privata Trafiklab Realtime API-nyckel. Publicera om vid behov.
4. Kontrollera att `https://<din-worker>.workers.dev/api?mode=work` ger JSON (inte fel om saknad nyckel).
5. Redigera `index.html`: ändra `API_URL` till din Worker-adress inklusive `/api`.
6. Lägg `index.html` i roten på ett GitHub-repository och aktivera Settings → Pages → Deploy from a branch → main / root. Öppna den publicerade sidan på dator eller telefon.

### Begränsningar i denna prototyp

- Live-API:t täcker de kommande 60 minuterna. Inga historiska eller valfria framtidssökningar i gränssnittet.
- Föreslagna tåg- och bussbyten bygger på Trip-detaljer och kräver minst 5 och högst 35 minuter i Linköping.
- Fordons-GPS visas **inte**. `is_realtime` betyder bara att realtidsprognos finns.
- Om en Trip-detalj inte kan hämtas kommer turen inte med: detta är hellre ofullständigt än en felaktig anslutning.
- API:t är i betaversion för Trip-detaljer; detaljer kan ändras.
- Realtids-API:t cachar svar under 60 sekunder.
- Tågfiltreringen väljer Östgötapendeln, inte fjärrtåg.
- CORS är öppen i denna enkla Worker. Nyckeln är dold, men för offentlig produktion bör CORS begränsas till din domän och Workers anrop begränsas.

## Felsökning

Om bara 575 syns kan en detaljförfrågan för tåg/buss saknas eller inte innehålla rätt hållplats. Worker returnerar då inte ett påhittat byte.
