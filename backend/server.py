import asyncio
import websockets
import json
import math
import random
import uuid
import os

# Game State
state = {
    "players": {},
    "bullets": [],
    "zombies": []
}
ARENA_SIZE = 800
connected_clients = set()

async def game_loop():
    while True:
        # 1. Move Bullets
        for b in state["bullets"][:]:
            b["x"] += b["vx"]
            b["y"] += b["vy"]
            # Remove if off screen
            if not (0 <= b["x"] <= ARENA_SIZE and 0 <= b["y"] <= ARENA_SIZE):
                state["bullets"].remove(b)

        # 2. Move Zombies & Check Collisions
        player_ids = list(state["players"].keys())
        for z in state["zombies"][:]:
            if player_ids:
                # Vector movement: Find nearest player
                nearest_id = min(player_ids, key=lambda pid: math.hypot(state["players"][pid]["x"] - z["x"], state["players"][pid]["y"] - z["y"]))
                p = state["players"][nearest_id]
                angle = math.atan2(p["y"] - z["y"], p["x"] - z["x"])
                z["x"] += math.cos(angle) * z["speed"]
                z["y"] += math.sin(angle) * z["speed"]

            # Circle collision: Check bullets against zombies
            for b in state["bullets"][:]:
                if math.hypot(b["x"] - z["x"], b["y"] - z["y"]) < b["radius"] + z["radius"]:
                    if z in state["zombies"]: state["zombies"].remove(z)
                    if b in state["bullets"]: state["bullets"].remove(b)
                    if b["ownerId"] in state["players"]:
                        state["players"][b["ownerId"]]["score"] += 10
                    break

        # Broadcast state to all connected clients
        if connected_clients:
            message = json.dumps({"type": "state", "data": state})
            websockets.broadcast(connected_clients, message)
        
        await asyncio.sleep(1/30) # 30 FPS tick rate

async def spawner():
    while True:
        if len(state["zombies"]) < 10:
            state["zombies"].append({
                "x": 0 if random.random() < 0.5 else ARENA_SIZE,
                "y": random.uniform(0, ARENA_SIZE),
                "radius": 15,
                "speed": 2
            })
        await asyncio.sleep(3)

async def handler(websocket):
    client_id = str(uuid.uuid4())
    connected_clients.add(websocket)
    
    # Spawn player in the center
    state["players"][client_id] = {
        "x": ARENA_SIZE / 2, "y": ARENA_SIZE / 2,
        "radius": 15, "color": f"hsl({random.randint(0, 360)}, 100%, 50%)", "score": 0
    }
    
    await websocket.send(json.dumps({"type": "init", "id": client_id}))
    
    try:
        async for message in websocket:
            data = json.loads(message)
            if data["type"] == "move":
                p = state["players"][client_id]
                speed = 5
                if data["up"]: p["y"] -= speed
                if data["down"]: p["y"] += speed
                if data["left"]: p["x"] -= speed
                if data["right"]: p["x"] += speed
                # Keep player within arena bounds
                p["x"] = max(0, min(ARENA_SIZE, p["x"]))
                p["y"] = max(0, min(ARENA_SIZE, p["y"]))
            elif data["type"] == "shoot":
                angle = data["angle"]
                p = state["players"][client_id]
                state["bullets"].append({
                    "x": p["x"], "y": p["y"],
                    "vx": math.cos(angle) * 10, "vy": math.sin(angle) * 10,
                    "ownerId": client_id, "radius": 5
                })
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        connected_clients.remove(websocket)
        del state["players"][client_id]

async def main():
    port = int(os.environ.get("PORT", 8000))
    print(f"Starting server on port {port}...")
    asyncio.create_task(game_loop())
    asyncio.create_task(spawner())
    async with websockets.serve(handler, "0.0.0.0", port):
        await asyncio.Future()  # Run forever

if __name__ == "__main__":
    asyncio.run(main())