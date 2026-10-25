// --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ---
let locations = [];
let points = [];
let panoramas = [];
let stats = { views: 0, pointClicks: {} };
let currentLocId = null;
let currentFloor = 1;

const planImg = document.getElementById('planImg');
const mapArea = document.getElementById('mapArea');
const startPoint = document.getElementById('startPoint');
const endPoint = document.getElementById('endPoint');
const locSelect = document.getElementById('locSelect');
const floorSelect = document.getElementById('floorSelect');

// ==========================================
// --- УНИВЕРСАЛЬНОЕ МОДАЛЬНОЕ ОКНО ---
// ==========================================
function openModal(title, inputs, onConfirm) {
    const modal = document.getElementById('customModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalInputs = document.getElementById('modalInputs');
    const confirmBtn = document.getElementById('modalConfirmBtn');

    modalTitle.innerText = title;
    modalInputs.innerHTML = '';

    inputs.forEach(inp => {
        const input = document.createElement('input');
        input.type = inp.type || 'text';
        input.placeholder = inp.placeholder;
        input.value = inp.value || '';
        input.id = inp.id;
        modalInputs.appendChild(input);
    });

    modal.classList.add('active');

    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    newConfirmBtn.onclick = () => {
        const values = {};
        inputs.forEach(inp => {
            values[inp.id] = document.getElementById(inp.id).value;
        });
        closeModal();
        onConfirm(values);
    };
}

function closeModal() {
    document.getElementById('customModal').classList.remove('active');
}

window.onload = function () {
    loadState();

    document.getElementById('imageLoader').addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (!file) return;

        if (!currentLocId) {
            alert('Сначала создайте локацию!');
            return;
        }

        const reader = new FileReader();
        reader.onload = function (event) {
            const img = new Image();
            img.onload = function () {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                const MAX_SIZE = 1000;
                let width = img.width;
                let height = img.height;
                if (width > height && width > MAX_SIZE) {
                    height *= MAX_SIZE / width; width = MAX_SIZE;
                } else if (height > MAX_SIZE) {
                    width *= MAX_SIZE / height; height = MAX_SIZE;
                }

                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);

                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
                planImg.src = compressedBase64;

                const loc = locations.find(l => l.id === currentLocId);
                if (!loc.plans) loc.plans = {};
                loc.plans[currentFloor] = compressedBase64;

                renderPoints();
                saveState();
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });

    mapArea.addEventListener('click', function (e) {
        if (!currentLocId) return;
        if (e.target.classList.contains('point')) return;
        addPoint(e);
    });
};

// --- СОХРАНЕНИЕ ---
function loadState() {
    const saved = localStorage.getItem('fullSpaceMap_pano_arrows');
    if (saved) {
        try {
            const state = JSON.parse(saved);
            locations = state.locations || [];
            points = state.points || [];
            panoramas = state.panoramas || [];
            stats = state.stats || { views: 0, pointClicks: {} };
            currentLocId = state.currentLocId;
        } catch (e) { }
    }
    stats.views++;
    updateStatsUI();
    renderLocations();
    renderPanoramaList();
}

function saveState() {
    try {
        const locsToSave = locations.map(l => ({ id: l.id, name: l.name, floors: l.floors, plans: l.plans }));
        localStorage.setItem('fullSpaceMap_pano_arrows', JSON.stringify({ locations: locsToSave, points, panoramas, stats, currentLocId }));
    } catch (e) { }
}

// --- ЛОКАЦИИ ---
function addLocation() {
    openModal('Новая локация', [
        { id: 'locName', placeholder: 'Название (например: Отель)', type: 'text' },
        { id: 'locFloors', placeholder: 'Количество этажей (1)', type: 'number', value: '1' }
    ], (data) => {
        if (!data.locName) return;
        const floors = parseInt(data.locFloors) || 1;
        const newLoc = { id: 'loc_' + Date.now(), name: data.locName, floors, plans: {} };
        locations.push(newLoc);
        currentLocId = newLoc.id;
        currentFloor = 1;
        renderLocations();
        saveState();
    });
}

function editLocation() {
    if (!currentLocId) return alert('Локация не выбрана!');
    const loc = locations.find(l => l.id === currentLocId);

    openModal('Изменить локацию', [
        { id: 'locName', placeholder: 'Название', type: 'text', value: loc.name },
        { id: 'locFloors', placeholder: 'Количество этажей', type: 'number', value: loc.floors }
    ], (data) => {
        if (!data.locName) return;
        const newFloors = parseInt(data.locFloors) || loc.floors;
        if (newFloors < loc.floors) {
            if (!confirm('Уменьшение этажей удалит данные. Продолжить?')) return;
            points = points.filter(p => p.locId !== currentLocId || p.floor <= newFloors);
            for (let i = newFloors + 1; i <= loc.floors; i++) delete loc.plans[i];
        }
        loc.name = data.locName;
        loc.floors = newFloors;
        if (currentFloor > newFloors) currentFloor = newFloors;
        renderLocations();
        saveState();
    });
}

function deleteLocation() {
    if (!currentLocId) return alert('Локация не выбрана!');
    const loc = locations.find(l => l.id === currentLocId);

    openModal('Удалить локацию?', [
        { id: 'dummy', placeholder: `Удалить "${loc.name}"?`, type: 'text', value: 'Да, удалить' }
    ], () => {
        locations = locations.filter(l => l.id !== currentLocId);
        points = points.filter(p => p.locId !== currentLocId);
        panoramas = panoramas.filter(p => p.locId !== currentLocId);
        currentLocId = locations.length > 0 ? locations[0].id : null;
        currentFloor = 1;
        renderLocations();
        renderPanoramaList();
        saveState();
    });
}

function renderLocations() {
    if (locations.length === 0) {
        locSelect.innerHTML = '<option value="">Создайте локацию</option>';
        floorSelect.innerHTML = '<option value="">-</option>';
        planImg.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
        document.querySelectorAll('.point').forEach(el => el.remove());
        document.getElementById('routeSvg').innerHTML = '';
        return;
    }
    locSelect.innerHTML = '';
    locations.forEach(l => {
        locSelect.innerHTML += `<option value="${l.id}" ${l.id === currentLocId ? 'selected' : ''}>${l.name} (${l.floors} эт.)</option>`;
    });
    const loc = locations.find(l => l.id === currentLocId);
    if (loc) {
        floorSelect.innerHTML = '';
        for (let i = 1; i <= loc.floors; i++) {
            floorSelect.innerHTML += `<option value="${i}" ${i === currentFloor ? 'selected' : ''}>${i} этаж</option>`;
        }
    }
    switchFloorOrLoc();
}

function switchLoc() {
    currentLocId = locSelect.value;
    if (!currentLocId) return;
    currentFloor = 1;
    renderLocations();
    renderPanoramaList();
}

function switchFloor() {
    currentFloor = +floorSelect.value;
    switchFloorOrLoc();
}

function switchFloorOrLoc() {
    if (!currentLocId) return;
    const loc = locations.find(l => l.id === currentLocId);
    if (!loc) return;
    const plan = loc.plans ? loc.plans[currentFloor] : null;
    planImg.src = plan ? plan : "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    document.getElementById('routeSvg').innerHTML = '';
    renderPoints();
    updateDropdowns();
}

// --- ГЕНЕРАЦИЯ ---
function autoGeneratePlan() {
    const imgSrc = planImg.src;
    if (!imgSrc || imgSrc.includes('R0lGODlhAQABAIAAAAAAAP')) {
        return alert('Сначала загрузите картинку плана!');
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.src = imgSrc;

    img.onload = () => {
        canvas.width = 800; canvas.height = 800;
        const cropSize = Math.min(img.width, img.height);
        const startX = (img.width - cropSize) / 2;
        const startY = (img.height - cropSize) / 2;

        ctx.drawImage(img, startX, startY, cropSize, cropSize, 0, 0, 800, 800);
        ctx.filter = 'grayscale(100%) contrast(150%)';
        ctx.drawImage(img, startX, startY, cropSize, cropSize, 0, 0, 800, 800);
        ctx.filter = 'none';

        const newPlan = canvas.toDataURL('image/png');
        planImg.src = newPlan;

        const loc = locations.find(l => l.id === currentLocId);
        if (loc) {
            if (!loc.plans) loc.plans = {};
            loc.plans[currentFloor] = newPlan;
        }

        renderPoints();
        saveState();
        alert('Схема сгенерирована!');
    };
}

// --- ТОЧКИ ---
function addPoint(e) {
    const rect = planImg.getBoundingClientRect();
    if (rect.width === 0) return alert('Загрузите план!');
    const xPercent = ((e.clientX - rect.left) / rect.width) * 100;
    const yPercent = ((e.clientY - rect.top) / rect.height) * 100;

    openModal('Новая точка', [
        { id: 'ptName', placeholder: 'Название (например: Кухня)', type: 'text' },
        { id: 'ptDesc', placeholder: 'Описание', type: 'text' }
    ], (data) => {
        if (!data.ptName) return;
        points.push({
            id: Date.now(),
            locId: currentLocId,
            floor: currentFloor,
            name: data.ptName,
            desc: data.ptDesc || '',
            x: xPercent,
            y: yPercent
        });
        renderPoints();
        updateDropdowns();
        saveState();
    });
}

function renderPoints() {
    document.querySelectorAll('.point').forEach(el => el.remove());
    if (!currentLocId) return;
    points.filter(p => p.locId === currentLocId && p.floor === currentFloor).forEach(p => {
        const el = document.createElement('div');
        el.className = 'point';
        el.style.left = p.x + '%';
        el.style.top = p.y + '%';
        el.onmouseenter = () => {
            const tooltip = document.getElementById('tooltip');
            tooltip.style.display = 'block';
            tooltip.innerText = p.name + ': ' + p.desc;
            tooltip.style.left = p.x + '%';
            tooltip.style.top = p.y + '%';
        };
        el.onmouseleave = () => document.getElementById('tooltip').style.display = 'none';
        el.onclick = (e) => {
            e.stopPropagation();
            if (confirm('Удалить точку?')) {
                points = points.filter(item => item.id !== p.id);
                renderPoints();
                updateDropdowns();
                saveState();
            }
        };
        mapArea.appendChild(el);
    });
}

// --- МАРШРУТ ---
function updateDropdowns() {
    startPoint.innerHTML = '<option value="">Выберите...</option>';
    endPoint.innerHTML = '<option value="">Выберите...</option>';
    if (!currentLocId) return;
    points.filter(p => p.locId === currentLocId && p.floor === currentFloor).forEach(p => {
        startPoint.innerHTML += `<option value="${p.id}">${p.name}</option>`;
        endPoint.innerHTML += `<option value="${p.id}">${p.name}</option>`;
    });
}

function drawRoute() {
    const s = points.find(p => p.id == startPoint.value);
    const e = points.find(p => p.id == endPoint.value);
    if (!s || !e) return alert('Выберите две точки!');

    const rect = planImg.getBoundingClientRect();
    if (rect.width === 0) return alert('Сначала загрузите картинку плана!');

    const img = new Image();
    img.src = planImg.src;

    img.onload = () => {
        const smallCanvas = document.createElement('canvas');
        const scale = 0.5;
        smallCanvas.width = rect.width * scale;
        smallCanvas.height = rect.height * scale;
        const sCtx = smallCanvas.getContext('2d');
        sCtx.drawImage(img, 0, 0, smallCanvas.width, smallCanvas.height);

        const imageData = sCtx.getImageData(0, 0, smallCanvas.width, smallCanvas.height).data;
        const sw = smallCanvas.width;
        const sh = smallCanvas.height;

        const gridSize = 2;
        const cols = Math.ceil(sw / gridSize);
        const rows = Math.ceil(sh / gridSize);

        let rawWalls = Array(rows).fill().map(() => Array(cols).fill(false));
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const px = c * gridSize;
                const py = r * gridSize;
                const i = (py * sw + px) * 4;
                const brightness = (imageData[i] + imageData[i + 1] + imageData[i + 2]) / 3;
                if (brightness < 200) rawWalls[r][c] = true;
            }
        }

        const safeGrid = JSON.parse(JSON.stringify(rawWalls));
        const thickness = 2;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (rawWalls[r][c]) {
                    for (let dr = -thickness; dr <= thickness; dr++) {
                        for (let dc = -thickness; dc <= thickness; dc++) {
                            const nr = r + dr, nc = c + dc;
                            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                                safeGrid[nr][nc] = true;
                            }
                        }
                    }
                }
            }
        }

        const distToWall = Array(rows).fill().map(() => Array(cols).fill(999));
        const queue = [];

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (rawWalls[r][c]) {
                    distToWall[r][c] = 0;
                    queue.push({ r, c });
                }
            }
        }

        const dirs = [{ dr: 1, dc: 0 }, { dr: -1, dc: 0 }, { dr: 0, dc: 1 }, { dr: 0, dc: -1 }];
        while (queue.length > 0) {
            const curr = queue.shift();
            for (const d of dirs) {
                const nr = curr.r + d.dr;
                const nc = curr.c + d.dc;
                if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                    if (distToWall[nr][nc] > distToWall[curr.r][curr.c] + 1) {
                        distToWall[nr][nc] = distToWall[curr.r][curr.c] + 1;
                        queue.push({ r: nr, c: nc });
                    }
                }
            }
        }

        const startCell = { c: Math.round(((s.x / 100) * sw) / gridSize), r: Math.round(((s.y / 100) * sh) / gridSize) };
        const endCell = { c: Math.round(((e.x / 100) * sw) / gridSize), r: Math.round(((e.y / 100) * sh) / gridSize) };

        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (safeGrid[startCell.r + dr] && safeGrid[startCell.r + dr][startCell.c + dc] !== undefined) {
                    safeGrid[startCell.r + dr][startCell.c + dc] = false;
                }
                if (safeGrid[endCell.r + dr] && safeGrid[endCell.r + dr][endCell.c + dc] !== undefined) {
                    safeGrid[endCell.r + dr][endCell.c + dc] = false;
                }
            }
        }

        const openSet = [{ c: startCell.c, r: startCell.r, g: 0, f: 0, parent: null }];
        const closedSet = new Set();
        let endNode = null;

        const getHeuristic = (a, b) => Math.abs(a.c - b.c) + Math.abs(a.r - b.r);

        while (openSet.length > 0) {
            openSet.sort((a, b) => a.f - b.f);
            const current = openSet.shift();

            if (current.c === endCell.c && current.r === endCell.r) {
                endNode = current;
                break;
            }

            closedSet.add(`${current.c},${current.r}`);

            const neighbors = [
                { c: current.c + 1, r: current.r }, { c: current.c - 1, r: current.r },
                { c: current.c, r: current.r + 1 }, { c: current.c, r: current.r - 1 }
            ];

            for (const n of neighbors) {
                if (n.c < 0 || n.c >= cols || n.r < 0 || n.r >= rows) continue;
                if (closedSet.has(`${n.c},${n.r}`)) continue;
                if (safeGrid[n.r][n.c]) continue;

                let penalty = 0;
                if (distToWall[n.r][n.c] < 4) {
                    penalty = (4 - distToWall[n.r][n.c]) * 5;
                }

                const gScore = current.g + 1 + penalty;
                const fScore = gScore + getHeuristic(n, endCell);

                const existing = openSet.find(o => o.c === n.c && o.r === n.r);
                if (existing && gScore >= existing.g) continue;
                if (existing) {
                    existing.g = gScore; existing.f = fScore; existing.parent = current;
                } else {
                    openSet.push({ c: n.c, r: n.r, g: gScore, f: fScore, parent: current });
                }
            }
        }

        const svg = document.getElementById('routeSvg');
        svg.innerHTML = '';

        if (!endNode) return alert('Не удалось найти путь!');

        const pathPoints = [];
        let curr = endNode;
        while (curr) {
            pathPoints.unshift({
                x: (curr.c * gridSize + gridSize / 2) / scale,
                y: (curr.r * gridSize + gridSize / 2) / scale
            });
            curr = curr.parent;
        }

        pathPoints[0] = { x: (s.x / 100) * rect.width, y: (s.y / 100) * rect.height };
        pathPoints.push({ x: (e.x / 100) * rect.width, y: (e.y / 100) * rect.height });

        let d = `M ${pathPoints[0].x} ${pathPoints[0].y}`;
        for (let i = 1; i < pathPoints.length; i++) {
            d += ` L ${pathPoints[i].x} ${pathPoints[i].y}`;
        }

        svg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);

        const pathGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');

        const shadow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        shadow.setAttribute('d', d);
        shadow.setAttribute('stroke', 'rgba(42, 102, 255, 0.3)');
        shadow.setAttribute('stroke-width', '8');
        shadow.setAttribute('fill', 'none');
        shadow.setAttribute('stroke-linecap', 'round');
        shadow.setAttribute('stroke-linejoin', 'round');

        const mainLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        mainLine.setAttribute('d', d);
        mainLine.setAttribute('stroke', '#2A66FF');
        mainLine.setAttribute('stroke-width', '4');
        mainLine.setAttribute('fill', 'none');
        mainLine.setAttribute('stroke-linecap', 'round');
        mainLine.setAttribute('stroke-linejoin', 'round');

        const lastP = pathPoints[pathPoints.length - 1];
        const prevP = pathPoints[pathPoints.length - 2];
        const angle = Math.atan2(lastP.y - prevP.y, lastP.x - prevP.x);
        const arrowSize = 10;

        const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        const p1 = `${lastP.x - arrowSize * Math.cos(angle - Math.PI / 6)},${lastP.y - arrowSize * Math.sin(angle - Math.PI / 6)}`;
        const p2 = `${lastP.x - arrowSize * Math.cos(angle + Math.PI / 6)},${lastP.y - arrowSize * Math.sin(angle + Math.PI / 6)}`;
        arrow.setAttribute('points', `${lastP.x},${lastP.y} ${p1} ${p2}`);
        arrow.setAttribute('fill', '#2A66FF');

        pathGroup.appendChild(shadow);
        pathGroup.appendChild(mainLine);
        pathGroup.appendChild(arrow);

        svg.appendChild(pathGroup);
    };
}

function clearRoute() { document.getElementById('routeSvg').innerHTML = ''; }

// --- ПАНОРАМЫ ---
function uploadPanoramas() {
    const files = document.getElementById('panoLoader').files;
    if (!files.length || !currentLocId) return alert('Выберите файлы!');
    let loadedCount = 0;
    for (let i = 0; i < files.length; i++) {
        const reader = new FileReader();
        reader.onload = (e) => {
            panoramas.push({
                id: 'pano_' + Date.now() + i,
                locId: currentLocId,
                name: 'Панорама ' + (panoramas.length + 1),
                url: e.target.result,
                hotspots: []
            });
            loadedCount++;
            if (loadedCount === files.length) { renderPanoramaList(); saveState(); alert('Загружено!'); }
        };
        reader.readAsDataURL(files[i]);
    }
}

function renderPanoramaList() {
    const list = document.getElementById('panoList');
    if (!list) return;
    list.innerHTML = '';
    const locPanoramas = panoramas.filter(p => p.locId === currentLocId);

    if (locPanoramas.length === 0) {
        list.innerHTML = '<li>Нет панорам.</li>';
        return;
    }

    locPanoramas.forEach((p, index) => {
        const li = document.createElement('li');
        let options = '<option value="">Стрелка: нет</option>';
        locPanoramas.forEach((target) => {
            if (target.id !== p.id) {
                options += `<option value="${target.id}" ${p.hotspots[0] === target.id ? 'selected' : ''}>→ в ${target.name}</option>`;
            }
        });
        li.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:8px;">
                <span>${p.name}</span>
                <select onchange="setPanoHotspot('${p.id}', this.value)" style="font-size:12px; padding:4px; background: rgba(0,0,0,0.2); border: 1px solid var(--glass-border); color: white; border-radius: 4px;">
                    ${options}
                </select>
            </div>
            <button class="secondary" onclick="openPano('${p.id}')" style="padding: 5px;">👁</button>
        `;
        list.appendChild(li);
    });
}

function setPanoHotspot(panoId, targetId) {
    const pano = panoramas.find(p => p.id === panoId);
    if (pano) {
        pano.hotspots = targetId ? [targetId] : [];
        saveState();
    }
}

// --- ПРОСМОТР КВАДРАТНОЙ ПАНОРАМЫ (Pannellum) ---
function openPano(panoId) {
    const pano = panoramas.find(p => p.id === panoId);
    if (!pano) return;

    document.getElementById('panoramaView').style.display = 'block';
    const container = document.getElementById('panoContainer');
    const hotspotContainer = document.getElementById('hotspotContainer');
    
    container.innerHTML = '<div id="pannellum-viewer" style="width:100%; height:100%;"></div>';

    pannellum.viewer('pannellum-viewer', {
        "type": "equirectangular",
        "panorama": pano.url,
        "autoLoad": true,
        "showControls": true,
        "compass": true,
        // Если это 360 панорама, склеенная сервером, даем полный обзор
        "minPitch": -90,
        "maxPitch": 90,
        "hfov": 100
    });

    hotspotContainer.innerHTML = '';
    if (pano.hotspots && pano.hotspots.length > 0) {
        const targetPano = panoramas.find(p => p.id === pano.hotspots[0]);
        if (targetPano) {
            const arrow = document.createElement('div');
            arrow.className = 'hotspot';
            arrow.innerHTML = '→';
            arrow.title = 'Перейти к: ' + targetPano.name;
            arrow.style.left = '50%';
            arrow.style.top = '50%';
            arrow.onclick = () => openPano(targetPano.id);
            hotspotContainer.appendChild(arrow);
        }
    }
}

function closePano() {
    document.getElementById('panoramaView').style.display = 'none';
    document.getElementById('panoContainer').innerHTML = '';
    document.getElementById('hotspotContainer').innerHTML = '';
}

// --- СТАТИСТИКА И КАМЕРА ---
function updateStatsUI() {
    const el = document.getElementById('viewCount');
    if (el) el.innerText = stats.views;
}
function showStats() {
    const box = document.getElementById('statsBox');
    if (box) box.innerText = `Просмотров: ${stats.views}\nТочек: ${points.length}\nПанорам: ${panoramas.length}`;
}

let videoStream = null;
async function startCamera() {
    try {
        videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        document.getElementById('video').srcObject = videoStream;
        document.getElementById('cameraView').style.display = 'block';
    } catch (err) { alert('Нет доступа к камере.'); }
}
function stopCamera() {
    if (videoStream) { videoStream.getTracks().forEach(t => t.stop()); videoStream = null; }
    document.getElementById('cameraView').style.display = 'none';
}

// --- ЛОГИКА КРУГОВОЙ СЪЕМКИ 360 ---
let capturedPhotos = [];
let isCapturing = false;

async function startPanoCapture() {
    if (isCapturing) return;
    if (!currentLocId) return alert('Сначала создайте локацию!');
    
    isCapturing = true;
    capturedPhotos = [];
    const statusDiv = document.getElementById('captureStatus');
    const shutterBtn = document.getElementById('shutterBtn');
    
    statusDiv.style.display = 'block';
    shutterBtn.style.backgroundColor = 'red';
    shutterBtn.innerHTML = 'Стоп';

    const totalShots = 8;
    
    for (let i = 0; i < totalShots; i++) {
        if (!isCapturing) break;

        statusDiv.innerText = `Снимок ${i + 1} из ${totalShots}. Поворачивайтесь...`;
        
        const flash = document.createElement('div');
        flash.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:white;opacity:0.8;z-index:99;transition:opacity 0.2s;';
        document.getElementById('cameraView').appendChild(flash);
        setTimeout(() => flash.remove(), 100);

        const video = document.getElementById('video');
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth; 
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        
        canvas.toBlob((blob) => {
            if (blob) capturedPhotos.push(blob);
        }, 'image/jpeg', 0.9);

        await new Promise(r => setTimeout(r, 2000));
    }

    isCapturing = false;
    statusDiv.style.display = 'none';
    shutterBtn.style.backgroundColor = '';
    shutterBtn.innerHTML = 'Старт<br>360';

    if (capturedPhotos.length >= 2) {
        statusDiv.style.display = 'block';
        statusDiv.innerText = 'Склеиваем панораму на сервере...';
        await uploadAndStitchPano(capturedPhotos);
    }
}

async function uploadAndStitchPano(blobs) {
    const formData = new FormData();
    blobs.forEach((blob, index) => {
        formData.append('photos', blob, `shot_${index}.jpg`);
    });

    try {
        const response = await fetch('/api/stitch', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Ошибка сервера');

        panoramas.push({
            id: 'pano_360_' + Date.now(),
            locId: currentLocId,
            name: 'Панорама 360°',
            url: result.url,
            hotspots: []
        });

        renderPanoramaList();
        saveState();
        alert('Панорама 360° успешно создана!');
        
    } catch (error) {
        console.error(error);
        alert('Ошибка склейки: ' + error.message);
    } finally {
        document.getElementById('captureStatus').style.display = 'none';
    }
}

// --- СКЛЕЙКА ПАНОРАМ ИЗ ФАЙЛОВ (Кнопка в меню) ---
async function stitchPanorama() {
    const files = document.getElementById('panoLoader').files;
    if (!files || files.length < 2) {
        return alert('Выберите минимум 2 фото для склейки.');
    }

    const btn = event.target;
    const originalText = btn.innerText;
    btn.innerText = 'Склеиваю...';
    btn.disabled = true;

    try {
        const formData = new FormData();
        for (const file of files) {
            formData.append('photos', file);
        }

        const response = await fetch('/api/stitch', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Ошибка сервера');

        panoramas.push({
            id: 'pano_stitched_' + Date.now(),
            locId: currentLocId,
            name: 'Склеенная панорама',
            url: result.url,
            hotspots: []
        });

        renderPanoramaList();
        saveState();
        alert('Панорама склеена на сервере!');

    } catch (error) {
        console.error(error);
        alert('Ошибка склейки: ' + error.message);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

// --- ПУБЛИКАЦИЯ КАРТЫ ---
async function publishMap() {
    if (!currentLocId) return alert('Сначала создайте хотя бы одну локацию и добавьте точки!');

    const publishedData = {
        locations: locations.map(l => ({
            id: l.id,
            name: l.name,
            floors: l.floors,
            plans: l.plans
        })),
        points: points,
        panoramas: panoramas.map(p => ({
            id: p.id,
            locId: p.locId,
            name: p.name,
            url: p.url,
            hotspots: p.hotspots || []
        }))
    };

    try {
        const response = await fetch('/api/publish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(publishedData)
        });

        const result = await response.json();

        if (!response.ok) throw new Error(result.error || 'Ошибка сервера');

        const link = `${window.location.origin}/viewer.html?map=${result.mapId}`;

        const linkElement = document.getElementById('publishLink');
        if (linkElement) {
            linkElement.innerHTML = `✅ Карта опубликована! Ссылка: <br><a href="${link}" target="_blank" style="color: #60A5FA;">${link}</a>`;
        }

        alert('Карта опубликована! Теперь ссылка работает на любом устройстве.');
    } catch (e) {
        console.error(e);
        alert('Ошибка публикации: ' + e.message);
    }
}

function copyLink() {
    const linkElement = document.getElementById('publishLink');
    if (!linkElement || !linkElement.querySelector('a')) {
        return alert('Сначала опубликуйте карту (нажмите "Опубликовать карту").');
    }

    const link = linkElement.querySelector('a').href;

    navigator.clipboard.writeText(link).then(() => {
        alert('Ссылка скопирована в буфер обмена!');
    }).catch(err => {
        alert('Не удалось скопировать. Скопируйте вручную: ' + link);
    });
}

// ==========================================
// --- ЭФФЕКТЫ И ЭКСПОРТ ---
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const panels = document.querySelectorAll('.glass-panel');
    panels.forEach(panel => {
        panel.addEventListener('mousemove', (e) => {
            const rect = panel.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            panel.style.setProperty('--mouse-x', `${x}px`);
            panel.style.setProperty('--mouse-y', `${y}px`);
        });
    });

    document.addEventListener('click', function (e) {
        const button = e.target.closest('button, .btn');
        if (!button) return;

        const circle = document.createElement('span');
        const diameter = Math.max(button.clientWidth, button.clientHeight);
        const radius = diameter / 2;

        const rect = button.getBoundingClientRect();

        circle.style.width = circle.style.height = `${diameter}px`;
        circle.style.left = `${e.clientX - rect.left - radius}px`;
        circle.style.top = `${e.clientY - rect.top - radius}px`;
        circle.classList.add('ripple');

        const ripple = button.querySelector('.ripple');
        if (ripple) ripple.remove();

        button.appendChild(circle);

        setTimeout(() => {
            circle.remove();
        }, 600);
    });

    const canvas = document.getElementById('bg-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let width, height;
    let particles = [];
    let mouse = { x: null, y: null, radius: 200 };

    window.addEventListener('mousemove', (e) => {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
    });
    window.addEventListener('mouseleave', () => {
        mouse.x = null;
        mouse.y = null;
    });

    function resize() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    class Particle {
        constructor() {
            this.x = Math.random() * width;
            this.y = Math.random() * height;
            this.vx = (Math.random() - 0.5) * 0.4;
            this.vy = (Math.random() - 0.5) * 0.4;
            this.radius = Math.random() * 3 + 2;
        }
        update() {
            this.x += this.vx;
            this.y += this.vy;

            if (this.x < 0 || this.x > width) this.vx *= -1;
            if (this.y < 0 || this.y > height) this.vy *= -1;

            if (mouse.x != null) {
                let dx = mouse.x - this.x;
                let dy = mouse.y - this.y;
                let distance = Math.sqrt(dx * dx + dy * dy);
                if (distance < mouse.radius) {
                    const forceDirectionX = dx / distance;
                    const forceDirectionY = dy / distance;
                    const force = (mouse.radius - distance) / mouse.radius;
                    this.x -= forceDirectionX * force * 5;
                    this.y -= forceDirectionY * force * 5;
                }
            }
        }
        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(96, 165, 250, 0.9)';
            ctx.shadowBlur = 10;
            ctx.shadowColor = 'rgba(59, 130, 246, 0.8)';
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }

    for (let i = 0; i < 100; i++) {
        particles.push(new Particle());
    }

    function animate() {
        ctx.clearRect(0, 0, width, height);

        particles.forEach(p => {
            p.update();
            p.draw();
        });

        ctx.lineWidth = 1.5;
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 180) {
                    const opacity = 1 - (dist / 180);
                    ctx.strokeStyle = `rgba(96, 165, 250, ${opacity * 0.6})`;
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.stroke();
                }
            }
        }
        requestAnimationFrame(animate);
    }
    animate();
});

// --- ЭКСПОРТ ФУНКЦИЙ ДЛЯ HTML ---
window.addLocation = addLocation;
window.editLocation = editLocation;
window.deleteLocation = deleteLocation;
window.switchLoc = switchLoc;
window.switchFloor = switchFloor;
window.autoGeneratePlan = autoGeneratePlan;
window.uploadPanoramas = uploadPanoramas;
window.setPanoHotspot = setPanoHotspot;
window.openPano = openPano;
window.closePano = closePano;
window.startCamera = startCamera;
window.stopCamera = stopCamera;
window.drawRoute = drawRoute;
window.clearRoute = clearRoute;
window.showStats = showStats;
window.closeModal = closeModal;
window.stitchPanorama = stitchPanorama;
window.publishMap = publishMap;
window.copyLink = copyLink;
window.startPanoCapture = startPanoCapture; // Экспорт новой функции