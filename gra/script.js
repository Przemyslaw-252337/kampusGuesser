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
    const finalScore = document.getElementById('finalScore');
    const finalPlace = document.getElementById('finalPlace');
    const restartBtn = document.getElementById('restartBtn');
    const closePopupBtn = document.getElementById('closePopupBtn');
    const photoOverlay = document.getElementById("photoOverlay");
    const roundPhoto = document.getElementById("roundPhoto");
    const togglePhotoBtn = document.getElementById("togglePhotoBtn");
    const peekPhotoBtn = document.getElementById("peekPhotoBtn");
    const teacherLoginBtn = document.getElementById("teacherLoginBtn");

    // Event listener dla przycisku logowania wykładowcy
    teacherLoginBtn.addEventListener("click", () => {
        window.location.href = "../logowanie/index.html";
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
            if(data.areas && data.areas.length > 0){
                areas = data.areas;
                polygonLayers = [];

                areas.forEach(area => {
                    console.log("Ładuję obszar:", area); // Debug
                    const poly = L.polygon(area, {color:"#8C1414", fillOpacity:0.15}).addTo(map);
                    polygonLayers.push(poly);
                });

                map.fitBounds(areas[0]);
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
            updateScoreTable();

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
        nextBtn.style.display="inline-block";
        roundConfirmed = true;
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

    let scores = JSON.parse(localStorage.getItem("geoguessrScores") || "[]");

    // Sprawdzenie, czy gracz już istnieje
    const existingPlayer = scores.find(x => x.name === player);

    if(existingPlayer){
        // Aktualizujemy tylko jeśli nowy wynik jest wyższy
        if(totalPoints > existingPlayer.score){
            existingPlayer.score = Math.round(totalPoints);
        }
    } else {
        scores.push({name:player, score:Math.round(totalPoints)});
    }

    // Sortowanie i zapis
    scores.sort((a,b)=>b.score - a.score);
    localStorage.setItem("geoguessrScores", JSON.stringify(scores));

    // Znalezienie miejsca gracza
    let place = scores.findIndex(x => x.name === player && x.score === Math.round(totalPoints)) + 1;

    finalScore.innerText = `Twój wynik: ${Math.round(totalPoints)} pkt`;
    finalPlace.innerText = `Twoje miejsce: ${place}`;

    endPopup.classList.add("show");

    // Aktualizacja tabeli wyników
    updateScoreTable();
}


    // Restart gry
    restartBtn.addEventListener("click", () => {
        currentRound=0; totalError=0; totalPoints=0;
        endPopup.classList.remove("show");
        loadLocations();
    });

    closePopupBtn.addEventListener("click",()=>{ endPopup.classList.remove("show"); });

    // Pokazywanie i ukrywanie zdjęcia
    togglePhotoBtn.addEventListener("click",()=>{
        if(photoOverlay.classList.contains("show")){
            photoOverlay.classList.remove("show");
            setTimeout(() => {
                photoOverlay.classList.add("hidden");
            }, 300);
            togglePhotoBtn.innerText="Pokaż zdjęcie";
        } else{
            photoOverlay.classList.remove("hidden");
            setTimeout(() => {
                photoOverlay.classList.add("show");
            }, 10);
            togglePhotoBtn.innerText="Ukryj zdjęcie";
        }
    });

    peekPhotoBtn.addEventListener("click", () => {
        photoOverlay.classList.remove("hidden");
        setTimeout(() => {
            photoOverlay.classList.add("show");
        }, 10);
        togglePhotoBtn.innerText="Ukryj zdjęcie";
    });

    // Start gry po wpisaniu nicku
    startGameBtn.addEventListener("click",()=>{
        const name = playerNameInput.value.trim();
        if(name===""){ alert("Podaj nazwę gracza!"); return; }
        player=name;
        startPopup.classList.remove("show");
        loadLocations();
    });

    // Funkcja aktualizująca tabelę wyników
    function updateScoreTable(){
        const tbody = document.querySelector("#scoreTable tbody");
        tbody.innerHTML = "";

        const scores = JSON.parse(localStorage.getItem("geoguessrScores") || "[]");
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
