from __future__ import annotations

from typing import Any, Callable, Iterable, List, Mapping, Optional, Sequence, Tuple, TypeVar, Dict

# Generic types
TRow = TypeVar("TRow")
TRemote = TypeVar("TRemote")


def sync_model_list(
    *,
    session,
    existing_rows: Sequence[TRow],
    remote_items: Sequence[TRemote],
    get_local_id: Callable[[TRow], Any],
    get_remote_id: Callable[[TRemote], Any],
    create_row: Callable[[TRemote], TRow],
    update_row: Optional[Callable[[TRow, TRemote], None]] = None,
    delete_missing: bool = True,
) -> Dict[str, int]:
    """
    Reconcile a scoped set of SQLAlchemy rows with a remote list.

    - Creates rows that don't exist locally
    - Optionally updates existing rows
    - Optionally deletes rows missing from the remote list

    Parameters:
        session: SQLAlchemy session (e.g., db.session)
        existing_rows: Rows in the scope to be reconciled (already filtered)
        remote_items: Incoming remote list to sync from
        get_local_id: Extracts the identity key from a local row
        get_remote_id: Extracts the identity key from a remote item
        create_row: Constructs a new row instance from a remote item
        update_row: Optional in-place updater for existing rows
        delete_missing: When True, delete rows that are not in the remote set

    Returns:
        dict with counts: {created, updated, deleted, total}
    """
    local_by_id: Dict[Any, TRow] = {}
    for row in existing_rows:
        try:
            local_by_id[get_local_id(row)] = row
        except Exception:
            # Skip rows where id cannot be extracted
            pass

    created = 0
    updated = 0
    deleted = 0
    next_ids: List[Any] = []

    # Upsert pass according to remote order
    for remote in remote_items:
        try:
            rid = get_remote_id(remote)
        except Exception:
            # Skip malformed remote item
            continue
        next_ids.append(rid)
        local = local_by_id.get(rid)
        if local is None:
            row = create_row(remote)
            session.add(row)
            created += 1
            # Track newly created row for potential later use
            local_by_id[rid] = row
        else:
            if update_row is not None:
                try:
                    update_row(local, remote)
                    updated += 1
                except Exception:
                    # Ignore update errors to keep sync resilient
                    pass

    if delete_missing:
        remote_id_set = set(next_ids)
        for lid, row in list(local_by_id.items()):
            if lid not in remote_id_set:
                try:
                    session.delete(row)
                    deleted += 1
                except Exception:
                    # Continue on delete errors
                    pass

    # Do not commit here; caller controls transaction boundaries
    return {"created": created, "updated": updated, "deleted": deleted, "total": len(next_ids)}


def emit_list_update(
    *,
    socketio,
    event: str,
    payload: Any,
    room: Optional[str] = None,
    namespace: Optional[str] = None,
) -> None:
    """
    Emit a Socket.IO event carrying a list payload to all listeners or a room.

    Parameters:
        socketio: Flask-SocketIO instance
        event: Event name (e.g., 'presence.update')
        payload: JSON-serializable data to send
        room: Optional room to target emission
        namespace: Optional namespace (defaults to '/')
    """
    kwargs = {}
    if room:
        kwargs["room"] = room
    if namespace:
        kwargs["namespace"] = namespace
    socketio.emit(event, payload, **kwargs)


def sync_and_emit(
    *,
    session,
    socketio,
    existing_rows: Sequence[TRow],
    remote_items: Sequence[TRemote],
    get_local_id: Callable[[TRow], Any],
    get_remote_id: Callable[[TRemote], Any],
    create_row: Callable[[TRemote], TRow],
    update_row: Optional[Callable[[TRow, TRemote], None]] = None,
    delete_missing: bool = True,
    serialize_row: Optional[Callable[[TRow], Any]] = None,
    emit_event: Optional[str] = None,
    emit_room: Optional[str] = None,
    emit_namespace: Optional[str] = None,
) -> Dict[str, int]:
    """
    Convenience wrapper: sync rows, commit, then emit an updated list.
    If serialize_row is provided, it will be used to build the list payload;
    otherwise, IDs are emitted.
    """
    stats = sync_model_list(
        session=session,
        existing_rows=existing_rows,
        remote_items=remote_items,
        get_local_id=get_local_id,
        get_remote_id=get_remote_id,
        create_row=create_row,
        update_row=update_row,
        delete_missing=delete_missing,
    )

    session.commit()

    if emit_event:
        # Reload current rows in caller-provided scope to reflect DB state
        current_rows = existing_rows
        # If the caller passed a list, it may be stale; best effort refresh when possible
        try:
            # Attempt to refresh objects; if they are detached, this is a no-op
            for r in current_rows:
                try:
                    session.refresh(r)
                except Exception:
                    pass
        except Exception:
            pass

        if serialize_row:
            payload = [serialize_row(r) for r in current_rows]
        else:
            payload = [get_local_id(r) for r in current_rows]

        emit_list_update(
            socketio=socketio,
            event=emit_event,
            payload=payload,
            room=emit_room,
            namespace=emit_namespace,
        )

    return stats


