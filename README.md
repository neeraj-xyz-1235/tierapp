# Tier List Pro

A local drag-and-drop tier list maker with a small Python (Flask) backend. Drop images into a folder, drag them into tiers, and your list is saved automatically.

## Setup

Requires Python 3.9+.

```bash
cd python_tierapp
pip install -r requirements.txt
python app.py
```

Then open http://127.0.0.1:5000 in your browser.

## Usage

1. Put image files (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`) in `python_tierapp/static/images/`.
2. Click **Refresh Images**. New images appear in the bank below the tiers.
3. Drag images into tiers, between tiers, or back to the bank.
4. Click a tier label to rename it. **Enter** saves the name; **Shift+Enter** adds a line break.
5. Right-click a label to cycle through preset colors, or use ⚙️ to pick any color.
6. Use 🗑 to delete a row (its images go back to the bank) and ▲ / ▼ to reorder rows.
7. **New Tier Row** adds a row, **Square images** crops images to squares, and **Hide Tier Options** hides the row controls.
8. **Export image** downloads the tier list as a PNG.
9. **Reset All** clears every row. Your image files are not deleted.

Every change is saved automatically to `python_tierapp/state.json`.

## Project structure

```
python_tierapp/
├── app.py              # Flask server: state API and thumbnail generation
├── requirements.txt
├── state.json          # Your saved tier list
├── static/
│   ├── images/         # Your images go here
│   ├── script.js       # Frontend logic (drag & drop, saving)
│   └── style.css
└── templates/
    └── index.html
```

## Notes

- **Thumbnails:** the app shows downscaled thumbnails (generated with Pillow and cached in `python_tierapp/.thumbs/`) so large images don't slow the page down. `state.json` still points to the original files. If Pillow isn't installed, the original images are shown instead. You can delete `.thumbs/` at any time; it is rebuilt automatically.
- **Backing up:** to back up your list, copy `state.json` together with `static/images/`.
