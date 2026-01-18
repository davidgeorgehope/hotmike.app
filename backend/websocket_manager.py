from typing import Dict, Set, Optional
from fastapi import WebSocket
import asyncio
import json


class ConnectionManager:
    """Manages WebSocket connections for transcription."""

    def __init__(self):
        # user_id -> set of websocket connections
        self.active_connections: Dict[int, Set[WebSocket]] = {}
        # websocket -> user_id
        self.connection_users: Dict[WebSocket, int] = {}
        # websocket -> session_id
        self.connection_sessions: Dict[WebSocket, str] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, user_id: int, session_id: str) -> None:
        """Accept a new WebSocket connection."""
        await websocket.accept()

        async with self._lock:
            if user_id not in self.active_connections:
                self.active_connections[user_id] = set()
            self.active_connections[user_id].add(websocket)
            self.connection_users[websocket] = user_id
            self.connection_sessions[websocket] = session_id

    async def disconnect(self, websocket: WebSocket) -> None:
        """Remove a WebSocket connection."""
        async with self._lock:
            user_id = self.connection_users.get(websocket)
            if user_id and user_id in self.active_connections:
                self.active_connections[user_id].discard(websocket)
                if not self.active_connections[user_id]:
                    del self.active_connections[user_id]

            self.connection_users.pop(websocket, None)
            self.connection_sessions.pop(websocket, None)

    def get_user_id(self, websocket: WebSocket) -> Optional[int]:
        """Get the user ID for a WebSocket connection."""
        return self.connection_users.get(websocket)

    def get_session_id(self, websocket: WebSocket) -> Optional[str]:
        """Get the session ID for a WebSocket connection."""
        return self.connection_sessions.get(websocket)

    async def send_personal_message(self, message: dict, websocket: WebSocket) -> None:
        """Send a message to a specific WebSocket connection."""
        try:
            await websocket.send_json(message)
        except Exception:
            await self.disconnect(websocket)

    async def broadcast_to_user(self, message: dict, user_id: int) -> None:
        """Broadcast a message to all connections for a user."""
        async with self._lock:
            connections = self.active_connections.get(user_id, set()).copy()

        disconnected = []
        for connection in connections:
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)

        for conn in disconnected:
            await self.disconnect(conn)

    def get_connection_count(self, user_id: Optional[int] = None) -> int:
        """Get the number of active connections."""
        if user_id:
            return len(self.active_connections.get(user_id, set()))
        return sum(len(conns) for conns in self.active_connections.values())


# Singleton instance
manager = ConnectionManager()


def get_connection_manager() -> ConnectionManager:
    """Get the connection manager singleton."""
    return manager
