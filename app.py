from flask import Flask, request, jsonify, session, send_from_directory
import os, json
from werkzeug.utils import secure_filename

app = Flask(__name__, static_folder='logowanie', static_url_path='/')
app.secret_key = "super_tajne_haslo_sesji"

# Folder na zdjęcia
UPLOAD_FOLDER = os.path.join('images')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Plik z lokalizacjami
LOCATIONS_FILE = os.path.join('gra', 'locations.json')
os.makedirs(os.path.dirname(LOCATIONS_FILE), exist_ok=True)

# Plik z rankingiem
SCORES_FILE = 'scores.json'

# LOGOWANIE
@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get("email")
    password = data.get("password")

    if os.path.exists('users.json'):
        with open('users.json') as f:
            users = json.load(f)
    else:
        users = [{"email": "admin@uni.pl", "password": "123456"}]

    for user in users:
        if user["email"] == email and user["password"] == password:
            session["logged_in"] = True
            return jsonify({"success": True})

    return jsonify({"success": False})

# SESJA
@app.route('/check-login')
def check_login():
    return jsonify({"logged_in": session.get("logged_in", False)})

# UPLOAD
@app.route('/upload', methods=['POST'])
def upload():
    if not session.get("logged_in"):
        return jsonify({"success": False, "error": "Brak dostępu"})

    if 'photo' not in request.files:
        return jsonify({"success": False, "error": "Brak pliku"})

    photo = request.files['photo']
    lat = request.form.get('lat')
    lng = request.form.get('lng')

    if not lat or not lng:
        return jsonify({"success": False, "error": "Brak współrzędnych"})

    filename = secure_filename(photo.filename)
    
    # Jeśli plik już istnieje, zmieniamy nazwę
    base, ext = os.path.splitext(filename)
    counter = 1
    while os.path.exists(os.path.join(UPLOAD_FOLDER, filename)):
        filename = f"{base}_{counter}{ext}"
        counter += 1

    save_path = os.path.join(UPLOAD_FOLDER, filename)
    photo.save(save_path)

    # Wczytaj locations
    if os.path.exists(LOCATIONS_FILE):
        with open(LOCATIONS_FILE) as f:
            data = json.load(f)
        if "locations" not in data:
            data["locations"] = []
        if "areas" not in data:
            data["areas"] = []
    else:
        data = {"areas": [], "locations": []}

    # Sprawdzenie, czy taka lokalizacja już istnieje
    exists = any(
        loc["lat"] == float(lat) and loc["lng"] == float(lng) and loc["image"] == f"images/{filename}"
        for loc in data["locations"]
    )
    if not exists:
        data["locations"].append({
            "lat": float(lat),
            "lng": float(lng),
            "image": f"images/{filename}"
        })

    with open(LOCATIONS_FILE, "w") as f:
        json.dump(data, f, indent=2)

    return jsonify({"success": True, "filename": filename})

@app.route('/images/<path:filename>')
def serve_image(filename):
    return send_from_directory("images", filename)

@app.route('/')
def index():
    return app.send_static_file('index.html')

# ------------------- RANKING -------------------
@app.route('/scores', methods=['GET', 'POST', 'OPTIONS'])
def scores():
    """
    Endpoints to fetch or update the ranking.

    GET  – return a list of all saved scores sorted descending
    POST – accept JSON {name: str, score: int} and update the ranking
    OPTIONS – support preflight CORS requests
    """
    # Handle CORS preflight requests
    if request.method == 'OPTIONS':
        response = app.make_response('')
        response.status_code = 200
        return response

    # Ensure the scores file exists
    if not os.path.exists(SCORES_FILE):
        # create an empty list if file missing
        with open(SCORES_FILE, 'w') as f:
            json.dump([], f)

    # GET returns the current ranking
    if request.method == 'GET':
        with open(SCORES_FILE) as f:
            try:
                scores = json.load(f)
            except json.JSONDecodeError:
                scores = []
        # sort descending by score
        scores.sort(key=lambda x: x.get('score', 0), reverse=True)
        return jsonify(scores)

    # POST saves or updates a player's score
    data = request.get_json()
    name = data.get('name') if data else None
    score = data.get('score') if data else None
    if not name or score is None:
        return jsonify({"success": False, "error": "Brak danych"}), 400
    try:
        score = int(score)
    except (ValueError, TypeError):
        return jsonify({"success": False, "error": "Niepoprawny format wyniku"}), 400
    # read current scores
    with open(SCORES_FILE) as f:
        try:
            scores = json.load(f)
        except json.JSONDecodeError:
            scores = []
    updated = False
    for item in scores:
        if item.get('name') == name:
            # update only if new score is higher
            if score > item.get('score', 0):
                item['score'] = score
            updated = True
            break
    if not updated:
        scores.append({'name': name, 'score': score})
    # sort descending and write file
    scores.sort(key=lambda x: x.get('score', 0), reverse=True)
    with open(SCORES_FILE, 'w') as f:
        json.dump(scores, f, indent=2)
    return jsonify({"success": True})

# ------------------- OBSZARY (TERYTORIA) -------------------
@app.route('/areas', methods=['GET', 'POST', 'OPTIONS'])
def manage_areas():
    """
    Endpoint do pobierania i aktualizowania listy terytoriów (obszarów gry).

    GET zwraca listę obszarów w formacie [[lat, lng], ...] dla każdego wielokąta.
    POST akceptuje JSON {"area": [[lat, lng], ...]} i dodaje do listy obszarów.
    OPTIONS obsługuje zapytania preflight dla CORS.
    """
    # Handle preflight
    if request.method == 'OPTIONS':
        resp = app.make_response('')
        resp.status_code = 200
        return resp

    # ensure locations file exists
    if not os.path.exists(LOCATIONS_FILE):
        with open(LOCATIONS_FILE, 'w') as f:
            json.dump({"areas": [], "locations": []}, f)

    # Wczytaj bieżące dane
    with open(LOCATIONS_FILE) as f:
        try:
            data = json.load(f)
        except json.JSONDecodeError:
            data = {"areas": [], "locations": []}

    if request.method == 'GET':
        areas = data.get("areas", [])
        normalized = []
        for idx, area in enumerate(areas):
            # jeśli area jest listą współrzędnych, nadaj domyślną nazwę
            if isinstance(area, list):
                normalized.append({"coords": area, "name": f"Terytorium {idx + 1}"})
            else:
                normalized.append(area)
        return jsonify(normalized)

    if request.method == 'POST':
        body = request.get_json() or {}
        area = body.get("area")
        name = body.get("name")
        if not area or not isinstance(area, list) or len(area) < 3:
            return jsonify({"success": False, "error": "Niepoprawne terytorium"}), 400
        areas = data.setdefault("areas", [])
        entry = {"coords": area, "name": name or f"Terytorium {len(areas)+1}"}
        areas.append(entry)
        data["areas"] = areas
        with open(LOCATIONS_FILE, "w") as f:
            json.dump(data, f, indent=2)
        return jsonify({"success": True})



# Zmieniono logikę obsługi terytoriów.  Usuwanie i aktualizacja nazwy
# odbywa się w jednej trasie ``update_area`` poniżej.  Dotychczasowa
# trasa ``_delete_area_deprecated`` została usunięta, aby zapobiec
# konfliktom i błędom 405 przy próbie użycia metod PUT.


# ------------------- CORS HEADERS -------------------
@app.after_request
def add_cors_headers(response):
    """
    Add CORS headers to each response to allow the front‑end running on
    a different port (e.g. 5500) to communicate with this API.
    """
    # Allow requests from any origin.  For production you may restrict this
    # to the exact origin (e.g. http://127.0.0.1:5500).
    response.headers['Access-Control-Allow-Origin'] = request.headers.get('Origin', '*')
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET,POST,OPTIONS,PUT,DELETE'
    response.headers['Access-Control-Allow-Credentials'] = 'true'
    return response

# Uruchomienie aplikacji przeniesiono na koniec pliku, aby upewnić się,
# że wszystkie dekoratory tras zostaną zarejestrowane zanim serwer
# zostanie uruchomiony.  Poprzednie wywołanie app.run zostało usunięte.

# ------------------- WYLOGOWANIE -------------------
@app.route('/logout', methods=['POST'])
def logout():
    """
    Kończy sesję zalogowanego nauczyciela poprzez usunięcie klucza
    `logged_in` z sesji.  Zwraca prosty JSON wskazujący sukces.
    """
    session.pop('logged_in', None)
    return jsonify({"success": True})

# ------------------- LOKALIZACJE (ZDJĘCIA) -------------------
@app.route('/locations', methods=['GET', 'OPTIONS'])
def get_locations():
    """
    Zwraca listę wszystkich zapisanych lokalizacji zdjęć.  Każdy wpis
    zawiera pola `lat`, `lng` oraz `image`.  Metoda OPTIONS obsługuje
    zapytania preflight.
    """
    if request.method == 'OPTIONS':
        resp = app.make_response('')
        resp.status_code = 200
        return resp
    # Upewnij się, że plik istnieje
    if not os.path.exists(LOCATIONS_FILE):
        return jsonify([])
    with open(LOCATIONS_FILE) as f:
        try:
            data = json.load(f)
        except json.JSONDecodeError:
            data = {"areas": [], "locations": []}
    return jsonify(data.get('locations', []))

@app.route('/locations/<int:index>', methods=['PUT', 'DELETE', 'OPTIONS'])
def modify_location(index: int):
    """
    Aktualizuje współrzędne istniejącej lokalizacji (PUT) lub usuwa
    lokalizację (DELETE).  W żądaniu PUT oczekiwane jest JSON z
    polami `lat` i `lng`.  Podczas usuwania usuwany jest również
    odpowiadający plik ze zdjęciem.
    """
    if request.method == 'OPTIONS':
        resp = app.make_response('')
        resp.status_code = 200
        return resp
    # Wczytaj plik
    if not os.path.exists(LOCATIONS_FILE):
        return jsonify({"success": False, "error": "Brak pliku"}), 404
    with open(LOCATIONS_FILE) as f:
        try:
            data = json.load(f)
        except json.JSONDecodeError:
            data = {"areas": [], "locations": []}
    locs = data.get('locations', [])
    if index < 0 or index >= len(locs):
        return jsonify({"success": False, "error": "Niepoprawny indeks"}), 400
    if request.method == 'DELETE':
        entry = locs.pop(index)
        # Usuń odpowiadający plik ze zdjęciem, jeśli istnieje
        image_path = entry.get('image', '')
        # Pliki są zapisywane w katalogu 'images'; usuń tylko jeśli ścieżka zaczyna się od images/
        if image_path.startswith('images/'):
            file_name = image_path.split('/', 1)[1]
            full_path = os.path.join('images', file_name)
            if os.path.exists(full_path):
                try:
                    os.remove(full_path)
                except OSError:
                    pass
        data['locations'] = locs
        with open(LOCATIONS_FILE, 'w') as f:
            json.dump(data, f, indent=2)
        return jsonify({"success": True})
    # PUT – aktualizacja współrzędnych
    body = request.get_json() or {}
    lat = body.get('lat')
    lng = body.get('lng')
    try:
        lat_f = float(lat)
        lng_f = float(lng)
    except (TypeError, ValueError):
        return jsonify({"success": False, "error": "Niepoprawne współrzędne"}), 400
    locs[index]['lat'] = lat_f
    locs[index]['lng'] = lng_f
    data['locations'] = locs
    with open(LOCATIONS_FILE, 'w') as f:
        json.dump(data, f, indent=2)
    return jsonify({"success": True})

# ------------------- OBSŁUGA EDYCJI NAZW OBSZARÓW -------------------
@app.route('/areas/<int:index>', methods=['PUT', 'DELETE', 'OPTIONS'])
def update_area(index):
    """
    Aktualizuje lub usuwa terytorium o wskazanym indeksie.  
    - PUT oczekuje JSON z polem `name` i zmienia nazwę obszaru,
      pozostawiając współrzędne bez zmian.  
    - DELETE usuwa obszar.
    """
    if request.method == 'OPTIONS':
        resp = app.make_response('')
        resp.status_code = 200
        return resp
    # Upewnij się, że plik istnieje
    if not os.path.exists(LOCATIONS_FILE):
        return jsonify({"success": False, "error": "Brak pliku"}), 404
    with open(LOCATIONS_FILE) as f:
        try:
            data = json.load(f)
        except json.JSONDecodeError:
            data = {"areas": [], "locations": []}
    areas = data.get('areas', [])
    if index < 0 or index >= len(areas):
        return jsonify({"success": False, "error": "Niepoprawny indeks"}), 400
    if request.method == 'DELETE':
        areas.pop(index)
        data['areas'] = areas
        with open(LOCATIONS_FILE, 'w') as f:
            json.dump(data, f, indent=2)
        return jsonify({"success": True})
    # PUT – zmiana nazwy
    body = request.get_json() or {}
    new_name = body.get('name')
    if not new_name:
        return jsonify({"success": False, "error": "Brak nazwy"}), 400
    # Normalizuj wpis obszaru – jeśli jest listą, zamień na dict
    if isinstance(areas[index], list):
        coords = areas[index]
        areas[index] = {"coords": coords, "name": new_name}
    else:
        areas[index]['name'] = new_name
    data['areas'] = areas
    with open(LOCATIONS_FILE, 'w') as f:
        json.dump(data, f, indent=2)
    return jsonify({"success": True})

# Uruchom serwer, ale dopiero po zdefiniowaniu wszystkich tras.  Dzięki
# temu dekoratory zarejestrują się przed startem aplikacji, co pozwala
# obsłużyć metody PUT/DELETE dla terytoriów i lokalizacji.
if __name__ == '__main__':
    app.run(debug=True)
