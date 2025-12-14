from __future__ import annotations

from .add import register as register_queue_add
from .common import emit_queue_update_for_room
from .continue_next import register as register_queue_continue_next
from .load_debug_list import register as register_queue_load_debug_list
from .move import register as register_queue_move
from .probe import register as register_queue_probe
from .requeue_to_top import register as register_queue_requeue_to_top
from .remove import register as register_queue_remove

__all__ = [
    "emit_queue_update_for_room",
    "register_socket_handlers",
]


def register_socket_handlers() -> None:
    register_queue_add()
    register_queue_remove()
    register_queue_requeue_to_top()
    register_queue_move()
    register_queue_probe()
    register_queue_continue_next()
    register_queue_load_debug_list()

