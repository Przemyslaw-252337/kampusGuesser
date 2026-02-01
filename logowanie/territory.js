// Skrypt zarządzania terytorium gry z podświetlaniem, zmianą nazwy, powrotem i pełnoekranową mapą

document.addEventListener('DOMContentLoaded', () => {
    let map;
    let drawing = false;
    let currentCoords = [];
    let currentPolyline = null;
    let polygons = [];

    // Sprawdzenie, czy użytkownik jest zalogowany
    async function checkLogin() {
        try {
            const res = await fetch('http://127.0.0.1:5000/check-login');
            const data = await res.json();
            if (!data.logged_in) {
                window.location.href = 'index.html';
            }
        } catch (err) {
            console.error('Błąd podczas sprawdzania sesji:', err);
            window.location.href = 'index.html';
        }
    }

    // Wczytaj terytoria z API i narysuj je na mapie oraz w liście
    async function loadAreas() {
        try {
            const res = await fetch('http://127.0.0.1:5000/areas');
            const areas = await res.json();
            // Usuń istniejące wielokąty
            polygons.forEach(obj => {
                map.removeLayer(obj.poly);
            });
            polygons = [];
            // Wyczyść listę
            const list = document.getElementById('areasList');
            list.innerHTML = '';
            areas.forEach((areaObj, index) => {
                let coords, name;
                if (Array.isArray(areaObj)) {
                    coords = areaObj;
                    name = `Terytorium ${index + 1}`;
                } else {
                    coords = areaObj.coords;
                    name = areaObj.name || `Terytorium ${index + 1}`;
                }
                const poly = L.polygon(coords, { color: '#8C1414', fillOpacity: 0.2 }).addTo(map);
                polygons.push({ poly, index });
                const li = document.createElement('li');
                // kontener tekstu nazwy
                const nameSpan = document.createElement('span');
                nameSpan.textContent = name;
                li.appendChild(nameSpan);

                // Podświetl przycisk
                const highBtn = document.createElement('button');
                highBtn.textContent = 'Podświetl';
                highBtn.className = 'small-btn';
                highBtn.style.marginLeft = '6px';
                highBtn.addEventListener('click', () => {
                    poly.setStyle({ color: '#004d99', fillOpacity: 0.3 });
                    // ustaw widok na wybrane terytorium
                    if (coords && coords.length > 0) {
                        poly.zoomTo ? poly.zoomTo() : map.fitBounds(poly.getBounds());
                    }
                    setTimeout(() => {
                        poly.setStyle({ color: '#8C1414', fillOpacity: 0.2 });
                    }, 1500);
                });
                li.appendChild(highBtn);

                // Zmień nazwę przycisk
                const renBtn = document.createElement('button');
                renBtn.textContent = 'Zmień nazwę';
                renBtn.className = 'small-btn';
                renBtn.style.marginLeft = '4px';
                renBtn.addEventListener('click', async () => {
                    const newName = prompt('Podaj nową nazwę dla terytorium:', name);
                    if (!newName) return;
                    try {
                        await fetch(`http://127.0.0.1:5000/areas/${index}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: newName })
                        });
                        await loadAreas();
                    } catch (e) {
                        console.error('Błąd podczas zmiany nazwy:', e);
                    }
                });
                li.appendChild(renBtn);

                // Usuń przycisk
                const remBtn = document.createElement('button');
                remBtn.textContent = 'Usuń';
                remBtn.className = 'small-btn';
                remBtn.style.marginLeft = '4px';
                remBtn.addEventListener('click', async () => {
                    if (!confirm('Na pewno usunąć terytorium?')) return;
                    try {
                        await fetch(`http://127.0.0.1:5000/areas/${index}`, { method: 'DELETE' });
                        await loadAreas();
                    } catch (e) {
                        console.error('Błąd podczas usuwania terytorium:', e);
                    }
                });
                li.appendChild(remBtn);

                list.appendChild(li);
            });
        } catch (err) {
            console.error('Błąd podczas wczytywania terytoriów:', err);
        }
    }

    function initMap() {
        map = L.map('territoryMap').setView([51.7531, 19.4519], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap'
        }).addTo(map);
        loadAreas();
    }

    // Rysowanie nowego terytorium
    const startBtn = document.getElementById('startDrawBtn');
    const finishBtn = document.getElementById('finishDrawBtn');
    const cancelBtn = document.getElementById('cancelDrawBtn');

    function onMapClick(e) {
        if (!drawing) return;
        const { lat, lng } = e.latlng;
        currentCoords.push([lat, lng]);
        if (currentPolyline) {
            currentPolyline.addLatLng(e.latlng);
        } else {
            currentPolyline = L.polyline([e.latlng], { color: '#3366cc' }).addTo(map);
        }
    }

    startBtn.addEventListener('click', () => {
        if (drawing) return;
        drawing = true;
        currentCoords = [];
        if (currentPolyline) {
            map.removeLayer(currentPolyline);
            currentPolyline = null;
        }
        startBtn.style.display = 'none';
        finishBtn.style.display = 'inline-block';
        cancelBtn.style.display = 'inline-block';
        map.on('click', onMapClick);
    });

    finishBtn.addEventListener('click', async () => {
        if (!drawing) return;
        if (currentCoords.length < 3) {
            alert('Dodaj co najmniej trzy punkty.');
            return;
        }
        drawing = false;
        if (currentPolyline) {
            map.removeLayer(currentPolyline);
            currentPolyline = null;
        }
        // Wyślij obszar do API z domyślną nazwą.  Nazwa może zostać zmieniona później.
        try {
            const res = await fetch('http://127.0.0.1:5000/areas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ area: currentCoords })
            });
            const data = await res.json();
            if (data.success) {
                await loadAreas();
            }
        } catch (e) {
            console.error('Błąd podczas zapisywania terytorium:', e);
        }
        startBtn.style.display = 'inline-block';
        finishBtn.style.display = 'none';
        cancelBtn.style.display = 'none';
        currentCoords = [];
        map.off('click', onMapClick);
    });

    cancelBtn.addEventListener('click', () => {
        if (!drawing) return;
        drawing = false;
        if (currentPolyline) {
            map.removeLayer(currentPolyline);
            currentPolyline = null;
        }
        currentCoords = [];
        startBtn.style.display = 'inline-block';
        finishBtn.style.display = 'none';
        cancelBtn.style.display = 'none';
        map.off('click', onMapClick);
    });

    // Powrót do panelu
    const backBtn = document.getElementById('backToPanelBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            window.location.href = 'panel.html';
        });
    }

    // Usunięto obsługę powiększania mapy.  Mapa zajmuje stałe miejsce po lewej stronie.

    checkLogin();
    initMap();
});
