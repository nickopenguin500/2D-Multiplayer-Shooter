const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('score');

const loadingOverlay = document.getElementById('loadingOverlay');
const menuOverlay = document.getElementById('menuOverlay');
const helpModal = document.getElementById('helpModal');
const aboutModal = document.getElementById('aboutModal'); // NEW
const nameInput = document.getElementById('nameInput');
const playBtn = document.getElementById('playBtn');
const lastScoreDisplay = document.getElementById('lastScoreDisplay'); // NEW

canvas.width = 800;
canvas.height = 800;

let currentState = { players: {}, bullets: [], zombies: [], trees: [], damage_indicators: [], items: [], loot_boxes: [] };
let myId = null;
let serverTime = 0; 
let mouseX = 0, mouseY = 0; 
let isDead = true; 

let WEAPONS = ['fists', null, null, null, null];
let WEAPON_RARITIES = ['common', null, null, null, null];
let COUNTS = [0, 0, 0, 0, 0];
let currentWeaponIndex = 0; 

let isDragging = false;
let draggedSlot = -1;

const RARITY_COLORS = {
    common: '#bdc3c7', uncommon: '#2ecc71', rare: '#3498db',       
    epic: '#9b59b6', legendary: '#f1c40f', mythic: '#e74c3c'      
};

const MAX_STACKS = { bandage: 15, medkit: 3, mini: 6, big: 3 };
const FIRE_RATES = { fists: 500, pistol: 300, ar: 100, shotgun: 800, sniper: 1500, bandage: 1000, medkit: 2000, mini: 1000, big: 2000 };

let isMouseDown = false;
let lastShotTime = 0;

const socket = new WebSocket('wss://zombsarena.onrender.com');
socket.onopen = () => { 
    loadingOverlay.classList.add('hidden'); 
    menuOverlay.classList.remove('hidden');
};

function syncInventory() {
    if (socket.readyState === WebSocket.OPEN && !isDead) {
        socket.send(JSON.stringify({ type: 'sync_inv', weapons: WEAPONS, rarities: WEAPON_RARITIES, counts: COUNTS }));
    }
}

playBtn.addEventListener('click', () => {
    let name = nameInput.value.trim();
    if (!/^[a-zA-Z0-9 ]+$/.test(name) && name.length > 0) {
        alert("Please use only standard English letters and numbers.");
        return;
    }
    if (name.length === 0) name = "Player";
    
    WEAPONS = ['fists', null, null, null, null];
    WEAPON_RARITIES = ['common', null, null, null, null];
    COUNTS = [0, 0, 0, 0, 0];
    currentWeaponIndex = 0;
    isDead = false;
    
    socket.send(JSON.stringify({ type: 'spawn', name: name }));
    syncInventory();
    
    // Hide score display and menu when respawning
    lastScoreDisplay.classList.add('hidden');
    menuOverlay.classList.add('hidden');
});

// --- NEW: Modal Listeners ---
document.getElementById('helpBtn').addEventListener('click', () => helpModal.classList.remove('hidden'));
document.getElementById('closeHelpBtn').addEventListener('click', () => helpModal.classList.add('hidden'));

document.getElementById('aboutBtn').addEventListener('click', () => aboutModal.classList.remove('hidden'));
document.getElementById('closeAboutBtn').addEventListener('click', () => aboutModal.classList.add('hidden'));

socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'init') { myId = msg.id; } 
    else if (msg.type === 'state') {
        currentState = msg.data;
        serverTime = msg.time;
        if (currentState.players[myId]) scoreDisplay.innerText = currentState.players[myId].score;
    }
    else if (msg.type === 'dead') {
        isDead = true;
        // --- NEW: Update Score UI ---
        lastScoreDisplay.innerText = `Final Score: ${msg.score}`;
        lastScoreDisplay.classList.remove('hidden');
        menuOverlay.classList.remove('hidden');
    }
    else if (msg.type === 'pickup' && !isDead) {
        let type = msg.weapon;
        let count = msg.count || 1;
        let rarity = msg.rarity;
        let originalCount = count; 

        if (MAX_STACKS[type]) {
            for (let i = 1; i < 5; i++) {
                if (WEAPONS[i] === type && COUNTS[i] < MAX_STACKS[type]) {
                    let space = MAX_STACKS[type] - COUNTS[i];
                    if (count <= space) {
                        COUNTS[i] += count;
                        count = 0;
                        break;
                    } else {
                        COUNTS[i] = MAX_STACKS[type];
                        count -= space;
                    }
                }
            }
        }

        if (count > 0) {
            let emptySlot = -1;
            for (let i = 1; i < 5; i++) {
                if (!WEAPONS[i]) { emptySlot = i; break; }
            }

            if (emptySlot !== -1) {
                WEAPONS[emptySlot] = type;
                WEAPON_RARITIES[emptySlot] = rarity;
                COUNTS[emptySlot] = count;
            } else {
                let partiallyAbsorbed = (count !== originalCount);
                if (currentWeaponIndex !== 0 && !partiallyAbsorbed) {
                    let slotToReplace = currentWeaponIndex;
                    socket.send(JSON.stringify({ 
                        type: 'drop', 
                        weapon: WEAPONS[slotToReplace], 
                        rarity: WEAPON_RARITIES[slotToReplace], 
                        count: COUNTS[slotToReplace] 
                    }));

                    WEAPONS[slotToReplace] = type;
                    WEAPON_RARITIES[slotToReplace] = rarity;
                    COUNTS[slotToReplace] = count;
                } else {
                    socket.send(JSON.stringify({ 
                        type: 'drop', 
                        weapon: type, 
                        rarity: rarity, 
                        count: count 
                    }));
                }
            }
        }
        syncInventory(); 
    }
};

const movement = { up: false, down: false, left: false, right: false };
window.addEventListener('keydown', (e) => {
    if (isDead) return;
    const k = e.key.toLowerCase();
    if (k === 'w') movement.up = true; if (k === 'a') movement.left = true;
    if (k === 's') movement.down = true; if (k === 'd') movement.right = true;
    
    if (k === '1') currentWeaponIndex = 0; if (k === '2') currentWeaponIndex = 1;
    if (k === '3') currentWeaponIndex = 2; if (k === '4') currentWeaponIndex = 3;
    if (k === '5') currentWeaponIndex = 4;

    if (k === 'e' && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'interact' }));
    }
});
window.addEventListener('keyup', (e) => {
    if (isDead) return;
    const k = e.key.toLowerCase();
    if (k === 'w') movement.up = false; if (k === 'a') movement.left = false;
    if (k === 's') movement.down = false; if (k === 'd') movement.right = false;
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left; mouseY = e.clientY - rect.top;
});

canvas.addEventListener('mousedown', () => {
    if (isDead) return;
    const hudX = 20; const hudY = canvas.height - 180;
    const itemsY = hudY + 25 + 5 + 25 + 15; 
    const slotSize = 50; const slotSpacing = 10; 

    let clickedSlot = -1;
    for (let i = 1; i < 5; i++) { 
        let x = hudX + (slotSize + slotSpacing) * i;
        if (mouseX >= x && mouseX <= x + slotSize && mouseY >= itemsY && mouseY <= itemsY + slotSize) {
            clickedSlot = i; break;
        }
    }

    if (clickedSlot !== -1 && WEAPONS[clickedSlot]) {
        isDragging = true; draggedSlot = clickedSlot;
    } else {
        isMouseDown = true; 
    }
});

window.addEventListener('mouseup', () => {
    if (isDead) { isMouseDown = false; return; }
    if (isDragging) {
        const hudX = 20; const itemsY = canvas.height - 180 + 25 + 5 + 25 + 15;
        const slotSize = 50; const slotSpacing = 10; 

        let droppedOnSlot = -1;
        for (let i = 1; i < 5; i++) {
            let x = hudX + (slotSize + slotSpacing) * i;
            if (mouseX >= x && mouseX <= x + slotSize && mouseY >= itemsY && mouseY <= itemsY + slotSize) {
                droppedOnSlot = i; break;
            }
        }

        if (droppedOnSlot !== -1) {
            let tempW = WEAPONS[droppedOnSlot]; let tempR = WEAPON_RARITIES[droppedOnSlot]; let tempC = COUNTS[droppedOnSlot];
            WEAPONS[droppedOnSlot] = WEAPONS[draggedSlot]; WEAPON_RARITIES[droppedOnSlot] = WEAPON_RARITIES[draggedSlot]; COUNTS[droppedOnSlot] = COUNTS[draggedSlot];
            WEAPONS[draggedSlot] = tempW; WEAPON_RARITIES[draggedSlot] = tempR; COUNTS[draggedSlot] = tempC;
            
            if (currentWeaponIndex === draggedSlot) currentWeaponIndex = droppedOnSlot;
            else if (currentWeaponIndex === droppedOnSlot) currentWeaponIndex = draggedSlot;
            
        } else {
            const inventoryWidth = (slotSize + slotSpacing) * 5;
            if (mouseX > hudX + inventoryWidth || mouseY < itemsY || mouseY > itemsY + slotSize) {
                socket.send(JSON.stringify({ type: 'drop', weapon: WEAPONS[draggedSlot], rarity: WEAPON_RARITIES[draggedSlot], count: COUNTS[draggedSlot] }));
                WEAPONS[draggedSlot] = null; WEAPON_RARITIES[draggedSlot] = null; COUNTS[draggedSlot] = 0;
                if (currentWeaponIndex === draggedSlot) currentWeaponIndex = 0; 
            }
        }
        isDragging = false; draggedSlot = -1;
        syncInventory(); 
    }
    isMouseDown = false;
}); 

setInterval(() => {
    if (!isDead && socket.readyState === WebSocket.OPEN && currentState.players[myId]) {
        const angle = Math.atan2(mouseY - canvas.height / 2, mouseX - canvas.width / 2);
        socket.send(JSON.stringify({ type: 'move', ...movement, aimAngle: angle, weapon: WEAPONS[currentWeaponIndex] }));
    }
}, 1000 / 30);

setInterval(() => {
    if (!isDead && isMouseDown && socket.readyState === WebSocket.OPEN && currentState.players[myId]) {
        const now = Date.now();
        const currentWeaponType = WEAPONS[currentWeaponIndex];
        
        if (!currentWeaponType || currentWeaponType === 'fists') return;

        if (now - lastShotTime >= FIRE_RATES[currentWeaponType]) {
            let canUse = false;
            let myStats = currentState.players[myId];

            if (currentWeaponType === 'bandage') { if (myStats.health < 75) canUse = true; }
            else if (currentWeaponType === 'medkit') { if (myStats.health < 100) canUse = true; }
            else if (currentWeaponType === 'mini') { if (myStats.shields < 50) canUse = true; }
            else if (currentWeaponType === 'big') { if (myStats.shields < 100) canUse = true; }
            else { canUse = true; } 

            if (canUse) {
                const angle = Math.atan2(mouseY - canvas.height / 2, mouseX - canvas.width / 2);
                socket.send(JSON.stringify({ type: 'shoot', angle: angle, weapon: currentWeaponType, rarity: WEAPON_RARITIES[currentWeaponIndex] }));
                lastShotTime = now;
                
                if (MAX_STACKS[currentWeaponType] || currentWeaponType === 'pistol') isMouseDown = false; 

                if (MAX_STACKS[currentWeaponType]) {
                    COUNTS[currentWeaponIndex]--;
                    if (COUNTS[currentWeaponIndex] <= 0) {
                        WEAPONS[currentWeaponIndex] = null;
                        WEAPON_RARITIES[currentWeaponIndex] = null;
                        currentWeaponIndex = 0;
                    }
                    syncInventory();
                }
            }
        }
    }
}, 1000 / 60);

function getWeaponName(w) {
    if (!w) return "";
    if (w === 'ar') return 'AR';
    return w.charAt(0).toUpperCase() + w.slice(1);
}

function drawLootBox(box) {
    ctx.save(); ctx.translate(box.x, box.y);
    ctx.fillStyle = box.type === 'chest' ? '#d4af37' : '#8b4513';
    ctx.fillRect(-box.radius, -box.radius, box.radius*2, box.radius*2);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.strokeRect(-box.radius, -box.radius, box.radius*2, box.radius*2);
    ctx.beginPath(); ctx.moveTo(-box.radius, -box.radius); ctx.lineTo(box.radius, box.radius);
    ctx.moveTo(box.radius, -box.radius); ctx.lineTo(-box.radius, box.radius); ctx.stroke();

    if (!isDead && currentState.players[myId]) {
        const dist = Math.hypot(currentState.players[myId].x - box.x, currentState.players[myId].y - box.y);
        if (dist < 60) {
            ctx.fillStyle = 'white'; ctx.font = 'bold 14px Arial'; ctx.textAlign = 'center';
            ctx.fillText('[E] OPEN', 0, -box.radius - 10);
        }
    }
    ctx.restore();
}

function drawWeaponIcon(ctx, type) {
    if (type === 'fists') {
        ctx.fillStyle = '#f1c40f'; ctx.beginPath(); ctx.arc(-6, 0, 5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(6, 0, 5, 0, Math.PI * 2); ctx.fill();
    } else if (type === 'pistol') {
        ctx.fillStyle = '#95a5a6'; ctx.fillRect(-6, -4, 14, 4); ctx.fillStyle = '#2c3e50'; ctx.fillRect(-6, 0, 5, 6);   
    } else if (type === 'ar') {
        ctx.fillStyle = '#34495e'; ctx.fillRect(-12, -3, 24, 5); ctx.fillStyle = '#7f8c8d'; ctx.fillRect(-16, -2, 4, 6);  
        ctx.fillStyle = '#111'; ctx.fillRect(-2, 2, 5, 8);       
    } else if (type === 'shotgun') {
        ctx.fillStyle = '#8b4513'; ctx.fillRect(-14, -3, 10, 6); ctx.fillStyle = '#7f8c8d'; ctx.fillRect(-4, -2, 16, 4);  
        ctx.fillStyle = '#2c3e50'; ctx.fillRect(2, -4, 8, 8);    
    } else if (type === 'sniper') {
        ctx.fillStyle = '#27ae60'; ctx.fillRect(-15, -3, 20, 6); ctx.fillStyle = '#111'; ctx.fillRect(5, -1, 18, 3);      
        ctx.fillStyle = '#000'; ctx.fillRect(-5, -7, 12, 4);     
    } else if (type === 'bandage') {
        ctx.fillStyle = '#ecf0f1'; ctx.fillRect(-8, -6, 16, 12);
        ctx.fillStyle = '#e74c3c'; ctx.fillRect(-2, -4, 4, 8); ctx.fillRect(-4, -2, 8, 4);
    } else if (type === 'medkit') {
        ctx.fillStyle = '#c0392b'; ctx.fillRect(-10, -8, 20, 16);
        ctx.fillStyle = '#ecf0f1'; ctx.fillRect(-3, -5, 6, 10); ctx.fillRect(-5, -3, 10, 6);
    } else if (type === 'mini') {
        ctx.fillStyle = '#3498db'; ctx.beginPath(); ctx.arc(0, 2, 6, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#95a5a6'; ctx.fillRect(-3, -6, 6, 4);
    } else if (type === 'big') {
        ctx.fillStyle = '#2980b9'; ctx.beginPath(); ctx.arc(0, 2, 10, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#95a5a6'; ctx.fillRect(-4, -8, 8, 6);
    }
}

function drawItem(x, y, type, rarity, count) {
    ctx.save(); ctx.translate(x, y);
    let glowColor = RARITY_COLORS[rarity] || '#FFF';
    ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.globalAlpha = 0.2; ctx.fillStyle = glowColor; ctx.fill();
    ctx.globalAlpha = 1.0; ctx.strokeStyle = glowColor; ctx.lineWidth = 2; ctx.stroke();
    
    drawWeaponIcon(ctx, type); 
    
    if (count > 1) {
        ctx.fillStyle = '#FFF'; ctx.textAlign = 'center'; ctx.font = 'bold 12px sans-serif';
        ctx.fillText('x' + count, 0, 30);
    }
    
    ctx.restore();
}

function drawFace(x, y, radius, angle, colorMain, colorSecondary, weaponType = null) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    
    if (weaponType && weaponType !== 'fists' && !MAX_STACKS[weaponType]) {
        if (weaponType === 'pistol') { ctx.fillStyle = '#95a5a6'; ctx.fillRect(radius - 5, 2, 14, 4); } 
        else if (weaponType === 'ar') { ctx.fillStyle = '#34495e'; ctx.fillRect(radius - 5, 2, 24, 5); } 
        else if (weaponType === 'shotgun') { ctx.fillStyle = '#8b4513'; ctx.fillRect(radius - 5, 1, 10, 6); ctx.fillStyle = '#7f8c8d'; ctx.fillRect(radius + 5, 2, 16, 4); } 
        else if (weaponType === 'sniper') { ctx.fillStyle = '#27ae60'; ctx.fillRect(radius - 5, 2, 20, 6); ctx.fillStyle = '#111'; ctx.fillRect(radius + 15, 3, 18, 3); }
    }
    
    ctx.fillStyle = colorMain; ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill();
    
    if (weaponType === 'fists' || MAX_STACKS[weaponType]) {
        if (MAX_STACKS[weaponType]) {
            if (weaponType === 'bandage') {
                ctx.fillStyle = '#ecf0f1'; ctx.fillRect(radius, -6, 12, 12);
                ctx.fillStyle = '#e74c3c'; ctx.fillRect(radius + 4, -4, 4, 8); ctx.fillRect(radius + 2, -2, 8, 4);
            } else if (weaponType === 'medkit') {
                ctx.fillStyle = '#c0392b'; ctx.fillRect(radius - 2, -8, 16, 16);
                ctx.fillStyle = '#ecf0f1'; ctx.fillRect(radius + 3, -5, 6, 10); ctx.fillRect(radius + 1, -3, 10, 6);
            } else if (weaponType === 'mini') {
                ctx.fillStyle = '#3498db'; ctx.beginPath(); ctx.arc(radius + 6, 0, 6, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = '#95a5a6'; ctx.fillRect(radius + 3, -6, 6, 4);
            } else if (weaponType === 'big') {
                ctx.fillStyle = '#2980b9'; ctx.beginPath(); ctx.arc(radius + 8, 0, 8, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = '#95a5a6'; ctx.fillRect(radius + 4, -8, 8, 6);
            }
        }

        ctx.fillStyle = colorMain;
        ctx.beginPath(); ctx.arc(radius * 0.6, -radius * 0.8, radius * 0.4, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
        ctx.beginPath(); ctx.arc(radius * 0.6, radius * 0.8, radius * 0.4, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
    }
    const eyeRadius = radius * 0.3; const eyeOffsetAngle = 0.6; const eyeDistance = radius * 0.6;
    ctx.fillStyle = colorSecondary; 
    ctx.beginPath(); ctx.arc(Math.cos(-eyeOffsetAngle) * eyeDistance, Math.sin(-eyeOffsetAngle) * eyeDistance, eyeRadius, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(Math.cos(eyeOffsetAngle) * eyeDistance, Math.sin(eyeOffsetAngle) * eyeDistance, eyeRadius, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(Math.cos(-eyeOffsetAngle) * eyeDistance + radius*0.1, Math.sin(-eyeOffsetAngle) * eyeDistance, eyeRadius*0.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(Math.cos(eyeOffsetAngle) * eyeDistance + radius*0.1, Math.sin(eyeOffsetAngle) * eyeDistance, eyeRadius*0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore(); 
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    let camX = canvas.width / 2; let camY = canvas.height / 2;
    if (!isDead && currentState.players[myId]) {
        camX = canvas.width / 2 - currentState.players[myId].x;
        camY = canvas.height / 2 - currentState.players[myId].y;
    }

    ctx.save(); ctx.translate(camX, camY);

    ctx.fillStyle = '#4CAF50'; ctx.fillRect(0, 0, 2000, 2000); 
    ctx.strokeStyle = '#388E3C'; ctx.lineWidth = 2;
    for (let i = 0; i <= 2000; i += 100) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 2000); ctx.moveTo(0, i); ctx.lineTo(2000, i); ctx.stroke();
    }
    ctx.strokeStyle = '#FF0000'; ctx.lineWidth = 5; ctx.strokeRect(0, 0, 2000, 2000);

    if (currentState.loot_boxes) currentState.loot_boxes.forEach(box => drawLootBox(box));

    if (currentState.items) {
        currentState.items.forEach(item => {
            drawItem(item.x, item.y, item.type, item.rarity, item.count);
            if (!isDead && currentState.players[myId]) {
                const dist = Math.hypot(currentState.players[myId].x - item.x, currentState.players[myId].y - item.y);
                if (dist < 50) {
                    ctx.fillStyle = 'white'; ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center';
                    ctx.fillText('[E] PICKUP', item.x, item.y - 25);
                }
            }
        });
    }
    
    if (currentState.trees) {
        ctx.fillStyle = '#5D4037';
        currentState.trees.forEach(t => {
            ctx.beginPath(); ctx.arc(t.x, t.y, t.radius, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#2E7D32'; ctx.beginPath(); ctx.arc(t.x, t.y, t.radius * 0.8, 0, Math.PI * 2); ctx.fill();
        });
    }

    ctx.fillStyle = '#000';
    currentState.bullets.forEach(b => { ctx.beginPath(); ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2); ctx.fill(); });
    currentState.zombies.forEach(z => drawFace(z.x, z.y, z.radius, z.angle, z.color || '#2ecc71', '#FF3333'));

    for (const id in currentState.players) {
        const p = currentState.players[id];
        let drawColor = p.color;
        let isInvincible = serverTime < p["iframeUntil"];
        if (isInvincible) {
            let flickerAlpha = 0.3 + Math.abs(Math.cos(serverTime * 20)) * 0.7; 
            drawColor = p.color.replace('hsl', 'hsla').replace(')', `, ${flickerAlpha})`);
        }
        drawFace(p.x, p.y, p.radius, p.aimAngle, drawColor, '#FFFFFF', p.currentWeapon);
        
        if (id === myId) {
            ctx.lineWidth = 3; ctx.strokeStyle = '#FFF';
            ctx.beginPath(); ctx.arc(p.x, p.y, p.radius + 2, 0, Math.PI * 2); ctx.stroke();
        }

        if (p.name) {
            ctx.fillStyle = '#FFF'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
            ctx.shadowColor = "black"; ctx.shadowBlur = 4; ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 1;
            ctx.fillText(p.name, p.x, p.y - p.radius - 15);
            ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
        }
    }

    if (currentState.damage_indicators) {
        ctx.font = 'bold 18px sans-serif';
        currentState.damage_indicators.forEach(d => {
            let lifeTimeLeft = d.expires - serverTime;
            let driftY = d.y - ((0.5 - lifeTimeLeft) * 40); 
            ctx.fillStyle = d.color; ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
            ctx.strokeText(Math.round(d.dmg), d.x - 5, driftY); ctx.fillText(Math.round(d.dmg), d.x - 5, driftY);
        });
    }

    ctx.restore(); 

    if (!isDead && currentState.players[myId]) {
        const myPlayer = currentState.players[myId];
        const hudX = 20; const hudY = canvas.height - 180; 
        const barWidth = 200; const barHeight = 25;
        
        ctx.fillStyle = '#444'; ctx.fillRect(hudX, hudY, barWidth, barHeight);
        ctx.fillStyle = '#3498db'; ctx.fillRect(hudX, hudY, barWidth * (myPlayer.shields/100), barHeight);
        ctx.fillStyle = '#FFF'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(`${Math.round(myPlayer.shields)} / 100 SHIELD`, hudX + 10, hudY + 18);

        const healthY = hudY + barHeight + 5;
        ctx.fillStyle = '#444'; ctx.fillRect(hudX, healthY, barWidth, barHeight);
        ctx.fillStyle = '#e74c3c'; ctx.fillRect(hudX, healthY, barWidth * (myPlayer.health/100), barHeight);
        ctx.fillStyle = '#FFF'; ctx.fillText(`${Math.round(myPlayer.health)} / 100 HP`, hudX + 10, healthY + 18);

        const slotSize = 50; const slotSpacing = 10; const itemsY = healthY + barHeight + 15; 
        ctx.font = 'bold 10px sans-serif';

        for (let i = 0; i < 5; i++) {
            let x = hudX + (slotSize + slotSpacing) * i;
            let slotWeapon = WEAPONS[i]; let slotRarity = WEAPON_RARITIES[i];
            let baseColor = (slotWeapon && slotWeapon !== 'fists') ? RARITY_COLORS[slotRarity] : '#FFF';
            
            if (i === currentWeaponIndex) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'; ctx.strokeStyle = baseColor; ctx.lineWidth = 4;
            } else {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'; ctx.strokeStyle = baseColor; ctx.lineWidth = 2;
            }

            ctx.fillRect(x, itemsY, slotSize, slotSize); ctx.strokeRect(x, itemsY, slotSize, slotSize);

            if (slotWeapon && !(isDragging && draggedSlot === i)) {
                ctx.save(); 
                ctx.translate(x + slotSize / 2, itemsY + slotSize / 2 - 2);
                drawWeaponIcon(ctx, slotWeapon); 
                ctx.restore();
            }

            ctx.fillStyle = '#FFF'; ctx.textAlign = 'left'; ctx.fillText(i + 1, x + 4, itemsY + 14);
            
            if (COUNTS[i] > 1 || MAX_STACKS[slotWeapon]) {
                ctx.textAlign = 'right'; ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = '#FFF';
                ctx.fillText('x' + COUNTS[i], x + slotSize - 4, itemsY + 14);
            }

            ctx.textAlign = 'center'; ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#FFF';
            ctx.fillText(getWeaponName(slotWeapon), x + slotSize/2, itemsY + slotSize - 4);
        }
        
        if (isDragging && draggedSlot !== -1 && WEAPONS[draggedSlot]) {
            ctx.save(); ctx.translate(mouseX, mouseY); ctx.globalAlpha = 0.8;
            drawWeaponIcon(ctx, WEAPONS[draggedSlot]); ctx.restore();
        }
        ctx.textAlign = 'left';
    }

    requestAnimationFrame(draw);
}
draw();