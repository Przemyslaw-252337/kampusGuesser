// Panel administracyjny – obsługa przycisków, weryfikacja sesji i wylogowanie

document.addEventListener('DOMContentLoaded', () => {
    // Sprawdź, czy sesja logowania jest aktywna
    async function checkLogin() {
        try {
            const res = await fetch('http://127.0.0.1:5000/check-login');
            const data = await res.json();
            if (!data.logged_in) {
                // brak sesji – przekieruj na stronę logowania
                window.location.href = 'index.html';
            }
        } catch (err) {
            console.error('Błąd podczas sprawdzania sesji:', err);
            window.location.href = 'index.html';
        }
    }

    checkLogin();

    // Obsługa przycisków na stronie panelu
    const territoryBtn = document.getElementById('editTerritoryBtn');
    const photosBtn = document.getElementById('editPhotosBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    if (territoryBtn) {
        territoryBtn.addEventListener('click', () => {
            // przejdź do zarządzania terytorium
            window.location.href = 'territory.html';
        });
    }
    if (photosBtn) {
        photosBtn.addEventListener('click', () => {
            // przejdź do edycji/dodawania zdjęć
            window.location.href = 'photos.html';
        });
    }
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            // wyślij żądanie wylogowania do API
            try {
                await fetch('http://127.0.0.1:5000/logout', { method: 'POST' });
            } catch (e) {
                console.error('Błąd podczas wylogowywania:', e);
            }
            // przekieruj z powrotem na stronę logowania
            window.location.href = 'index.html';
        });
    }
});
