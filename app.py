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

if __name__ == '__main__':
    app.run(debug=True)
