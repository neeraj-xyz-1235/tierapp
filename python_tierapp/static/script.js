document.addEventListener('DOMContentLoaded', () => {
    const tierListContainer = document.getElementById('tier-list-container');
    const imageBank = document.getElementById('image-bank');
    const addRowBtn = document.getElementById('add-row-btn');
    const exportBtn = document.getElementById('export-btn');
    const resetBtn = document.getElementById('reset-btn');
    const squareImagesCheck = document.getElementById('square-images-check');
    const hideControlsCheck = document.getElementById('hide-controls-check');
    const refreshImagesBtn = document.getElementById('refresh-images-btn');

    let draggingEl = null;

    let state = {
        rows: [],
        bank: [],
        settings: {
            square: false,
            hideOptions: false
        }
    };

    // --- State Management ---

    async function loadState() {
        try {
            const response = await fetch('/api/state');
            if (response.ok) {
                state = await response.json();
                render();
            } else {
                console.error("Failed to load state from server.");
            }
        } catch (error) {
            console.error("Error fetching state:", error);
        }
    }

    // Normalize a label: trim and collapse blank lines. Reading innerText back
    // from a contenteditable adds trailing newlines, which used to double on
    // every save and bloated state.json to tens of megabytes.
    function cleanLabel(text) {
        return (text || '').replace(/\r/g, '').replace(/\n\s*\n+/g, '\n').trim().slice(0, 200);
    }

    // Path stored in state (e.g. "static/images/x.jpg"), independent of the displayed thumbnail
    function itemPath(img) {
        return img.dataset.src || img.getAttribute('src');
    }

    // Coalesce bursts of changes (e.g. dragend + drop) into a single request
    let saveTimer = null;
    let saveInFlight = false;
    let savePending = false;
    function saveState() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveStateNow, 150);
    }

    async function saveStateNow() {
        if (saveInFlight) { savePending = true; return; }
        saveInFlight = true;
        // Scrape current state from DOM
        const newRows = [];
        const rowElements = tierListContainer.querySelectorAll('.tier-row');
        rowElements.forEach(rowEl => {
            const labelEl = rowEl.querySelector('.tier-label');
            const contentEl = rowEl.querySelector('.tier-content');
            const items = [];
            contentEl.querySelectorAll('.tier-item').forEach(img => {
                // Get the relative path, not the full http URL
                items.push(itemPath(img));
            });

            let colorClass = 'default-tier';
            labelEl.classList.forEach(cls => {
                if (cls.endsWith('-tier')) colorClass = cls;
            });
            const customColor = labelEl.style.backgroundColor;

            newRows.push({
                label: cleanLabel(labelEl.innerText),
                colorClass: colorClass,
                color: customColor,
                items: items
            });
        });

        const newBank = [];
        imageBank.querySelectorAll('.tier-item').forEach(img => {
            newBank.push(itemPath(img));
        });

        state.rows = newRows;
        state.bank = newBank;
        state.settings.square = squareImagesCheck.checked;
        state.settings.hideOptions = hideControlsCheck.checked;

        // Send to server
        try {
            await fetch('/api/state', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(state)
            });
        } catch (error) {
            console.error("Error saving state to server:", error);
        } finally {
            saveInFlight = false;
            if (savePending) { savePending = false; saveStateNow(); }
        }
    }

    // --- Rendering ---

    function render() {
        tierListContainer.replaceChildren();
        imageBank.replaceChildren();

        // Apply settings
        squareImagesCheck.checked = state.settings.square;
        if (state.settings.square) tierListContainer.classList.add('square-mode');
        else tierListContainer.classList.remove('square-mode');

        hideControlsCheck.checked = state.settings.hideOptions;
        if (state.settings.hideOptions) tierListContainer.classList.add('hide-options');
        else tierListContainer.classList.remove('hide-options');

        // Render Rows
        state.rows.forEach(row => {
            createRowElement(row);
        });

        // Render Bank
        const bankFrag = document.createDocumentFragment();
        state.bank.forEach(src => {
            createImageElement(src, bankFrag);
        });
        imageBank.appendChild(bankFrag);
    }

    function createRowElement(rowData) {
        const row = document.createElement('div');
        row.className = 'tier-row';

        // Label
        const label = document.createElement('div');
        label.className = `tier-label ${rowData.colorClass}`;
        if (rowData.color) {
            label.style.backgroundColor = rowData.color;
        }
        label.contentEditable = true;
        label.innerText = cleanLabel(rowData.label);

        // Enter finishes editing (Shift+Enter still inserts a line break)
        label.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                label.blur();
            }
        });

        label.addEventListener('blur', () => {
            const cleaned = cleanLabel(label.innerText);
            if (label.innerText !== cleaned) label.innerText = cleaned;
            saveState();
        });

        // Change color on Right Click
        label.addEventListener('contextmenu', (e) => {
             e.preventDefault();
             label.style.backgroundColor = '';
             const colors = ['s-tier', 'a-tier', 'b-tier', 'c-tier', 'd-tier', 'f-tier', 'default-tier'];
             let current = colors.find(c => label.classList.contains(c));
             if (!current) current = 'default-tier';

             label.classList.remove(current);
             let idx = colors.indexOf(current);
             if (idx === -1) idx = 0;

             let next = colors[(idx + 1) % colors.length];
             label.classList.add(next);
             saveState();
        });

        // Content
        const content = document.createElement('div');
        content.className = 'tier-content';
        setupDropZone(content);

        const itemsFrag = document.createDocumentFragment();
        rowData.items.forEach(src => {
            createImageElement(src, itemsFrag);
        });
        content.appendChild(itemsFrag);

        // Controls
        const controls = document.createElement('div');
        controls.className = 'tier-controls';

        const settingsBtn = document.createElement('button');
        settingsBtn.className = 'tier-control-btn';
        settingsBtn.innerHTML = '⚙️';

        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.style.display = 'none';
        colorInput.onchange = (e) => {
            label.style.backgroundColor = e.target.value;
            saveState();
        };

        settingsBtn.onclick = () => colorInput.click();

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'tier-control-btn';
        deleteBtn.innerHTML = '🗑';
        deleteBtn.onclick = () => {
            const items = content.querySelectorAll('img');
            items.forEach(img => imageBank.appendChild(img));
            row.remove();
            saveState();
        };

        const upBtn = document.createElement('button');
        upBtn.className = 'tier-control-btn';
        upBtn.innerHTML = '▲';
        upBtn.onclick = () => {
            if (row.previousElementSibling) {
                row.parentNode.insertBefore(row, row.previousElementSibling);
                saveState();
            }
        };

        const downBtn = document.createElement('button');
        downBtn.className = 'tier-control-btn';
        downBtn.innerHTML = '▼';
        downBtn.onclick = () => {
            if (row.nextElementSibling) {
                row.parentNode.insertBefore(row.nextElementSibling, row);
                saveState();
            }
        };

        controls.appendChild(settingsBtn);
        controls.appendChild(colorInput);
        controls.appendChild(deleteBtn);
        controls.appendChild(upBtn);
        controls.appendChild(downBtn);

        row.appendChild(label);
        row.appendChild(content);
        row.appendChild(controls);

        tierListContainer.appendChild(row);
    }

    function createImageElement(src, parent) {
        const img = document.createElement('img');
        // Keep the original path for saving; display a small server-side thumbnail
        img.dataset.src = src;
        img.className = 'tier-item';
        img.decoding = 'async';
        const prefix = 'static/images/';
        if (src.startsWith(prefix)) {
            const rel = src.slice(prefix.length).split('/').map(encodeURIComponent).join('/');
            img.src = 'thumb/' + rel;
            img.onerror = () => { img.onerror = null; img.src = src; };
        } else {
            img.src = src;
        }
        img.draggable = true;

        img.addEventListener('dragstart', (e) => {
            draggingEl = img;
            img.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        img.addEventListener('dragend', () => {
            draggingEl = null;
            img.classList.remove('dragging');
            document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
            saveState();
        });

        parent.appendChild(img);
        return img;
    }

    // --- Drag & Drop ---

    function setupDropZone(element) {
        // dragover fires many times per second; do layout work at most once per frame
        let frameQueued = false;
        let lastX = 0, lastY = 0;
        element.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            lastX = e.clientX;
            lastY = e.clientY;
            if (frameQueued) return;
            frameQueued = true;
            requestAnimationFrame(() => {
                frameQueued = false;
                element.classList.add('drag-over');
                const dragging = draggingEl;
                if (!dragging) return;
                const afterElement = getDragAfterElement(element, lastX, lastY);
                if (afterElement) {
                    if (dragging.nextElementSibling !== afterElement) {
                        element.insertBefore(dragging, afterElement);
                    }
                } else if (element.lastElementChild !== dragging) {
                    element.appendChild(dragging);
                }
            });
        });

        element.addEventListener('dragleave', () => {
            element.classList.remove('drag-over');
        });

        element.addEventListener('drop', (e) => {
            e.preventDefault();
            element.classList.remove('drag-over');
            saveState();
        });
    }

    function getDragAfterElement(container, x, y) {
        const draggableElements = container.querySelectorAll(':scope > .tier-item:not(.dragging)');
        return Array.prototype.find.call(draggableElements, child => {
            const box = child.getBoundingClientRect();
            if (y < box.top) return true;
            if (y >= box.top && y <= box.bottom) {
                 if (x < box.left + box.width / 2) return true;
            }
            return false;
        });
    }

    // --- Event Listeners ---

    addRowBtn.addEventListener('click', () => {
        createRowElement({ label: 'NEW', colorClass: 'default-tier', items: [] });
        saveState();
    });

    squareImagesCheck.addEventListener('change', (e) => {
        if (e.target.checked) tierListContainer.classList.add('square-mode');
        else tierListContainer.classList.remove('square-mode');
        saveState();
    });

    hideControlsCheck.addEventListener('change', (e) => {
        if (e.target.checked) tierListContainer.classList.add('hide-options');
        else tierListContainer.classList.remove('hide-options');
        saveState();
    });

    refreshImagesBtn.addEventListener('click', () => {
        loadState(); // Re-fetch from server to find new images
    });

    resetBtn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to reset everything? This will clear all rows, but images will remain in your folder.')) {
            // Delete state.json on server by sending default state
            const defaultState = {
                rows: [
                    { label: "S", colorClass: "s-tier", items: [] },
                    { label: "A", colorClass: "a-tier", items: [] },
                    { label: "B", colorClass: "b-tier", items: [] },
                    { label: "C", "colorClass": "c-tier", "items": [] },
                    { label: "D", "colorClass": "d-tier", "items": [] },
                    { label: "F", "colorClass": "f-tier", "items": [] }
                ],
                bank: [],
                settings: { square: false, hideOptions: false }
            };

            try {
                await fetch('/api/state', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(defaultState)
                });
                loadState();
            } catch (error) {
                console.error("Error resetting state:", error);
            }
        }
    });

    exportBtn.addEventListener('click', () => {
        const wasHidden = tierListContainer.classList.contains('hide-options');
        if (!wasHidden) {
            tierListContainer.classList.add('hide-options');
        }

        window.scrollTo(0, 0);

        html2canvas(document.getElementById('tier-list-container'), {
            backgroundColor: '#000',
            scale: 2,
            logging: false,
            useCORS: true
        }).then(canvas => {
            if (!wasHidden) {
                tierListContainer.classList.remove('hide-options');
            }

            const link = document.createElement('a');
            link.download = 'tier-list.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
        }).catch(err => {
             console.error("Export failed", err);
             alert("Snapshot failed. Check console.");
             if (!wasHidden) tierListContainer.classList.remove('hide-options');
        });
    });

    setupDropZone(imageBank);

    document.getElementById('help-btn').addEventListener('click', () => {
        alert(
            "How to use:\n" +
            "1. Put image files into the 'python_tierapp/static/images' folder.\n" +
            "2. Click 'Refresh Images' if they don't appear automatically.\n" +
            "3. Drag and drop images into tiers.\n" +
            "4. Edit tier names by clicking on them.\n" +
            "5. Right-click tier labels to change colors.\n" +
            "6. Use 'Add Row' to add more tiers.\n" +
            "7. Your progress is saved automatically to the server!"
        );
    });

    // Run
    loadState();
});
