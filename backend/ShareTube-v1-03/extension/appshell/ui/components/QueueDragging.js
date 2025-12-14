import state from "../../core/state/state.js";

export class ShareTubeQueueDrag {
    constructor() {
        this.dragState = {
            draggedItemId: null,
            draggedItem: null,
        };
    }

    findQueueItemAtPosition(clientY) {
        const queueItems = document.querySelectorAll(".queue-item");
        for (const item of queueItems) {
            const rect = item.getBoundingClientRect();
            if (clientY >= rect.top && clientY <= rect.bottom) {
                return {
                    element: item,
                    id: item.dataset.id,
                    rect,
                };
            }
        }
        return null;
    }

    onListDragStart(e) {
        const targetItem = this.findQueueItemAtPosition(e.e.clientY);
        if (!targetItem) return;

        this.dragState.draggedItemId = targetItem.id;
        this.dragState.draggedItem = state.queue.find((item) => item.id == targetItem.id);

        targetItem.element.classList.add("dragging");
    }

    onListDragEnd() {
        this.dragState.draggedItemId = null;
        this.dragState.draggedItem = null;

        document
            .querySelectorAll(".queue-item.dragging, .queue-item.drop-target-above, .queue-item.drop-target-below")
            .forEach((el) => {
                el.classList.remove("dragging", "drop-target-above", "drop-target-below");
            });
    }

    onListDragEnter(e) {
        e.e.preventDefault();
    }

    onListDragLeave(e) {
        const rect = e.target.getBoundingClientRect();
        const x = e.e.clientX;
        const y = e.e.clientY;
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
            this.clearDropTargetIndicators();
        }
    }

    onListDragOver(e) {
        e.e.preventDefault();
        e.e.dataTransfer.dropEffect = "move";

        const draggedItemId = this.dragState.draggedItemId;
        if (!draggedItemId) return;

        const clientY = e.e.clientY;
        const targetItem = this.findQueueItemAtPosition(clientY);
        if (!targetItem || targetItem.id === draggedItemId) {
            this.clearDropTargetIndicators();
            return;
        }

        const midpoint = targetItem.rect.top + targetItem.rect.height / 2;
        this.setDropTargetIndicator(targetItem.element, clientY >= midpoint);
    }

    async onListDrop(e) {
        e.e.preventDefault();

        const draggedItemId = this.dragState.draggedItemId;
        const draggedItem = this.dragState.draggedItem;

        if (!draggedItemId || !draggedItem) {
            return;
        }

        const targetItem = this.findQueueItemAtPosition(e.e.clientY);
        if (!targetItem || targetItem.id === draggedItemId) {
            return;
        }

        const midpoint = targetItem.rect.top + targetItem.rect.height / 2;
        const insertBefore = e.e.clientY < midpoint;

        this.clearDropTargetIndicators();

        try {
            await draggedItem.moveToPosition(targetItem.id, insertBefore ? "before" : "after");
        } catch (error) {
            console.error("Failed to move queue item:", error);
        }
    }

    clearDropTargetIndicators() {
        document.querySelectorAll(".queue-item.drop-target-above, .queue-item.drop-target-below").forEach((el) => {
            el.classList.remove("drop-target-above", "drop-target-below");
        });
    }

    setDropTargetIndicator(targetElement, isBelow) {
        this.clearDropTargetIndicators();
        if (isBelow) {
            targetElement.classList.add("drop-target-below");
        } else {
            targetElement.classList.add("drop-target-above");
        }
    }
}

