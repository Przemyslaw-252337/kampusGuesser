// ---------------- ADRESY / KONFIGURACJA ----------------
// Nie hardkoduj IP. Skrypt automatycznie używa hosta, pod którym otwarto stronę.
const HOST = window.location.hostname;
const PROTOCOL = window.location.protocol;
const API_BASE = `${PROTOCOL}//${HOST}:5000`;
const GAME_BASE = `${PROTOCOL}//${HOST}:5500`;

// ---------------- LOGOWANIE ----------------
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const button = this.querySelector('button');
        button.innerText = 'Logowanie...';
        button.disabled = true;

        const email = this.querySelector('input[type="email"]').value;
        const password = this.querySelector('input[type="password"]').value;

        try {
            const res = await fetch(API_BASE + '/login', {
                credentials: 'include',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await res.json();

            if (data.success) {
                button.innerText = 'Zalogowano!';
                button.style.background = '#28a745';
                // Po pomyślnym logowaniu przekieruj do panelu wyboru
                setTimeout(() => window.location.href = 'panel.html', 1000);
            } else {
                button.innerText = 'Błąd logowania';
                button.style.background = '#dc3545';
                button.disabled = false;
            }
        } catch (err) {
            console.error(err);
            button.innerText = 'Błąd sieci';
            button.style.background = '#dc2626';
            button.disabled = false;
        }
    });
}

// ---------------- POWRÓT DO GRY ----------------
// Obsługuje kliknięcie przycisku powrotu do gry na stronie logowania.
// Po kliknięciu przekierowuje użytkownika z powrotem na główną grę
// uruchomioną na porcie 5500.  Przycisk jest dostępny tylko na
// stronie logowania, dlatego sprawdzamy jego istnienie przed
// rejestrowaniem zdarzenia.
const backToGameBtn = document.getElementById('backToGameBtn');
if (backToGameBtn) {
    backToGameBtn.addEventListener('click', () => {
        window.location.href = GAME_BASE + '/';
    });
}

// ---------------- UPLOAD ----------------
const uploadForm = document.getElementById("uploadForm");
if (uploadForm) {
    const fileInput = uploadForm.querySelector('input[type="file"]');
    const fileText = document.getElementById("fileText");
    const uploadBtn = document.getElementById("uploadBtn");
    const loader = uploadBtn.querySelector(".upload-loader");
    const burst = uploadBtn.querySelector(".burst");

    // Pokazanie nazwy wybranego pliku
    fileInput.addEventListener("change", () => {
        if (fileInput.files.length > 0) {
            fileText.textContent = fileInput.files[0].name;
        } else {
            fileText.textContent = "Wybierz zdjęcie";
        }
    });

    // Sprawdzenie sesji
    window.addEventListener("DOMContentLoaded", async () => {
        try {
            const res = await fetch(API_BASE + '/check-login', { credentials: 'include' });
            const data = await res.json();
            if (!data.logged_in) window.location.href = "index.html";
        } catch (err) {
            console.error(err);
            window.location.href = "index.html";
        }
    });

    // Wysyłka formularza
    uploadForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        uploadBtn.disabled = true;
        uploadBtn.classList.add("loading");
        loader.style.opacity = "1";

        const formData = new FormData(uploadForm);

        try {
            const res = await fetch(API_BASE + '/upload', { credentials: 'include', method: "POST", body: formData });
            const data = await res.json();

            loader.style.opacity = "0";
            uploadBtn.classList.remove("loading");

            if (data.success) {
                uploadBtn.classList.add("success");

                // Animacja promyczków
                burst.classList.add("show");
                setTimeout(() => burst.classList.remove("show"), 500);

                // Reset formularza po animacji
                setTimeout(() => {
                    uploadForm.reset();
                    fileText.textContent = "Wybierz zdjęcie";
                    uploadBtn.classList.remove("success");
                    uploadBtn.disabled = false;
                }, 700);
            } else {
                uploadBtn.classList.add("error");
                setTimeout(() => uploadBtn.classList.remove("error"), 1000);
                uploadBtn.disabled = false;
            }
        } catch (err) {
            console.error(err);
            loader.style.opacity = "0";
            uploadBtn.classList.remove("loading");
            uploadBtn.classList.add("error");
            setTimeout(() => uploadBtn.classList.remove("error"), 1000);
            uploadBtn.disabled = false;
        }
    });
}
