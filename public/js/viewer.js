let mapData = null;
let currentLocId = null;
let currentFloor = 1;

const planImg = document.getElementById('planImg');
const mapArea = document.getElementById('mapArea');
const startPoint = document.getElementById('startPoint');
const endPoint = document.getElementById('endPoint');
const locSelect = document.getElementById('locSelect');
const floorSelect = document.getElementById('floorSelect');

// Универсальный API запрос
const api = async (u) => {
    const r = await fetch(u);
    if (!r.ok) throw new Error('Ошибка загрузки');
    return r.json();
};

window.onload = async function () {
    const urlParams = new URLSearchParams(window.location.search);
    const mapId = urlParams.get('map');

    if (!mapId) {
        document.body.innerHTML = '<h1 style="color:white; text-align:center; margin-top:50px;">Ошибка: Карта не найдена (нет ID в ссылке)</h1>';
        return;
    }

    try {
        const data = await api('/api/public/maps/' + mapId);
        mapData = data;

        if (data.buildings && data.buildings.length > 0) {
            const mainLoc = {
                id: 'main',
                name: data.title,
                floors: data.floors || 1,
                plans: { 1: data.plan_url }
            };
            for (let i = 2; i <= (data.floors || 1); i++) {
                mainLoc.plans[i] = data.plan_url;
            }

            mapData.locations = [mainLoc];
            mapData.points = (data.points || []).map(p => ({
                ...p,
                locId: 'main',
                floor: p.floor || 1
            }));
            mapData.panoramas = (data.panoramas || []).map(p => ({
                ...p,
                locId: 'main',
                hotspots: []
            }));
        } else {
            throw new Error('На карте нет данных');
        }

        if (mapData.locations.length > 0) {
            currentLocId = mapData.locations[0].id;
        }

        renderLocations();
        renderPanoramaList();

    } catch (e) {
        console.error(e);
        document.body.innerHTML = '<h1 style="color:white; text-align:center; margin-top:50px;">Ошибка: ' + e.message + '</h1>';
    }
};

// --- ЛОКАЦИИ ---
function renderLocations() {
    if (!mapData || !mapData.locations) return;

    if (mapData.locations.length === 0) {
        locSelect.innerHTML = '<option value="">Нет данных</option>';
        return;
    }

    locSelect.innerHTML = '';
    mapData.locations.forEach(l => {
        locSelect.innerHTML += `<option value="${l.id}" ${l.id === currentLocId ? 'selected' : ''}>${l.name}</option>`;
    });

    const loc = mapData.locations.find(l => l.id === currentLocId);
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
    currentFloor = 1;
    renderLocations();
}

function switchFloor() {
    currentFloor = +floorSelect.value;
    switchFloorOrLoc();
}

function switchFloorOrLoc() {
    if (!mapData) return;
    const loc = mapData.locations.find(l => l.id === currentLocId);
    if (!loc) return;

    const plan = loc.plans ? loc.plans[currentFloor] : null;
    planImg.src = plan ? plan : "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

    document.getElementById('routeSvg').innerHTML = '';
    renderPoints();
    updateDropdowns();
}

// --- ТОЧКИ ---
function renderPoints() {
    document.querySelectorAll('.point').forEach(el => el.remove());
    if (!mapData || !currentLocId) return;

    const filteredPoints = mapData.points.filter(p => p.locId === currentLocId && p.floor === currentFloor);

    filteredPoints.forEach(p => {
        const el = document.createElement('div');
        el.className = 'point';
        el.style.left = p.x + '%';
        el.style.top = p.y + '%';

        el.onmouseenter = () => {
            const tooltip = document.getElementById('tooltip');
            tooltip.style.display = 'block';
            tooltip.innerText = p.name + (p.desc ? ': ' + p.desc : '');
            tooltip.style.left = p.x + '%';
            tooltip.style.top = p.y + '%';
        };
        el.onmouseleave = () => document.getElementById('tooltip').style.display = 'none';

        el.onclick = (e) => {
            e.stopPropagation();
            alert(p.name + '\n' + (p.desc || 'Описание отсутствует'));
        };

        mapArea.appendChild(el);
    });
}

// --- МАРШРУТ ---
function updateDropdowns() {
    startPoint.innerHTML = '<option value="">Выберите...</option>';
    endPoint.innerHTML = '<option value="">Выберите...</option>';
    if (!mapData || !currentLocId) return;

    const filteredPoints = mapData.points.filter(p => p.locId === currentLocId && p.floor === currentFloor);

    filteredPoints.forEach(p => {
        startPoint.innerHTML += `<option value="${p.id}">${p.name}</option>`;
        endPoint.innerHTML += `<option value="${p.id}">${p.name}</option>`;
    });
}

function drawRoute() {
    if (!mapData) return;
    const s = mapData.points.find(p => p.id == startPoint.value);
    const e = mapData.points.find(p => p.id == endPoint.value);
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
function renderPanoramaList() {
    const list = document.getElementById('panoList');
    if (!list) return;
    list.innerHTML = '';
    if (!mapData) return;

    const locPanoramas = mapData.panoramas.filter(p => p.locId === currentLocId);

    if (locPanoramas.length === 0) {
        list.innerHTML = '<li>Нет панорам.</li>';
        return;
    }

    locPanoramas.forEach((p) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:8px;">
                <span>Панорама</span>
            </div>
            <button class="secondary" onclick="openPano('${p.id}')" style="padding: 5px;">👁</button>
        `;
        list.appendChild(li);
    });
}

// ============================================================
// === 3D-ПАНОРАМА (исправленная версия) ===
// ============================================================
let renderer, scene, camera, sphere, isDragging = false, prevX = 0, prevY = 0;
let panoRAF = null;

function openPano(panoId) {
    if (!mapData) return;
    const pano = mapData.panoramas.find(p => p.id === panoId);
    if (!pano) return;

    document.getElementById('panoramaView').style.display = 'block';
    const container = document.getElementById('panoContainer');
    const hotspotContainer = document.getElementById('hotspotContainer');

    if (!renderer) {
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(renderer.domElement);

        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
        // ✅ Камера строго в центре сферы
        camera.position.set(0, 0, 0);

        const geo = new THREE.SphereGeometry(500, 64, 64);
        const mat = new THREE.MeshBasicMaterial({ side: THREE.BackSide });
        sphere = new THREE.Mesh(geo, mat);
        scene.add(sphere);

        const start = (e) => {
            isDragging = true;
            const p = e.touches ? e.touches[0] : e;
            prevX = p.clientX; prevY = p.clientY;
        };
        const move = (e) => {
            if (!isDragging) return;
            const p = e.touches ? e.touches[0] : e;
            const dx = p.clientX - prevX;
            const dy = p.clientY - prevY;
            camera.rotation.y -= dx * 0.005;
            camera.rotation.x -= dy * 0.005;
            camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x));
            prevX = p.clientX; prevY = p.clientY;
            if (e.cancelable) e.preventDefault();
        };
        const end = () => { isDragging = false; };

        container.addEventListener('mousedown', start);
        container.addEventListener('mousemove', move);
        container.addEventListener('mouseup', end);
        container.addEventListener('touchstart', start, { passive: true });
        container.addEventListener('touchmove', move, { passive: false });
        container.addEventListener('touchend', end);
        window.addEventListener('mouseup', end);

        const resize = () => {
            const w = container.clientWidth, h = container.clientHeight;
            if (!w || !h) return;
            renderer.setSize(w, h, false);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
        };
        window.addEventListener('resize', resize);
        window.addEventListener('orientationchange', resize);
        requestAnimationFrame(resize);
    }

    const w = container.clientWidth, h = container.clientHeight;
    if (w && h) {
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }

    camera.rotation.set(0, 0, 0);

    // ✅ Загрузка текстуры с колбэком
    const loader = new THREE.TextureLoader();
    loader.load(
        pano.url,
        (tex) => {
            if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
            if (sphere.material.map) sphere.material.map.dispose();
            sphere.material.map = tex;
            sphere.material.needsUpdate = true;
            renderer.render(scene, camera);
        },
        undefined,
        (err) => {
            console.error('Panorama load error:', err);
            alert('Не удалось загрузить панораму: ' + pano.url);
        }
    );

    if (panoRAF) cancelAnimationFrame(panoRAF);
    const animate = () => {
        renderer.render(scene, camera);
        panoRAF = requestAnimationFrame(animate);
    };
    animate();

    hotspotContainer.innerHTML = '';
    if (pano.hotspots && pano.hotspots.length > 0) {
        const targetPano = mapData.panoramas.find(p => p.id === pano.hotspots[0]);
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
    document.getElementById('hotspotContainer').innerHTML = '';
    if (panoRAF) { cancelAnimationFrame(panoRAF); panoRAF = null; }
}

// Экспорт для HTML
window.switchLoc = switchLoc;
window.switchFloor = switchFloor;
window.drawRoute = drawRoute;
window.clearRoute = clearRoute;
window.openPano = openPano;
window.closePano = closePano;