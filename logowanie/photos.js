// Nowy skrypt obsługujący edycję zdjęć w panelu nauczyciela.
// W tej wersji wszystkie istniejące zdjęcia są od razu widoczne na mapie,
// a lista po prawej stronie zawiera jedynie miniatury.  Kliknięcie w
// miniaturę lub znacznik otwiera panel z informacjami i przyciskami
// (powiększ, edytuj, usuń, zamknij).  Edycja współrzędnych odbywa się
// w tym panelu poprzez wprowadzenie nowych wartości lub wskazanie
// nowego punktu na mapie.  Po zamknięciu panelu wszystkie znaczniki
// ponownie pojawiają się na mapie.

document.addEventListener('DOMContentLoaded', () => {
    // Referencje do elementów interfejsu
    const backBtn = document.getElementById('backToPanelBtn');
    const toggleAddFormBtn = document.getElementById('toggleAddFormBtn');
    const addFormContainer = document.getElementById('addFormContainer');
    const uploadForm = document.getElementById('uploadForm');
    const fileInput = uploadForm ? uploadForm.querySelector('input[type="file"]') : null;
    const fileText = document.getElementById('fileText');
    const fileErrorMsg = document.getElementById('fileErrorMsg');
    const uploadMessage = document.getElementById('uploadMessage');
    const latInput = document.getElementById('latInput');
    const lngInput = document.getElementById('lngInput');
    const photosList = document.getElementById('photosList');

    // Dane i zmienne pomocnicze
    let map;
    let photosData = [];   // zawartość z API
    let markers = [];      // marker dla każdego zdjęcia
    let tempMarker = null; // marker do dodawania nowego zdjęcia
    let currentIndex = null;  // indeks aktualnie wybranego zdjęcia
    let editingChoice = false; // czy czekamy na wskazanie nowej lokalizacji
    let newMarker = null;      // marker dla nowej lokalizacji podczas edycji

    // Sprawdzenie sesji nauczyciela
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

    // Inicjalizacja mapy
    function initMap() {
        map = L.map('photoMap').setView([51.7531, 19.4519], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap'
        }).addTo(map);
        // Kliknięcie na mapę ustawia współrzędne dla nowego zdjęcia tylko w trybie dodawania
        map.on('click', (e) => {
            // Jeśli czekamy na wybór nowej lokalizacji w edycji, pomiń; obsłuży to map.once w edycji
            if (editingChoice) return;
            // Jeśli formularz dodawania jest widoczny, obsługujemy wybór miejsca dla nowego zdjęcia
            if (addFormContainer && addFormContainer.style.display !== 'none') {
                if (!latInput || !lngInput) return;
                const { lat, lng } = e.latlng;
                latInput.value = lat.toFixed(6);
                lngInput.value = lng.toFixed(6);
                // Przesuń lub utwórz tymczasowy marker
                if (tempMarker) {
                    tempMarker.setLatLng(e.latlng);
                } else {
                    tempMarker = L.marker(e.latlng, { draggable: true }).addTo(map);
                    tempMarker.on('dragend', () => {
                        const pos = tempMarker.getLatLng();
                        latInput.value = pos.lat.toFixed(6);
                        lngInput.value = pos.lng.toFixed(6);
                    });
                }
                return;
            }
            // Kliknięcie w pustą mapę podczas podglądu zdjęcia – zamknij popup i przywróć widok
            if (currentIndex !== null) {
                // Usuń tymczasowy marker edycyjny
                if (newMarker) {
                    map.removeLayer(newMarker);
                    newMarker = null;
                }
                // Usuń tooltip starej lokalizacji, jeśli przypisany
                markers[currentIndex].unbindTooltip();
                // Zamknij popup
                markers[currentIndex].closePopup();
                // Przywróć wszystkie markery i usuń podświetlenie
                showAllMarkers();
                highlightThumbnail(null);
                currentIndex = null;
            }
        });
    }

    // Tworzy domyślną ikonę dla nowej lokalizacji (używa standardowej ikony Leaflet)
    function createNewIcon() {
        return new L.Icon({
            iconUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon.png',
            shadowUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        });
    }

    // Wczytaj listę zdjęć z API, narysuj markery i wypełnij listę miniatur
    async function loadPhotos() {
        try {
            const res = await fetch('http://127.0.0.1:5000/locations');
            photosData = await res.json();
            // Usuń dotychczasowe markery z mapy
            markers.forEach(m => map.removeLayer(m));
            markers = [];
            // Wyczyść listę
            photosList.innerHTML = '';
            photosData.forEach((p, index) => {
                // Stwórz marker dla zdjęcia
                const marker = L.marker([p.lat, p.lng]).addTo(map);
                marker.on('click', () => {
                    // Jeśli kliknięto ten sam marker, nic nie rób
                    if (currentIndex === index) {
                        return;
                    }
                    openPhotoPanel(index);
                });
                markers.push(marker);
                // Dodaj miniaturę do listy
                const li = document.createElement('li');
                li.style.cursor = 'pointer';
                const thumb = document.createElement('img');
                thumb.className = 'thumb';
                // jeśli ścieżka zaczyna się od images/, dodaj host
                thumb.src = p.image.startsWith('images/') ? `http://127.0.0.1:5000/${p.image}` : p.image;
                thumb.alt = p.image;
                thumb.title = p.image.split('/').pop();
                li.appendChild(thumb);
                li.addEventListener('click', () => openPhotoPanel(index));
                photosList.appendChild(li);
            });
        } catch (err) {
            console.error('Błąd podczas pobierania zdjęć:', err);
        }
    }

    // Podświetl miniaturę wybranego zdjęcia, usuń zaznaczenie z innych
    function highlightThumbnail(index) {
        if (!photosList) return;
        const items = photosList.children;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (i === index) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        }
    }

    // Ukryj wszystkie markery poza wskazanym indeksem
    function hideMarkersExcept(index) {
        markers.forEach((m, i) => {
            if (i !== index) {
                if (map.hasLayer(m)) {
                    map.removeLayer(m);
                }
            }
        });
    }

    // Przywróć wszystkie markery na mapę
    function showAllMarkers() {
        markers.forEach(m => {
            if (!map.hasLayer(m)) {
                m.addTo(map);
            }
        });
    }

    // Otwarcie panelu informacji o zdjęciu
    function openPhotoPanel(index) {
        // Przywróć wszystkie markery przed schowaniem, aby uniknąć zaniku przy zmianie selekcji
        showAllMarkers();
        currentIndex = index;
        const photo = photosData[index];
        const marker = markers[index];
        // Ukryj inne znaczniki
        hideMarkersExcept(index);
        // Usuń tymczasowy marker do nowego zdjęcia
        if (tempMarker) {
            map.removeLayer(tempMarker);
            tempMarker = null;
        }
        // Usuń marker nowej lokalizacji z poprzedniej edycji, jeśli istnieje
        if (newMarker) {
            map.removeLayer(newMarker);
            newMarker = null;
        }
        editingChoice = false;
        // Podświetl wybraną miniaturę
        highlightThumbnail(index);
        // Buduj zawartość popupu
        const container = document.createElement('div');
        container.className = 'photo-popup';
        // Nazwa pliku
        const nameEl = document.createElement('div');
        nameEl.style.fontWeight = '600';
        nameEl.style.marginBottom = '4px';
        nameEl.textContent = photo.image.split('/').pop();
        container.appendChild(nameEl);
        // Koordynaty
        const coordsEl = document.createElement('div');
        coordsEl.style.fontSize = '14px';
        coordsEl.style.marginBottom = '8px';
        coordsEl.textContent = `[${photo.lat}, ${photo.lng}]`;
        container.appendChild(coordsEl);
        // Kontener przycisków
        const btnContainer = document.createElement('div');
        btnContainer.style.display = 'flex';
        btnContainer.style.flexWrap = 'wrap';
        btnContainer.style.gap = '6px';
        // Powiększ
        const viewBtn = document.createElement('button');
        viewBtn.className = 'small-btn';
        viewBtn.textContent = 'Powiększ';
        viewBtn.addEventListener('click', () => {
            const src = photo.image.startsWith('images/') ? `http://127.0.0.1:5000/${photo.image}` : photo.image;
            window.open(src, '_blank');
        });
        btnContainer.appendChild(viewBtn);
        // Edytuj
        const editBtn = document.createElement('button');
        editBtn.className = 'small-btn';
        editBtn.textContent = 'Edytuj';
        editBtn.addEventListener('click', () => {
            showEditPanel(index);
        });
        btnContainer.appendChild(editBtn);
        // Usuń
        const delBtn = document.createElement('button');
        delBtn.className = 'small-btn';
        delBtn.textContent = 'Usuń';
        delBtn.addEventListener('click', async () => {
            if (!confirm('Na pewno usunąć to zdjęcie?')) return;
            try {
                await fetch(`http://127.0.0.1:5000/locations/${index}`, { method: 'DELETE' });
                marker.closePopup();
                await loadPhotos();
                showAllMarkers();
                // Usuń podświetlenie
                highlightThumbnail(null);
                currentIndex = null;
            } catch (err) {
                console.error('Błąd usuwania zdjęcia:', err);
            }
        });
        btnContainer.appendChild(delBtn);
        // Zamknij
        const closeBtn = document.createElement('button');
        closeBtn.className = 'small-btn';
        closeBtn.textContent = 'Zamknij';
        closeBtn.addEventListener('click', () => {
            marker.closePopup();
            showAllMarkers();
            highlightThumbnail(null);
            currentIndex = null;
        });
        btnContainer.appendChild(closeBtn);
        container.appendChild(btnContainer);
        // Otwórz popup
        // Ustaw closeOnClick na false, aby kliknięcie na mapie nie zamykało
        // popupu – zamykamy go samodzielnie w globalnym obsługiwaczu po
        // zakończeniu edycji lub odznaczeniu zdjęcia.
        marker.bindPopup(container, { closeButton: false, offset: [0, -10], closeOnClick: false }).openPopup();
    }

    // Panel edycji dla zdjęcia
    function showEditPanel(index) {
        const photo = photosData[index];
        const marker = markers[index];
        // Przygotuj panel edycji
        const container = document.createElement('div');
        container.className = 'photo-popup';
        // Tytuł
        const title = document.createElement('div');
        title.textContent = 'Edytuj współrzędne';
        title.style.fontWeight = '600';
        title.style.marginBottom = '6px';
        container.appendChild(title);
        // Wiadomość
        const msg = document.createElement('div');
        msg.style.fontSize = '13px';
        msg.style.marginBottom = '6px';
        msg.style.color = '#590A0A';
        msg.textContent = '';
        container.appendChild(msg);
        // Pola do edycji
        const latInputEdit = document.createElement('input');
        latInputEdit.type = 'number';
        latInputEdit.step = 'any';
        latInputEdit.value = photo.lat;
        latInputEdit.style.marginBottom = '4px';
        latInputEdit.style.width = '100%';
        latInputEdit.style.border = '1px solid #8C1414';
        latInputEdit.style.borderRadius = '4px';
        latInputEdit.style.padding = '4px';
        container.appendChild(latInputEdit);
        const lngInputEdit = document.createElement('input');
        lngInputEdit.type = 'number';
        lngInputEdit.step = 'any';
        lngInputEdit.value = photo.lng;
        lngInputEdit.style.marginBottom = '6px';
        lngInputEdit.style.width = '100%';
        lngInputEdit.style.border = '1px solid #8C1414';
        lngInputEdit.style.borderRadius = '4px';
        lngInputEdit.style.padding = '4px';
        container.appendChild(lngInputEdit);
        // Stara lokalizacja – dodaj tooltip na oryginalnym markerze
        marker.bindTooltip('Stara lokalizacja', { permanent: true, offset: [0, -15], className: 'marker-tooltip' });
        // Przyciski edycji
        const btnWrapper = document.createElement('div');
        btnWrapper.style.display = 'flex';
        btnWrapper.style.flexWrap = 'wrap';
        btnWrapper.style.gap = '6px';
        // Potwierdź – utworzony przed przyciskiem wyboru, aby dostępny był w scope
        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'small-btn';
        confirmBtn.textContent = 'Potwierdź';
        confirmBtn.disabled = true;
        confirmBtn.addEventListener('click', async () => {
            if (!confirm('Czy na pewno zmienić lokalizację zdjęcia?')) return;
            const newLat = latInputEdit.value;
            const newLng = lngInputEdit.value;
            try {
                const res = await fetch(`http://127.0.0.1:5000/locations/${index}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lat: newLat, lng: newLng })
                });
                const data = await res.json();
                if (data.success) {
                    // Usuń nowy marker, tooltip starej lokalizacji
                    if (newMarker) {
                        map.removeLayer(newMarker);
                        newMarker = null;
                    }
                    marker.unbindTooltip();
                    marker.closePopup();
                    // Zakończ tryb edycji lokalizacji
                    editingChoice = false;
                    await loadPhotos();
                    showAllMarkers();
                    highlightThumbnail(null);
                    currentIndex = null;
                }
            } catch (err) {
                console.error('Błąd podczas aktualizacji pozycji zdjęcia:', err);
            }
        });
        // Anuluj
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'small-btn';
        cancelBtn.textContent = 'Anuluj';
        cancelBtn.addEventListener('click', () => {
            // Usuń nowy marker jeśli istnieje
            if (newMarker) {
                map.removeLayer(newMarker);
                newMarker = null;
            }
            // Usuń tooltip starej lokalizacji
            marker.unbindTooltip();
            // Zakończ tryb edycji lokalizacji
            editingChoice = false;
            // Przywróć panel podglądu zdjęcia
            openPhotoPanel(index);
        });
        // Wybierz na mapie
        const chooseBtn = document.createElement('button');
        chooseBtn.className = 'small-btn';
        chooseBtn.textContent = 'Wybierz na mapie';
        /**
         * Uruchom tryb wyboru lokalizacji na mapie.  W trakcie tego
         * trybu wszystkie kliknięcia na mapie są ignorowane przez
         * globalny handler (``editingChoice`` pozostaje włączony) aż
         * do chwili potwierdzenia lub anulowania edycji.  Po
         * wybraniu punktu na mapie pola lat/lng są aktualizowane,
         * tworzony jest marker ``newMarker`` i odblokowywany
         * zostaje przycisk ``confirmBtn``.  Kolejne kliknięcia na
         * mapie są ignorowane, dopóki użytkownik nie zatwierdzi lub
         * nie anuluje zmian.
         */
        chooseBtn.addEventListener('click', () => {
            // Nie aktywuj ponownie trybu wyboru, jeśli już oczekujemy na kliknięcie
            if (editingChoice) return;
            editingChoice = true;
            msg.textContent = 'Kliknij na mapie, aby wybrać nowy punkt.';
            // Ustaw jednorazowy handler na kliknięcie na mapie.  Nie zmieniaj
            // wartości editingChoice w tym miejscu – pozwól, aby
            // ignorowała kolejne kliknięcia do czasu potwierdzenia/anulowania.
            map.once('click', (e) => {
                const { lat, lng } = e.latlng;
                latInputEdit.value = lat.toFixed(6);
                lngInputEdit.value = lng.toFixed(6);
                // Utwórz lub przesuń marker nowej lokalizacji
                if (newMarker) {
                    newMarker.setLatLng(e.latlng);
                } else {
                    newMarker = L.marker(e.latlng, { icon: createNewIcon() }).addTo(map);
                    newMarker.bindTooltip('Nowa lokalizacja', { permanent: true, offset: [0, -15], className: 'marker-tooltip' });
                }
                msg.textContent = 'Wybrano nowy punkt. Potwierdź lub anuluj zmianę.';
                // Odblokuj przycisk potwierdzający
                confirmBtn.disabled = false;
                // editingChoice pozostaje true – tryb wyboru kończy
                // się po potwierdzeniu lub anulowaniu
            });
        });
        // Dodaj przyciski do kontenera (kolejność: wybierz, potwierdź, anuluj)
        btnWrapper.appendChild(chooseBtn);
        btnWrapper.appendChild(confirmBtn);
        btnWrapper.appendChild(cancelBtn);
        // Funkcja włączająca przycisk potwierdzenia, gdy wartości różnią się od oryginału
        function onInputChange() {
            if (latInputEdit.value !== String(photo.lat) || lngInputEdit.value !== String(photo.lng)) {
                confirmBtn.disabled = false;
                msg.textContent = 'Zmodyfikowano współrzędne. Potwierdź lub anuluj zmianę.';
            } else {
                // Jeżeli nie wybrano nowej lokalizacji (brak newMarker), dezaktywuj
                confirmBtn.disabled = !newMarker;
                if (!newMarker) msg.textContent = '';
            }
        }
        latInputEdit.addEventListener('input', onInputChange);
        lngInputEdit.addEventListener('input', onInputChange);
        // Zainicjuj stan przycisku
        onInputChange();
        container.appendChild(btnWrapper);
        // Podczas edycji wyłączamy domyślne zamykanie popupa po kliknięciu
        // na mapę (closeOnClick:false).  Dzięki temu kliknięcia w mapę w
        // trybie wyboru nowej lokalizacji nie zamkną panelu edycji.
        marker.bindPopup(container, { closeButton: false, offset: [0, -10], closeOnClick: false }).openPopup();
    }

    // Obsługa pokazania/ukrycia formularza dodawania zdjęcia
    if (toggleAddFormBtn && addFormContainer) {
        toggleAddFormBtn.addEventListener('click', () => {
            const isVisible = addFormContainer.style.display !== 'none';
            addFormContainer.style.display = isVisible ? 'none' : 'block';
        });
    }

    // Walidacja pliku wejściowego
    if (fileInput) {
        fileInput.addEventListener('change', () => {
            fileErrorMsg.style.display = 'none';
            uploadMessage.style.display = 'none';
            if (fileInput.files.length > 0) {
                const fileName = fileInput.files[0].name;
                const ext = fileName.split('.').pop().toLowerCase();
                if (ext !== 'jpg' && ext !== 'jpeg') {
                    fileErrorMsg.textContent = 'Dozwolone są wyłącznie pliki JPG/JPEG.';
                    fileErrorMsg.style.display = 'block';
                    fileInput.value = '';
                    fileText.textContent = 'Wybierz zdjęcie';
                    return;
                }
                fileText.textContent = fileName;
            } else {
                fileText.textContent = 'Wybierz zdjęcie';
            }
        });
    }

    // Obsługa formularza dodawania zdjęcia
    if (uploadForm) {
        uploadForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            uploadMessage.style.display = 'none';
            fileErrorMsg.style.display = 'none';
            const btn = document.getElementById('uploadBtn');
            const loader = btn ? btn.querySelector('.upload-loader') : null;
            btn.disabled = true;
            btn.classList.add('loading');
            if (loader) loader.style.opacity = '1';
            const formData = new FormData(uploadForm);
            try {
                const res = await fetch('http://127.0.0.1:5000/upload', {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();
                if (loader) loader.style.opacity = '0';
                btn.classList.remove('loading');
                btn.disabled = false;
                if (data.success) {
                    uploadMessage.textContent = 'Zdjęcie dodano pomyślnie.';
                    uploadMessage.style.color = '#28a745';
                    uploadMessage.style.display = 'block';
                    // Wyczyść formularz i marker tymczasowy
                    uploadForm.reset();
                    fileText.textContent = 'Wybierz zdjęcie';
                    if (tempMarker) {
                        map.removeLayer(tempMarker);
                        tempMarker = null;
                    }
                    await loadPhotos();
                } else {
                    fileErrorMsg.textContent = data.error || 'Wystąpił błąd podczas przesyłania.';
                    fileErrorMsg.style.display = 'block';
                }
            } catch (err) {
                console.error('Błąd przesyłania pliku:', err);
                if (loader) loader.style.opacity = '0';
                btn.classList.remove('loading');
                btn.disabled = false;
                fileErrorMsg.textContent = 'Wystąpił błąd podczas przesyłania.';
                fileErrorMsg.style.display = 'block';
            }
        });
    }

    // Powrót do panelu
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            window.location.href = 'panel.html';
        });
    }

    // Inicjalizacja wszystkiego
    checkLogin();
    initMap();
    loadPhotos();
});