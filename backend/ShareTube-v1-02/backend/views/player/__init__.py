from __future__ import annotations

from .pause import register as register_room_control_pause
from .play import register as register_room_control_play
from .restartvideo import register as register_room_control_restartvideo
from .seek import register as register_room_control_seek
from .skip import register as register_room_control_skip


def register_socket_handlers() -> None:
    register_room_control_pause()
    register_room_control_play()
    register_room_control_restartvideo()
    register_room_control_seek()
    register_room_control_skip()

