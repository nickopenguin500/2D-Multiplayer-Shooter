const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('score');
const loadingOverlay = document.getElementById('loadingOverlay');

canvas.width = 800;
canvas.height = 800;

let currentState = { players: {}, bullets: [], zombies: [], trees: [] };
let myId = null;
let serverTime = 0; // Track server time for i-frame visuals
let mouseX = 0, mouseY = 0; // Track mouse globally for aiming angle

const socket = new WebSocket('ws://localhost:8000');

socket.onopen = () => { loadingOverlay.classList.add('hidden'); };

socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'init') {
        myId = msg.id;
    } else if (msg.type === 'state') {
        currentState = msg.data;
        serverTime = msg.time;
        if (currentState.players[myId]) {
            scoreDisplay.innerText = currentState.players[myId].score;
        }
    }
};

const movement = { up: false, down: false, left: false, right: false };
window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'w') movement.up = true; if (k === 'a') movement.left = true;
    if (k === 's') movement.down = true; if (k === 'd') movement.right = true;
});
window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'w') movement.up = false; if (k === 'a') movement.left = false;
    if (k === 's') movement.down = false; if (k === 'd') movement.right = false;
});

// Track mouse for angle
canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
});

// Send inputs + aim angle
setInterval(() => {
    if (socket.readyState === WebSocket.OPEN && currentState.players[myId]) {
        // Calculate aiming angle locally to send to server
        const screenCenterX = canvas.width / 2;
        const screenCenterY = canvas.height / 2;
        const angle = Math.atan2(mouseY - screenCenterY, mouseX - screenCenterX);
        
        socket.send(JSON.stringify({ type: 'move', ...movement, aimAngle: angle }));
    }
}, 1000 / 30);

// Shooting
canvas.addEventListener('mousedown', (e) => {
    if (!currentState.players[myId] || socket.readyState !== WebSocket.OPEN) return;
    const screenCenterX = canvas.width / 2;
    const screenCenterY = canvas.height / 2;
    const angle = Math.atan2(mouseY - screenCenterY, mouseX - screenCenterX);
    socket.send(JSON.stringify({ type: 'shoot', angle: angle }));
});

// --- NEW Drawing Helpers for Faces ---

// Draw eyes that rotate with the entity
function drawFace(x, y, radius, angle, colorMain, colorSecondary) {
    // Save context, move to entity center, and rotate
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Body (for flickering effect, we handle color pass-in)
    ctx.fillStyle = colorMain;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    // Eyes (Two circles shifted 'forward' along the rotated angle)
    const eyeRadius = radius * 0.3;
    const eyeOffsetAngle = 0.6; // angle offset from straight forward
    const eyeDistance = radius * 0.6;

    ctx.fillStyle = colorSecondary; // white part
    // Left eye
    ctx.beginPath();
    ctx.arc(Math.cos(-eyeOffsetAngle) * eyeDistance, Math.sin(-eyeOffsetAngle) * eyeDistance, eyeRadius, 0, Math.PI * 2);
    ctx.fill();
    // Right eye
    ctx.beginPath();
    ctx.arc(Math.cos(eyeOffsetAngle) * eyeDistance, Math.sin(eyeOffsetAngle) * eyeDistance, eyeRadius, 0, Math.PI * 2);
    ctx.fill();

    // Pupills
    ctx.fillStyle = '#000';
    // Left
    ctx.beginPath();
    ctx.arc(Math.cos(-eyeOffsetAngle) * eyeDistance + radius*0.1, Math.sin(-eyeOffsetAngle) * eyeDistance, eyeRadius*0.5, 0, Math.PI * 2);
    ctx.fill();
    // Right
    ctx.beginPath();
    ctx.arc(Math.cos(eyeOffsetAngle) * eyeDistance + radius*0.1, Math.sin(eyeOffsetAngle) * eyeDistance, eyeRadius*0.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore(); // Reset rotation/translation
}

// Render Loop
function draw() {
    // Standard un-transformed clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!currentState.players[myId]) { requestAnimationFrame(draw); return; }
    const myPlayer = currentState.players[myId];

    // --- CAMERA WORLD SAVE ---
    ctx.save();
    ctx.translate(canvas.width / 2 - myPlayer.x, canvas.height / 2 - myPlayer.y);

    // 1. Grassy Background
    ctx.fillStyle = '#4CAF50'; 
    ctx.fillRect(0, 0, 2000, 2000); 

    // Grid lines
    ctx.strokeStyle = '#388E3C'; ctx.lineWidth = 2;
    for (let i = 0; i <= 2000; i += 100) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 2000); ctx.moveTo(0, i); ctx.lineTo(2000, i); ctx.stroke();
    }
    
    // Boundary
    ctx.strokeStyle = '#FF0000'; ctx.lineWidth = 5; ctx.strokeRect(0, 0, 2000, 2000);

    // 2. Trees
    if (currentState.trees) {
        ctx.fillStyle = '#5D4037';
        currentState.trees.forEach(t => {
            ctx.beginPath(); ctx.arc(t.x, t.y, t.radius, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#2E7D32'; ctx.beginPath(); ctx.arc(t.x, t.y, t.radius * 0.8, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#5D4037'; 
        });
    }

    // 3. Bullets
    ctx.fillStyle = '#000';
    currentState.bullets.forEach(b => {
        ctx.beginPath(); ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2); ctx.fill();
    });

    // 4. Zombies (DRAW WITH FACES)
    currentState.zombies.forEach(z => {
        // Zombies are green with red eyes
        drawFace(z.x, z.y, z.radius, z.angle, '#2ecc71', '#FF3333');
    });

    // 5. Players (DRAW WITH FACES & I-FRAMES)
    for (const id in currentState.players) {
        const p = currentState.players[id];
        
        // I-frame Flicker Visual
        let drawColor = p.color;
        let isInvincible = serverTime < p["iframeUntil"];
        
        // Use a cosine wave based on server time to create flickering alpha
        if (isInvincible) {
            let flickerAlpha = 0.3 + Math.abs(Math.cos(serverTime * 20)) * 0.7; // oscillates between 0.3 and 1.0 alpha
            
            // Extract HSL value and modify alpha (p.color is 'hsl(x, 100%, 50%)')
            // This is messy but easy without libraries. Replace 'hsl' with 'hsla'
            drawColor = p.color.replace('hsl', 'hsla').replace(')', `, ${flickerAlpha})`);
        }

        // Draw Player (look toward aimAngle, white eyes)
        drawFace(p.x, p.y, p.radius, p.aimAngle, drawColor, '#FFFFFF');
        
        if (id === myId) {
            ctx.lineWidth = 3; ctx.strokeStyle = '#FFF';
            ctx.beginPath(); ctx.arc(p.x, p.y, p.radius + 2, 0, Math.PI * 2); ctx.stroke();
        }
    }

    // --- CAMERA WORLD RESTORE (Back to fixed screen coordinates) ---
    ctx.restore(); 

    // --- NEW: HUD / UI LAYER (Static in bottom-left) ---
    const hudX = 20;
    const hudY = canvas.height - 100;

    // 1. Health Bar
    const healthBarWidth = 200;
    const healthBarHeight = 25;
    
    // Background (gray)
    ctx.fillStyle = '#444';
    ctx.fillRect(hudX, hudY, healthBarWidth, healthBarHeight);
    
    // Foreground (red based on current health)
    ctx.fillStyle = '#e74c3c';
    let currentHealthPercent = myPlayer.health / 100;
    ctx.fillRect(hudX, hudY, healthBarWidth * currentHealthPercent, healthBarHeight);
    
    // Text outline
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(`${myPlayer.health} / 100 HP`, hudX + 10, hudY + 18);

    // 2. Item Slots (5 empty squares)
    const slotSize = 40;
    const slotSpacing = 10;
    const itemsY = hudY + healthBarHeight + 15;

    ctx.strokeStyle = '#FFF';
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'; // semi-transparent background for slots

    for (let i = 0; i < 5; i++) {
        let x = hudX + (slotSize + slotSpacing) * i;
        ctx.fillRect(x, itemsY, slotSize, slotSize);
        ctx.strokeRect(x, itemsY, slotSize, slotSize);
    }

    requestAnimationFrame(draw);
}
draw();