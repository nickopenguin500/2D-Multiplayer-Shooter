const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('score');
const loadingOverlay = document.getElementById('loadingOverlay');

canvas.width = 800;
canvas.height = 800;

let currentState = { players: {}, bullets: [], zombies: [], trees: [], damage_indicators: [] };
let myId = null;
let serverTime = 0; 
let mouseX = 0, mouseY = 0; 

const WEAPONS = ['pistol', 'ar', 'shotgun', 'sniper'];
const WEAPON_NAMES = ['Pistol', 'AR', 'Shotgun', 'Sniper'];
let currentWeaponIndex = 0; 

let isMouseDown = false;
let lastShotTime = 0;
const FIRE_RATES = { pistol: 300, ar: 100, shotgun: 800, sniper: 1500 };

const socket = new WebSocket('ws://localhost:8000');
socket.onopen = () => { loadingOverlay.classList.add('hidden'); };
socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'init') { myId = msg.id; } 
    else if (msg.type === 'state') {
        currentState = msg.data;
        serverTime = msg.time;
        if (currentState.players[myId]) scoreDisplay.innerText = currentState.players[myId].score;
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

canvas.addEventListener('mousedown', () => isMouseDown = true);
window.addEventListener('mouseup', () => isMouseDown = false); 

// Send inputs to server (Now includes selected weapon!)
setInterval(() => {
    if (socket.readyState === WebSocket.OPEN && currentState.players[myId]) {
        const angle = Math.atan2(mouseY - canvas.height / 2, mouseX - canvas.width / 2);
        socket.send(JSON.stringify({ type: 'move', ...movement, aimAngle: angle, weapon: WEAPONS[currentWeaponIndex] }));
    }
}, 1000 / 30);

// Shooting loop
setInterval(() => {
    if (isMouseDown && socket.readyState === WebSocket.OPEN && currentState.players[myId]) {
        const now = Date.now();
        const currentWeaponType = WEAPONS[currentWeaponIndex];
        if (now - lastShotTime >= FIRE_RATES[currentWeaponType]) {
            const angle = Math.atan2(mouseY - canvas.height / 2, mouseX - canvas.width / 2);
            socket.send(JSON.stringify({ type: 'shoot', angle: angle, weapon: currentWeaponType }));
            lastShotTime = now;
            if (currentWeaponType === 'pistol') isMouseDown = false; 
        }
    }
}, 1000 / 60);

// --- UPDATED DRAW FACE: Now with dynamic weapon rendering ---
function drawFace(x, y, radius, angle, colorMain, colorSecondary, weaponType = null) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Draw Weapon FIRST so it's under the character's body
    if (weaponType) {
        ctx.fillStyle = '#333'; // Default dark grey
        if (weaponType === 'pistol') {
            ctx.fillRect(radius - 5, 2, 12, 6);
        } else if (weaponType === 'ar') {
            ctx.fillRect(radius - 5, 2, 22, 6);
        } else if (weaponType === 'shotgun') {
            ctx.fillStyle = '#111'; // Darker
            ctx.fillRect(radius - 5, 1, 16, 8);
        } else if (weaponType === 'sniper') {
            ctx.fillStyle = '#111';
            ctx.fillRect(radius - 5, 3, 35, 4); 
        }
    }

    // Body
    ctx.fillStyle = colorMain;
    ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill();

    // Eyes
    const eyeRadius = radius * 0.3;
    const eyeOffsetAngle = 0.6; 
    const eyeDistance = radius * 0.6;
    ctx.fillStyle = colorSecondary; 
    ctx.beginPath(); ctx.arc(Math.cos(-eyeOffsetAngle) * eyeDistance, Math.sin(-eyeOffsetAngle) * eyeDistance, eyeRadius, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(Math.cos(eyeOffsetAngle) * eyeDistance, Math.sin(eyeOffsetAngle) * eyeDistance, eyeRadius, 0, Math.PI * 2); ctx.fill();

    // Pupils
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

    // Background & Environment
    ctx.fillStyle = '#4CAF50'; ctx.fillRect(0, 0, 2000, 2000); 
    ctx.strokeStyle = '#388E3C'; ctx.lineWidth = 2;
    for (let i = 0; i <= 2000; i += 100) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 2000); ctx.moveTo(0, i); ctx.lineTo(2000, i); ctx.stroke();
    }
    ctx.strokeStyle = '#FF0000'; ctx.lineWidth = 5; ctx.strokeRect(0, 0, 2000, 2000);

    if (currentState.trees) {
        ctx.fillStyle = '#5D4037';
        currentState.trees.forEach(t => {
            ctx.beginPath(); ctx.arc(t.x, t.y, t.radius, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#2E7D32'; ctx.beginPath(); ctx.arc(t.x, t.y, t.radius * 0.8, 0, Math.PI * 2); ctx.fill();
        });
    }

    ctx.fillStyle = '#000';
    currentState.bullets.forEach(b => {
        ctx.beginPath(); ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2); ctx.fill();
    });

    currentState.zombies.forEach(z => drawFace(z.x, z.y, z.radius, z.angle, '#2ecc71', '#FF3333'));

    for (const id in currentState.players) {
        const p = currentState.players[id];
        let drawColor = p.color;
        let isInvincible = serverTime < p["iframeUntil"];
        if (isInvincible) {
            let flickerAlpha = 0.3 + Math.abs(Math.cos(serverTime * 20)) * 0.7; 
            drawColor = p.color.replace('hsl', 'hsla').replace(')', `, ${flickerAlpha})`);
        }

        // Pass the player's current weapon to draw it!
        drawFace(p.x, p.y, p.radius, p.aimAngle, drawColor, '#FFFFFF', p.currentWeapon);
        
        if (id === myId) {
            ctx.lineWidth = 3; ctx.strokeStyle = '#FFF';
            ctx.beginPath(); ctx.arc(p.x, p.y, p.radius + 2, 0, Math.PI * 2); ctx.stroke();
        }
    }

    // --- DRAW DAMAGE INDICATORS ---
    if (currentState.damage_indicators) {
        ctx.font = 'bold 18px sans-serif';
        currentState.damage_indicators.forEach(d => {
            // Calculate how far along it is in its 0.5s lifespan to drift it upwards
            let lifeTimeLeft = d.expires - serverTime;
            let driftY = d.y - ((0.5 - lifeTimeLeft) * 40); 
            
            ctx.fillStyle = d.color;
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 3;
            
            ctx.strokeText(d.dmg, d.x - 5, driftY);
            ctx.fillText(d.dmg, d.x - 5, driftY);
        });
    }

    ctx.restore(); 

    // --- HUD LAYER ---
    const hudX = 20;
    const hudY = canvas.height - 180; // Shifted up to fit shields

    // 1. Shields Bar (NEW)
    const barWidth = 200;
    const barHeight = 25;
    ctx.fillStyle = '#444'; ctx.fillRect(hudX, hudY, barWidth, barHeight);
    ctx.fillStyle = '#3498db'; // Fortnite Blue
    let shieldPercent = myPlayer.shields / 100;
    ctx.fillRect(hudX, hudY, barWidth * shieldPercent, barHeight);
    ctx.fillStyle = '#FFF'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(`${myPlayer.shields} / 100 SHIELD`, hudX + 10, hudY + 18);

    // 2. Health Bar (Shifted down)
    const healthY = hudY + barHeight + 5;
    ctx.fillStyle = '#444'; ctx.fillRect(hudX, healthY, barWidth, barHeight);
    ctx.fillStyle = '#e74c3c';
    let currentHealthPercent = myPlayer.health / 100;
    ctx.fillRect(hudX, healthY, barWidth * currentHealthPercent, barHeight);
    ctx.fillStyle = '#FFF'; 
    ctx.fillText(`${myPlayer.health} / 100 HP`, hudX + 10, healthY + 18);

    // 3. Weapon Slots
    const slotSize = 40;
    const slotSpacing = 10;
    const itemsY = healthY + barHeight + 15; 

    ctx.lineWidth = 2;
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';

    for (let i = 0; i < 5; i++) {
        let x = hudX + (slotSize + slotSpacing) * i;
        
        if (i === currentWeaponIndex) {
            ctx.fillStyle = 'rgba(255, 215, 0, 0.5)'; 
            ctx.strokeStyle = '#FFD700'; 
        } else {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'; 
            ctx.strokeStyle = '#FFF'; 
        }

        ctx.fillRect(x, itemsY, slotSize, slotSize);
        ctx.strokeRect(x, itemsY, slotSize, slotSize);
        ctx.fillStyle = '#FFF';
        ctx.fillText(i + 1, x + 10, itemsY + 15);
        if (i < WEAPON_NAMES.length) {
            ctx.fillText(WEAPON_NAMES[i], x + slotSize/2, itemsY + slotSize - 5);
        }
    }
    ctx.textAlign = 'left';

    requestAnimationFrame(draw);
}
draw();