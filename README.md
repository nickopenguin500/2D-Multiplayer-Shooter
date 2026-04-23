What the project does:
Zombs Arena is a 2D PvPvE shooter game heavily inspired by zombsroyale. There are waves of AI zombies. Players can scavenge the map for weapons and consumables. It uses a backend to store the positions and game info.

How to use it:
wasd: moving your character
mouse: aim
left click: shoot
12345: inventory slots
e: interact (open chests, pick up weapons)
drag and drop: drag slots around in your inventory to either swap slots or drop items

Features I'm most proud of:
1. Entities continue to move even when up against a tree. To do this, the engine calculates the overlap distance and applies an outward normal vector. This allows zombies and players to slide around obstacles rather than get stuck.
2. There is a wide range of items in the game. There are 4 weapon types: pistols, shotguns, ARs, and snipers. There are weapon rarities represented by 6 colors (Gray, Green, Blue, Purple, Gold, Red). Increasing rarity either increases the damage or changes the number of pellets (shotgun).
3. High speed projectiles (sniper bullet) used to be able to pass through small targets without colliding due to passing them between ticks. To fix this, the engine calculates subpositions that the sniper bullet would have passed through and adds them to the list of collisions to check.

How to run it locally:
Ensure you have python 3.x installed
Install the required Websocket library: "pip install websockets"
Start the backend server: "python backend/server.py"
Start the client by opening "frontend/index.html"
Important Note: Change line 42 in "client.js" to "const socket = new WebSocket('ws://localhost:8000');" for testing locally

How secrets are handled:
There are none