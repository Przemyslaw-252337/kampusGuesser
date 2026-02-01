document.addEventListener('DOMContentLoaded', () => {
    const map = L.map('map');

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    let locations = [];
    let areas = [];
    let polygonLayers = [];
    let currentRound = 0;
    let totalError = 0;
    let totalPoints = 0;
    let player = "";
    // Zmienna przechowująca sumaryczne punkty gracza z wielu gier.
    let totalAccumulated = 0;

    let guessMarker = null;
    let correctMarker = null;
    let line = null;
    let userGuess = null;
    let roundConfirmed = false;

    // UI
    const startPopup = document.getElementById('startPopup');
    const endPopup = document.getElementById('endPopup');
    const startGameBtn = document.getElementById('startGameBtn');
    const playerNameInput = document.getElementById('playerName');
    const confirmBtn = document.getElementById('confirmBtn');
    const nextBtn = document.getElementById('nextBtn');
    const roundInfo = document.getElementById('roundInfo');
    const resultDiv = document.getElementById('result');
    const pointsInfo = document.getElementById('pointsInfo');
    const finalScoreSession = document.getElementById('finalScoreSession');
    const finalScoreTotal = document.getElementById('finalScoreTotal');
    const finalPlace = document.getElementById('finalPlace');
    // Buttons for playing again or changing the player
    const playAgainSameBtn = document.getElementById('playAgainSameBtn');
    const playAgainNewBtn = document.getElementById('playAgainNewBtn');
    const photoOverlay = document.getElementById("photoOverlay");
    const roundPhoto = document.getElementById("roundPhoto");
    const togglePhotoBtn = document.getElementById("togglePhotoBtn");
    const peekPhotoBtn = document.getElementById("peekPhotoBtn");
    const teacherLoginBtn = document.getElementById("teacherLoginBtn");
    // Miniatura zdjęcia rundy
    const miniPhoto = document.getElementById("miniPhoto");

    /**
     * Compute the ranking position of the given player and score without
     * writing to the server.  It fetches the current ranking (server
     * first, then localStorage as fallback), inserts/updates the given
     * player with the provided score, sorts the array and returns the
     * index (1-based).  This function is used to display the player's
     * potential ranking in the end-of-game popup even if the page is
     * reloaded by external tooling (e.g. live-reload) before the score
     * is saved.
     *
     * @param {string} name
     * @param {number} score
     * @returns {Promise<number>}
     */
    async function computeRankPosition(name, score) {
        let scores = [];
        // Try to fetch from the API
        try {
            const res = await fetch('http://127.0.0.1:5000/scores');
            if (res.ok) {
                scores = await res.json();
            }
        } catch (err) {
            // ignore, fallback to localStorage
        }
        if (!Array.isArray(scores) || scores.length === 0) {
            // Fallback to local storage
            try {
                scores = JSON.parse(localStorage.getItem("geoguessrScores") || "[]");
            } catch (e) {
                scores = [];
            }
        }
        // Clone array to avoid mutating the original
        const newScores = scores.map(item => ({ name: item.name, score: item.score }));
        // Insert or update player's score if higher
        const existing = newScores.find(item => item.name === name);
        if (!existing) {
            newScores.push({ name: name, score: score });
        } else if (score > existing.score) {
            existing.score = score;
        }
        // Sort descending
        newScores.sort((a, b) => b.score - a.score);
        const idx = newScores.findIndex(item => item.name === name && item.score === score);
        return idx >= 0 ? idx + 1 : newScores.length + 1;
    }

    // State restoration: if a game just ended and the page was reloaded
    // (for example by a live reload triggered on file changes), we
    // preserve the final score information in localStorage.  On
    // load we check for this marker and display the end-of-game
    // popup with the stored values.  This prevents the page from
    // immediately resetting to the nickname prompt when the score
    // file is updated on disk.
    (async () => {
        const pending = localStorage.getItem("showEndPopup");
        const endDataRaw = localStorage.getItem("endGameData");
        if (pending === 'true' && endDataRaw) {
            try {
                const data = JSON.parse(endDataRaw);
                player = data.player || '';
                totalAccumulated = data.totalAccumulated || 0;
                // Display stored scores
                finalScoreSession.innerText = `Twój wynik w tej grze: ${data.scoreSession} pkt`;
                finalScoreTotal.innerText = `Twój łączny wynik: ${data.totalAccumulated} pkt`;
                // Compute ranking position asynchronously
                const place = await computeRankPosition(player, totalAccumulated);
                finalPlace.innerText = `Twoje miejsce: ${place}`;
                // Show the end popup and hide the start popup
                startPopup.classList.remove('show');
                endPopup.classList.add('show');
                // Update the score table (this will fetch current ranking or read from local storage)
                updateScoreTable().catch(err => console.error(err));
                // Do not load locations automatically – wait for user choice
                return;
            } catch (err) {
                console.error('Błąd przy odtwarzaniu stanu końcowego gry:', err);
            }
        }
        // Default state: ensure end popup is hidden and start popup visible if name not set
    })();

    // Event listener dla przycisku logowania wykładowcy
    teacherLoginBtn.addEventListener("click", () => {
        // Przekieruj na stronę logowania nauczyciela serwowaną przez ten sam serwer statyczny
        // (port 5500). Pozwoli to otworzyć panel w podfolderze logowanie i obsłużyć sesję
        window.location.href = "http://127.0.0.1:5000/";
    });

    // Funkcja sprawdzająca, czy punkt jest wewnątrz wielokąta (Ray Casting Algorithm)
    function isPointInPolygon(lat, lng, polygon) {
        let inside = false;
        const x = lng, y = lat;
        
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            // Obsługa obiektów Leaflet {lat, lng} i tablic [lat, lng]
            const yi = polygon[i].lat !== undefined ? polygon[i].lat : polygon[i][0];
            const xi = polygon[i].lng !== undefined ? polygon[i].lng : polygon[i][1];
            const yj = polygon[j].lat !== undefined ? polygon[j].lat : polygon[j][0];
            const xj = polygon[j].lng !== undefined ? polygon[j].lng : polygon[j][1];
            
            const intersect = ((yi > y) !== (yj > y))
                && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            
            if (intersect) inside = !inside;
        }
        
        return inside;
    }

    // Funkcja obliczająca odległość w metrach
    function distance(lat1, lon1, lat2, lon2) {
        const R = 6371e3;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2)**2 +
                  Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*
                  Math.sin(dLon/2)**2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    function shuffleArray(a){ 
        return a.sort(()=>Math.random()-0.5);
    } 

    // Wczytanie danych z JSON
    async function loadLocations() {
        try {
            const res = await fetch("locations.json");
            const data = await res.json();

            // Wczytanie wielu obszarów
            if (data.areas && data.areas.length > 0) {
                // Obsłuż format starej i nowej struktury obszaru.  Jeśli
                // element jest obiektem, oczekujemy pola coords z tablicą
                // współrzędnych; w przeciwnym razie traktujemy element
                // jako tablicę współrzędnych bez nazwy.
                areas = data.areas;
                polygonLayers = [];
                areas.forEach(areaObj => {
                    const coords = Array.isArray(areaObj) ? areaObj : areaObj.coords;
                    if (!Array.isArray(coords) || coords.length < 3) return;
                    const poly = L.polygon(coords, { color: "#8C1414", fillOpacity: 0.15 }).addTo(map);
                    polygonLayers.push(poly);
                });
                // Ustaw widok na pierwszy obszar – pobierz jego współrzędne
                const first = areas[0];
                const firstCoords = Array.isArray(first) ? first : first.coords;
                if (firstCoords && firstCoords.length > 0) {
                    map.fitBounds(firstCoords);
                }
            } else {
                console.error("Brak poprawnie zdefiniowanych obszarów w JSON!");
            }

            if(data.locations && data.locations.length > 0){
                locations = shuffleArray(data.locations);
                startRound();
            } else {
                console.error("Brak lokalizacji w JSON!");
            }

            // Aktualizacja tabeli wyników przy starcie
            // update asynchronously; log errors to avoid uncaught promises
            updateScoreTable().catch(err => console.error(err));

        } catch (e) {
            console.error("Nie udało się wczytać locations.json", e);
        }
    }

    function startRound() {
        resultDiv.innerText = "";
        pointsInfo.innerText = "";
        confirmBtn.disabled = true;
        nextBtn.style.display = "none";
        userGuess = null;
        roundConfirmed = false;

        if(guessMarker){ map.removeLayer(guessMarker); guessMarker=null; }
        if(correctMarker){ map.removeLayer(correctMarker); correctMarker=null; }
        if(line){ map.removeLayer(line); line=null; }

        const loc = locations[currentRound];

        // fullscreen photo
        roundPhoto.src = loc.image;
        photoOverlay.classList.remove("hidden");
        setTimeout(() => {
            photoOverlay.classList.add("show");
        }, 10);
        togglePhotoBtn.innerText = "Ukryj zdjęcie";
        // aktualizuj miniaturę; na początku jest ukryta, bo pokazujemy duże zdjęcie
        if(miniPhoto){
            miniPhoto.src = loc.image;
            miniPhoto.style.display = 'none';
        }

        roundInfo.innerText = `Runda: ${currentRound+1} / ${Math.min(locations.length, 5)}`;
    }

    // Kliknięcie na mapie
    map.on("click", function(e){
        if(roundConfirmed) return; 
        if(polygonLayers.length === 0) return;

        const clickPoint = e.latlng;
        //console.log("Kliknięto:", clickPoint.lat, clickPoint.lng); // Debug

        let inAnyArea = false;

        // Sprawdzenie dla każdego wielokąta
        for(let i = 0; i < polygonLayers.length; i++) {
            const poly = polygonLayers[i];
            const polygonCoords = poly.getLatLngs()[0];
            
            //console.log("Sprawdzam wielokąt", i, ":", polygonCoords); // Debug
            
            const result = isPointInPolygon(clickPoint.lat, clickPoint.lng, polygonCoords);
            //console.log("Rezultat dla wielokąta", i, ":", result); // Debug
            
            if(result) {
                inAnyArea = true;
                break;
            }
        }

        //console.log("Czy w obszarze?", inAnyArea); // Debug

        if(!inAnyArea){
            alert("Kliknięcie poza obszarem!");
            return;
        }

        userGuess = e.latlng;

        if(guessMarker) map.removeLayer(guessMarker);
        guessMarker = L.marker(userGuess).addTo(map);

        confirmBtn.disabled = false;
    });

    // Zatwierdzenie rundy
    confirmBtn.addEventListener("click", () => {
        const loc = locations[currentRound];
        const dist = distance(userGuess.lat,userGuess.lng,loc.lat,loc.lng);
        totalError += dist;
        const points = Math.max(0,500 - dist);
        totalPoints += points;

        correctMarker = L.marker([loc.lat, loc.lng], {
            icon:L.icon({
                iconUrl:"https://maps.gstatic.com/mapfiles/ms2/micons/green-dot.png",
                iconSize:[32,32]
            })
        }).addTo(map);

        line = L.polyline([userGuess,[loc.lat,loc.lng]],{color:"red"}).addTo(map);

        resultDiv.innerText = `Pomyliłeś się o ${Math.round(dist)} m`;
        pointsInfo.innerText = `Punkty: ${Math.round(points)}`;

        confirmBtn.disabled = true;
        roundConfirmed = true;
        // Jeśli osiągnięto ostatnią dopuszczalną rundę (5 lub koniec listy), kończymy grę automatycznie
        const isLastRound = (currentRound >= locations.length - 1) || (currentRound >= 4);
        if (isLastRound) {
            // Ukryj przycisk następnej rundy i zakończ grę po krótkim opóźnieniu, aby wyświetlić wynik
            nextBtn.style.display = "none";
            setTimeout(() => {
                endGame();
            }, 300);
        } else {
            // W przeciwnym razie pokaż przycisk następnej rundy
            nextBtn.style.display = "inline-block";
        }
    });

    // Przejście do następnej rundy
    nextBtn.addEventListener("click", () => {
        currentRound++;
        if(currentRound >= locations.length){ endGame(); }
		else if(currentRound >= 5){ endGame(); }
        else{ startRound(); }
    });

    // Koniec gry
function endGame(){
    if(guessMarker) map.removeLayer(guessMarker);
    if(correctMarker) map.removeLayer(correctMarker);
    if(line) map.removeLayer(line);

    // Encapsulate asynchronous scoreboard logic in an IIFE so that
    // the surrounding function remains synchronous.  We still call
    // updateScoreTable() once the score is stored to update the UI.
    (async () => {
        const scoreValue = Math.round(totalPoints);
        // Dodaj bieżące punkty do sumy kumulowanej
        totalAccumulated += scoreValue;

        // Zapisz dane końcowe do localStorage, aby można było je
        // odtworzyć w przypadku automatycznego przeładowania strony.
        // Tutaj wykorzystujemy już zaktualizowaną zmienną totalAccumulated,
        // aby uniknąć podwójnego dodawania punktów.
        try {
            const endData = {
                player: player,
                scoreSession: scoreValue,
                totalAccumulated: totalAccumulated
            };
            localStorage.setItem('endGameData', JSON.stringify(endData));
            localStorage.setItem('showEndPopup', 'true');
        } catch (e) {
            console.warn('Nie udało się zapisać danych końcowych do localStorage:', e);
        }

        // Spróbuj zapisać łączny wynik na serwerze
        let serverSuccess = false;
        try {
            const res = await fetch('http://127.0.0.1:5000/scores', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: player, score: totalAccumulated })
            });
            const data = await res.json();
            serverSuccess = data && data.success;
        } catch (err) {
            console.error('Nie udało się wysłać wyniku do API:', err);
        }

        // Aktualizuj localStorage jako kopię zapasową
        let localScores;
        try {
            localScores = JSON.parse(localStorage.getItem("geoguessrScores") || "[]");
        } catch (e) {
            localScores = [];
        }
        const existingPlayer = localScores.find(x => x.name === player);
        if (existingPlayer) {
            // Jeśli nowa suma jest większa, zaktualizuj rekord
            if (totalAccumulated > existingPlayer.score) {
                existingPlayer.score = totalAccumulated;
            }
        } else {
            localScores.push({ name: player, score: totalAccumulated });
        }
        localScores.sort((a, b) => b.score - a.score);
        localStorage.setItem("geoguessrScores", JSON.stringify(localScores));

        // Określ miejsce gracza w rankingu – użyj sumy kumulowanej
        let place = 0;
        if (serverSuccess) {
            try {
                const serverScores = await fetch('http://127.0.0.1:5000/scores').then(r => r.json());
                place = serverScores.findIndex(x => x.name === player && x.score === totalAccumulated) + 1;
            } catch (e) {
                console.warn('Nie można pobrać rankingu z serwera, używam lokalnego:', e);
                place = localScores.findIndex(x => x.name === player && x.score === totalAccumulated) + 1;
            }
        } else {
            place = localScores.findIndex(x => x.name === player && x.score === totalAccumulated) + 1;
        }

        // Ustaw teksty podsumowania: wynik bieżącej gry oraz wynik łączny
        finalScoreSession.innerText = `Twój wynik w tej grze: ${scoreValue} pkt`;
        finalScoreTotal.innerText = `Twój łączny wynik: ${totalAccumulated} pkt`;
        finalPlace.innerText = `Twoje miejsce: ${place}`;
        endPopup.classList.add("show");
        updateScoreTable().catch(err => console.error(err));
    })();
}


    // Obsługa przycisku "Zagraj ponownie" – ta sama nazwa gracza, dodawanie punktów
    if (playAgainSameBtn) {
        playAgainSameBtn.addEventListener("click", () => {
            // Usuń znacznik stanu końcowego z localStorage, aby zapobiec ponownemu
            // wyświetlaniu okna końcowego po automatycznym przeładowaniu strony
            localStorage.removeItem('showEndPopup');
            localStorage.removeItem('endGameData');
            // Zrestartuj stan rundy, ale nie zeruj sumarycznych punktów
            currentRound = 0;
            totalError = 0;
            totalPoints = 0;
            endPopup.classList.remove("show");
            loadLocations();
        });
    }

    // Obsługa przycisku "Zmień gracza" – reset całkowity i pytanie o nową nazwę
    if (playAgainNewBtn) {
        playAgainNewBtn.addEventListener("click", () => {
            // Usuń znacznik stanu końcowego z localStorage
            localStorage.removeItem('showEndPopup');
            localStorage.removeItem('endGameData');
            currentRound = 0;
            totalError = 0;
            totalPoints = 0;
            totalAccumulated = 0;
            // Usuń popup końcowy i pokaż okno startowe, aby wprowadzić nową nazwę
            endPopup.classList.remove("show");
            startPopup.classList.add("show");
        });
    }

    // Pokazywanie i ukrywanie zdjęcia
    togglePhotoBtn.addEventListener("click",()=>{
        if(photoOverlay.classList.contains("show")){
            // ukryj duże zdjęcie i pokaż miniaturę
            photoOverlay.classList.remove("show");
            setTimeout(() => {
                photoOverlay.classList.add("hidden");
            }, 300);
            togglePhotoBtn.innerText="Pokaż zdjęcie";
            if(miniPhoto){
                miniPhoto.style.display = 'block';
            }
        } else{
            // pokaż duże zdjęcie i ukryj miniaturę
            photoOverlay.classList.remove("hidden");
            setTimeout(() => {
                photoOverlay.classList.add("show");
            }, 10);
            togglePhotoBtn.innerText="Ukryj zdjęcie";
            if(miniPhoto){
                miniPhoto.style.display = 'none';
            }
        }
    });

    peekPhotoBtn.addEventListener("click", () => {
        photoOverlay.classList.remove("hidden");
        setTimeout(() => {
            photoOverlay.classList.add("show");
        }, 10);
        togglePhotoBtn.innerText="Ukryj zdjęcie";
        if(miniPhoto){
            miniPhoto.style.display = 'none';
        }
    });

    // Start gry po wpisaniu nicku
    startGameBtn.addEventListener("click",()=>{
        const name = playerNameInput.value.trim();
        if(name===""){ alert("Podaj nazwę gracza!"); return; }
        player = name;
        // Przy rozpoczęciu nowej gry z nowym graczem zresetuj sumaryczny wynik
        totalAccumulated = 0;
        startPopup.classList.remove("show");
        loadLocations();
    });

    // Funkcja aktualizująca tabelę wyników
    async function updateScoreTable() {
        const tbody = document.querySelector("#scoreTable tbody");
        tbody.innerHTML = "";

        // Attempt to fetch scores from the API; fallback to local storage
        let scores = [];
        let fromServer = false;
        try {
            const res = await fetch('http://127.0.0.1:5000/scores');
            if (res.ok) {
                scores = await res.json();
                fromServer = true;
            }
        } catch (err) {
            console.warn('Nie udało się pobrać ranking z API, używam localStorage:', err);
        }
        if (!fromServer) {
            try {
                scores = JSON.parse(localStorage.getItem("geoguessrScores") || "[]");
            } catch (e) {
                scores = [];
            }
        }
        // Sort for display
        scores.sort((a,b)=>b.score - a.score);
        scores.forEach((s,index)=>{
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${index+1}</td>
                <td>${s.name}</td>
                <td>${s.score}</td>
            `;
            tbody.appendChild(tr);
        });
    }

});
