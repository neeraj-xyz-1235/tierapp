from flask import Flask, render_template, request, jsonify, send_from_directory, abort
import os
import re
import json
import threading

try:
    from PIL import Image
except ImportError:  # Thumbnails are optional; originals are served without Pillow
    Image = None

app = Flask(__name__)

# Configuration
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, 'static')
IMAGES_DIR = os.path.join(STATIC_DIR, 'images')
THUMBS_DIR = os.path.join(BASE_DIR, '.thumbs')
STATE_FILE = os.path.join(BASE_DIR, 'state.json')

IMAGE_EXTS = ('.png', '.jpg', '.jpeg', '.gif', '.webp')
THUMB_HEIGHT = 240  # 3x the 80px display height: sharp on hi-DPI screens and in 2x exports
MAX_LABEL_LEN = 200

# Ensure directories exist
os.makedirs(IMAGES_DIR, exist_ok=True)
os.makedirs(THUMBS_DIR, exist_ok=True)
os.makedirs(os.path.join(BASE_DIR, 'templates'), exist_ok=True)

_state_lock = threading.Lock()

DEFAULT_STATE = {
    "rows": [
        { "label": "S", "colorClass": "s-tier", "items": [] },
        { "label": "A", "colorClass": "a-tier", "items": [] },
        { "label": "B", "colorClass": "b-tier", "items": [] },
        { "label": "C", "colorClass": "c-tier", "items": [] },
        { "label": "D", "colorClass": "d-tier", "items": [] },
        { "label": "F", "colorClass": "f-tier", "items": [] }
    ],
    "bank": [],
    "settings": {
        "square": False,
        "hideOptions": False
    }
}


def clean_label(label):
    """Trim whitespace and collapse blank lines.

    Contenteditable labels used to gain extra newlines on every save, which
    doubled them each time and bloated state.json to tens of megabytes.
    """
    if not isinstance(label, str):
        return ''
    label = label.replace('\r', '')
    label = re.sub(r'\n\s*\n+', '\n', label).strip()
    return label[:MAX_LABEL_LEN]


def normalize_state(state):
    if not isinstance(state, dict):
        return json.loads(json.dumps(DEFAULT_STATE))
    if not state.get('rows'): state['rows'] = json.loads(json.dumps(DEFAULT_STATE['rows']))
    if not state.get('bank'): state['bank'] = []
    if not state.get('settings'): state['settings'] = dict(DEFAULT_STATE['settings'])
    for row in state['rows']:
        row['label'] = clean_label(row.get('label', ''))
        row.setdefault('items', [])
    return state


def load_state():
    if not os.path.exists(STATE_FILE):
        return json.loads(json.dumps(DEFAULT_STATE))
    try:
        with open(STATE_FILE, 'r', encoding='utf-8') as f:
            return normalize_state(json.load(f))
    except Exception as e:
        print(f"Error loading state: {e}")
        return json.loads(json.dumps(DEFAULT_STATE))


def save_state(state):
    """Write atomically so a crash mid-save can never corrupt state.json."""
    tmp_file = STATE_FILE + '.tmp'
    try:
        with _state_lock:
            with open(tmp_file, 'w', encoding='utf-8') as f:
                json.dump(normalize_state(state), f, indent=2, ensure_ascii=False)
            os.replace(tmp_file, STATE_FILE)
        return True
    except Exception as e:
        print(f"Error saving state: {e}")
        return False


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/thumb/<path:filename>')
def thumb(filename):
    """Serve a small cached thumbnail; fall back to the original image."""
    src = os.path.normpath(os.path.join(IMAGES_DIR, filename))
    if not src.startswith(IMAGES_DIR + os.sep) or not os.path.isfile(src):
        abort(404)

    if Image is not None:
        thumb_name = filename.replace('/', '_').replace('\\', '_') + '.webp'
        thumb_path = os.path.join(THUMBS_DIR, thumb_name)
        try:
            if (not os.path.exists(thumb_path)
                    or os.path.getmtime(thumb_path) < os.path.getmtime(src)):
                with Image.open(src) as im:
                    im.seek(0)  # first frame for animated images
                    if im.height > THUMB_HEIGHT:
                        width = max(1, round(im.width * THUMB_HEIGHT / im.height))
                        im = im.resize((width, THUMB_HEIGHT), Image.LANCZOS)
                    if im.mode not in ('RGB', 'RGBA'):
                        im = im.convert('RGBA')
                    im.save(thumb_path + '.tmp', 'WEBP', quality=85, method=4)
                os.replace(thumb_path + '.tmp', thumb_path)
            return send_from_directory(THUMBS_DIR, thumb_name, max_age=86400, mimetype='image/webp')
        except Exception as e:
            print(f"Thumbnail failed for {filename}: {e}")

    return send_from_directory(IMAGES_DIR, filename, max_age=86400)


@app.route('/api/state', methods=['GET'])
def get_state():
    state = load_state()

    # Get all images already placed
    existing_images = set()
    for row in state['rows']:
        existing_images.update(row['items'])
    existing_images.update(state['bank'])

    # Scan directory for new images
    new_images = []
    if os.path.exists(IMAGES_DIR):
        for filename in sorted(os.listdir(IMAGES_DIR)):
            if filename.lower().endswith(IMAGE_EXTS):
                filepath = f"static/images/{filename}"
                if filepath not in existing_images:
                    new_images.append(filepath)

    # Add new images to bank
    if new_images:
        state['bank'].extend(new_images)
        save_state(state)

    return jsonify(state)


@app.route('/api/state', methods=['POST'])
def update_state():
    state = request.get_json(silent=True)
    if not isinstance(state, dict):
        return jsonify({"status": "error", "message": "Invalid state"}), 400
    if save_state(state):
        return jsonify({"status": "success"}), 200
    return jsonify({"status": "error", "message": "Failed to save state"}), 500


if __name__ == '__main__':
    app.run(debug=True)
