const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('score');
const loadingOverlay = document.getElementById('loadingOverlay');

canvas.width = 800;
canvas.height = 800;

let currentState = { players: {}, bullets: [], zombies: [], trees: [], damage_indicators: [], items: [], loot_boxes: [] };
let myId = null;
let serverTime = 0; 
let mouseX = 0, mouseY = 0; 

let WEAPONS = ['fists', null, null, null, null];
let WEAPON_RARITIES = ['common', null, null, null, null];
let currentWeaponIndex = 0; 

// NEW: Drag and Drop State Variables
let isDragging = false;
let draggedSlot = -1;

const RARITY_COLORS = {
    common: '#bdc3c7',     
    uncommon: '#2ecc71',   
    rare: '#3498db',       
    epic: '#9b59b6',       
    legendary: '#f1c40f',  
    mythic: '#e74c3c'      
};

let isMouseDown = false;
let lastShotTime = 0;
const FIRE_RATES = { fists: 500, pistol: 300, ar: 100, shotgun: 800, sniper: 1500 };

const socket = new WebSocket('ws://localhost:8000');
socket.onopen = () => { loadingOverlay.classList.add('hidden'); };

socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'init') { 
        myId = msg.id; 
    } 
    else if (msg.type === 'state') {
        currentState = msg.data;
        serverTime = msg.time;
        if (currentState.players[myId]) scoreDisplay.innerText = currentState.players[myId].score;
    }
    else if (msg.type === 'pickup') {
        let emptySlot = -1;
        // Search for an empty space
        for (let i = 1; i < 5; i++) {
            if (!WEAPONS[i]) { emptySlot = i; break; }
        }

        if (emptySlot !== -1) {
            // Put it in the empty slot, DON'T switch to it
            WEAPONS[emptySlot] = msg.weapon;
            WEAPON_RARITIES[emptySlot] = msg.rarity;
        } else {
            // Inventory is full, swap out the currently held weapon
            let slotToReplace = currentWeaponIndex;
            if (slotToReplace === 0) slotToReplace = 1; // Can't replace fists

            socket.send(JSON.stringify({ type: 'drop', weapon: WEAPONS[slotToReplace], rarity: WEAPON_RARITIES[slotToReplace] }));
            WEAPONS[slotToReplace] = msg.weapon;
            WEAPON_RARITIES[slotToReplace] = msg.rarity;
        }
    }
};

const movement = { up: false, down: false, left: false, right: false };
window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'w') movement.up = true; if (k === 'a') movement.left = true;
    if (k === 's') movement.down = true; if (k === 'd') movement.right = true;
    
    if (k === '1') currentWeaponIndex = 0;
    if (k === '2') currentWeaponIndex = 1;
    if (k === '3') currentWeaponIndex = 2;
    if (k === '4') currentWeaponIndex = 3;
    if (k === '5') currentWeaponIndex = 4;

    if (k === 'e') {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'interact' }));
    }
});
window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'w') movement.up = false; if (k === 'a') movement.left = false;
    if (k === 's') movement.down = false; if (k === 'd') movement.right = false;
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
});

// NEW: Advanced Mouse Down Logic for Dragging!
canvas.addEventListener('mousedown', () => {
    const hudX = 20;
    const hudY = canvas.height - 180;
    const itemsY = hudY + 25 + 5 + 25 + 15; // Calculated Y position of inventory squares
    const slotSize = 40;
    const slotSpacing = 10;

    let clickedSlot = -1;
    for (let i = 1; i < 5; i++) { // Skip fists (0)
        let x = hudX + (slotSize + slotSpacing) * i;
        if (mouseX >= x && mouseX <= x + slotSize && mouseY >= itemsY && mouseY <= itemsY + slotSize) {
            clickedSlot = i;
            break;
        }
    }

    if (clickedSlot !== -1 && WEAPONS[clickedSlot]) {
        isDragging = true;
        draggedSlot = clickedSlot;
    } else {
        isMouseDown = true; // Just normal shooting
    }
});

// NEW: Advanced Mouse Up Logic for Dropping/Swapping!
window.addEventListener('mouseup', () => {
    if (isDragging) {
        const hudX = 20;
        const itemsY = canvas.height - 180 + 25 + 5 + 25 + 15;
        const slotSize = 40;
        const slotSpacing = 10;

        let droppedOnSlot = -1;
        for (let i = 1; i < 5; i++) {
            let x = hudX + (slotSize + slotSpacing) * i;
            if (mouseX >= x && mouseX <= x + slotSize && mouseY >= itemsY && mouseY <= itemsY + slotSize) {
                droppedOnSlot = i;
                break;
            }
        }

        if (droppedOnSlot !== -1) {
            // Swap slots internally
            let tempW = WEAPONS[droppedOnSlot];
            let tempR = WEAPON_RARITIES[droppedOnSlot];
            WEAPONS[droppedOnSlot] = WEAPONS[draggedSlot];
            WEAPON_RARITIES[droppedOnSlot] = WEAPON_RARITIES[draggedSlot];
            WEAPONS[draggedSlot] = tempW;
            WEAPON_RARITIES[draggedSlot] = tempR;
            
            // If we moved our currently selected weapon, follow it
            if (currentWeaponIndex === draggedSlot) currentWeaponIndex = droppedOnSlot;
            else if (currentWeaponIndex === droppedOnSlot) currentWeaponIndex = draggedSlot;
            
        } else {
            // Check if dropped outside the inventory box
            const inventoryWidth = (slotSize + slotSpacing) * 5;
            if (mouseX > hudX + inventoryWidth || mouseY < itemsY || mouseY > itemsY + slotSize) {
                socket.send(JSON.stringify({ type: 'drop', weapon: WEAPONS[draggedSlot], rarity: WEAPON_RARITIES[draggedSlot] }));
                WEAPONS[draggedSlot] = null;
                WEAPON_RARITIES[draggedSlot] = null;
                if (currentWeaponIndex === draggedSlot) currentWeaponIndex = 0; // Fall back to fists
            }
        }
        isDragging = false;
        draggedSlot = -1;
    }
    isMouseDown = false;
}); 

setInterval(() => {
    if (socket.readyState === WebSocket.OPEN && currentState.players[myId]) {
        const angle = Math.atan2(mouseY - canvas.height / 2, mouseX - canvas.width / 2);
        socket.send(JSON.stringify({ type: 'move', ...movement, aimAngle: angle, weapon: WEAPONS[currentWeaponIndex] }));
    }
}, 1000 / 30);

setInterval(() => {
    if (isMouseDown && socket.readyState === WebSocket.OPEN && currentState.players[myId]) {
        const now = Date.now();
        const currentWeaponType = WEAPONS[currentWeaponIndex];
        
        if (!currentWeaponType || currentWeaponType === 'fists') return;

        if (now - lastShotTime >= FIRE_RATES[currentWeaponType]) {
            const angle = Math.atan2(mouseY - canvas.height / 2, mouseX - canvas.width / 2);
            socket.send(JSON.stringify({ 
                type: 'shoot', 
                angle: angle, 
                weapon: currentWeaponType,
                rarity: WEAPON_RARITIES[currentWeaponIndex]
            }));
            lastShotTime = now;
            if (currentWeaponType === 'pistol') isMouseDown = false; 
        }
    }
}, 1000 / 60);

function getWeaponName(w) {
    if (!w) return "";
    if (w === 'ar') return 'AR';
    return w.charAt(0).toUpperCase() + w.slice(1);
}

function drawLootBox(box) {
    ctx.save();
    ctx.translate(box.x, box.y);
    ctx.fillStyle = box.type === 'chest' ? '#d4af37' : '#8b4513';
    ctx.fillRect(-box.radius, -box.radius, box.radius*2, box.radius*2);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.strokeRect(-box.radius, -box.radius, box.radius*2, box.radius*2);
    ctx.beginPath();
    ctx.moveTo(-box.radius, -box.radius); ctx.lineTo(box.radius, box.radius);
    ctx.moveTo(box.radius, -box.radius); ctx.lineTo(-box.radius, box.radius);
    ctx.stroke();

    if (currentState.players[myId]) {
        const dist = Math.hypot(currentState.players[myId].x - box.x, currentState.players[myId].y - box.y);
        if (dist < 60) {
            ctx.fillStyle = 'white';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('[E] OPEN', 0, -box.radius - 10);
        }
    }
    ctx.restore();
}

function drawWeaponIcon(ctx, type) {
    if (type === 'fists') {
        ctx.fillStyle = '#f1c40f'; 
        ctx.beginPath(); ctx.arc(-6, 0, 5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(6, 0, 5, 0, Math.PI * 2); ctx.fill();
    } else if (type === 'pistol') {
        ctx.fillStyle = '#95a5a6'; ctx.fillRect(-6, -4, 14, 4); 
        ctx.fillStyle = '#2c3e50'; ctx.fillRect(-6, 0, 5, 6);   
    } else if (type === 'ar') {
        ctx.fillStyle = '#34495e'; ctx.fillRect(-12, -3, 24, 5); 
        ctx.fillStyle = '#7f8c8d'; ctx.fillRect(-16, -2, 4, 6);  
        ctx.fillStyle = '#111'; ctx.fillRect(-2, 2, 5, 8);       
    } else if (type === 'shotgun') {
        ctx.fillStyle = '#8b4513'; ctx.fillRect(-14, -3, 10, 6); 
        ctx.fillStyle = '#7f8c8d'; ctx.fillRect(-4, -2, 16, 4);  
        ctx.fillStyle = '#2c3e50'; ctx.fillRect(2, -4, 8, 8);    
    } else if (type === 'sniper') {
        ctx.fillStyle = '#27ae60'; ctx.fillRect(-15, -3, 20, 6); 
        ctx.fillStyle = '#111'; ctx.fillRect(5, -1, 18, 3);      
        ctx.fillStyle = '#000'; ctx.fillRect(-5, -7, 12, 4);     
    }
}

function drawItem(x, y, type, rarity) {
    ctx.save();
    ctx.translate(x, y);
    let glowColor = RARITY_COLORS[rarity] || '#FFF';
    ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.globalAlpha = 0.2; ctx.fillStyle = glowColor; ctx.fill();
    ctx.globalAlpha = 1.0; ctx.strokeStyle = glowColor; ctx.lineWidth = 2; ctx.stroke();
    drawWeaponIcon(ctx, type);
    ctx.restore();
}

function drawFace(x, y, radius, angle, colorMain, colorSecondary, weaponType = null) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    if (weaponType && weaponType !== 'fists') {
        if (weaponType === 'pistol') { ctx.fillStyle = '#95a5a6'; ctx.fillRect(radius - 5, 2, 14, 4); } 
        else if (weaponType === 'ar') { ctx.fillStyle = '#34495e'; ctx.fillRect(radius - 5, 2, 24, 5); } 
        else if (weaponType === 'shotgun') { ctx.fillStyle = '#8b4513'; ctx.fillRect(radius - 5, 1, 10, 6); ctx.fillStyle = '#7f8c8d'; ctx.fillRect(radius + 5, 2, 16, 4); } 
        else if (weaponType === 'sniper') { ctx.fillStyle = '#27ae60'; ctx.fillRect(radius - 5, 2, 20, 6); ctx.fillStyle = '#111'; ctx.fillRect(radius + 15, 3, 18, 3); }
    }

    ctx.fillStyle = colorMain;
    ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill();

    if (weaponType === 'fists') {
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
    if (!currentState.players[myId]) { requestAnimationFrame(draw); return; }
    const myPlayer = currentState.players[myId];

    ctx.save();
    ctx.translate(canvas.width / 2 - myPlayer.x, canvas.height / 2 - myPlayer.y);

    ctx.fillStyle = '#4CAF50'; ctx.fillRect(0, 0, 2000, 2000); 
    ctx.strokeStyle = '#388E3C'; ctx.lineWidth = 2;
    for (let i = 0; i <= 2000; i += 100) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 2000); ctx.moveTo(0, i); ctx.lineTo(2000, i); ctx.stroke();
    }
    ctx.strokeStyle = '#FF0000'; ctx.lineWidth = 5; ctx.strokeRect(0, 0, 2000, 2000);

    if (currentState.loot_boxes) {
        currentState.loot_boxes.forEach(box => drawLootBox(box));
    }

    if (currentState.items) {
        currentState.items.forEach(item => {
            drawItem(item.x, item.y, item.type, item.rarity);
            const dist = Math.hypot(myPlayer.x - item.x, myPlayer.y - item.y);
            if (dist < 50) {
                ctx.fillStyle = 'white'; ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center';
                ctx.fillText('[E] PICKUP', item.x, item.y - 25);
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
    }

    if (currentState.damage_indicators) {
        ctx.font = 'bold 18px sans-serif';
        currentState.damage_indicators.forEach(d => {
            let lifeTimeLeft = d.expires - serverTime;
            let driftY = d.y - ((0.5 - lifeTimeLeft) * 40); 
            ctx.fillStyle = d.color;
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 3;
            ctx.strokeText(Math.round(d.dmg), d.x - 5, driftY);
            ctx.fillText(Math.round(d.dmg), d.x - 5, driftY);
        });
    }

    ctx.restore(); 

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

    const slotSize = 40; const slotSpacing = 10; const itemsY = healthY + barHeight + 15; 
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

        // DO NOT draw the icon in the slot if it is currently being dragged!
        if (slotWeapon && !(isDragging && draggedSlot === i)) {
            ctx.save(); ctx.translate(x + slotSize / 2, itemsY + slotSize / 2 - 5);
            drawWeaponIcon(ctx, slotWeapon); ctx.restore();
        }

        ctx.fillStyle = '#FFF'; ctx.textAlign = 'left'; ctx.fillText(i + 1, x + 5, itemsY + 12);
        ctx.textAlign = 'center'; ctx.fillText(getWeaponName(slotWeapon), x + slotSize/2, itemsY + slotSize - 3);
    }
    
    // NEW: Render the dragged item attached to the mouse!
    if (isDragging && draggedSlot !== -1 && WEAPONS[draggedSlot]) {
        ctx.save();
        ctx.translate(mouseX, mouseY);
        // Add a slight transparency so you know it's being dragged
        ctx.globalAlpha = 0.8;
        drawWeaponIcon(ctx, WEAPONS[draggedSlot]);
        ctx.restore();
    }
    
    ctx.textAlign = 'left';

    requestAnimationFrame(draw);
}
draw();