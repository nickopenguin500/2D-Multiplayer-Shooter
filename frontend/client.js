const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('score');
const loadingOverlay = document.getElementById('loadingOverlay');

const ARENA_SIZE = 800;
canvas.width = ARENA_SIZE;
canvas.height = ARENA_SIZE;

let currentState = { players: {}, bullets: [], zombies: [] };
let myId = null;

// Connect to Python backend (Swap localhost for your Render URL later)
const socket = new WebSocket('ws://localhost:8000');

socket.onopen = () => {
    // Hide the loading screen once the server wakes up and connects!
    loadingOverlay.classList.add('hidden');
};

socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'init') {
        myId = msg.id;
    } else if (msg.type === 'state') {
        currentState = msg.data;
        if (currentState.players[myId]) {
            scoreDisplay.innerText = currentState.players[myId].score;
        }
    }
};

// Track Input
const movement = { up: false, down: false, left: false, right: false };

window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'w') movement.up = true;
    if (e.key.toLowerCase() === 'a') movement.left = true;
    if (e.key.toLowerCase() === 's') movement.down = true;
    if (e.key.toLowerCase() === 'd') movement.right = true;
});

window.addEventListener('keyup', (e) => {
    if (e.key.toLowerCase() === 'w') movement.up = false;
    if (e.key.toLowerCase() === 'a') movement.left = false;
    if (e.key.toLowerCase() === 's') movement.down = false;
    if (e.key.toLowerCase() === 'd') movement.right = false;
});

// Send inputs 30 times a second
setInterval(() => {
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'move', ...movement }));
    }
}, 1000 / 30);

// Handle Shooting
canvas.addEventListener('mousedown', (e) => {
    if (!currentState.players[myId] || socket.readyState !== WebSocket.OPEN) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const player = currentState.players[myId];
    const angle = Math.atan2(mouseY - player.y, mouseX - player.x);
    
    socket.send(JSON.stringify({ type: 'shoot', angle: angle }));
});

// Render Loop
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Zombies (Green)
    ctx.fillStyle = '#2ecc71';
    currentState.zombies.forEach(z => {
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
        ctx.fill();
    });

    // Draw Bullets (Black)
    ctx.fillStyle = '#000';
    currentState.bullets.forEach(b => {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fill();
    });

    // Draw Players
    for (const id in currentState.players) {
        const p = currentState.players[id];
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Outline local player
        if (id === myId) {
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#000';
            ctx.stroke();
        }
    }

    requestAnimationFrame(draw);
}
draw();