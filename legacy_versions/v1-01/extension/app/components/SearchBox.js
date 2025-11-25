import { html, css, LiveVar } from "../dep/zyx.js";

css`
    #sharetube_search_iframe_container {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 90vw;
        height: 90vh;
        border: 1px solid #000;
        display: block;
        border-radius: 10px;
        z-index: 10000000;
        backdrop-filter: blur(10px);
        display: flex;
        flex-direction: column;
    }

    #sharetube_search_iframe_header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px;
        border-bottom: 1px solid #000;
        & > button {
            padding: 8px;
            border: 1px solid #000;
            border-radius: 10px;
            cursor: pointer;
        }
    }

    #sharetube_search_iframe {
        width: 100%;
        height: 100%;
    }
`;

export default class SearchBox {
    constructor(app, query) {
        this.app = app;
        html`
            <div this="sharetube_search_iframe_container" id="sharetube_search_iframe_container">
                <div id="sharetube_search_iframe_header">
                    <button id="add_to_queue_button" zyx-click=${this.addToQueue.bind(this)}>Add to queue</button>
                    <button id="sharetube_search_iframe_close" zyx-click=${this.close.bind(this)}>Close</button>
                </div>
                <iframe
                    this="sharetube_search_iframe"
                    id="sharetube_search_iframe"
                    src="https://www.youtube.com/results?search_query= "
                />
            </div>
        `.bind(this);
        /** zyx-sense @type {HTMLDivElement} */
        this.sharetube_search_iframe_container;
        /** zyx-sense @type {HTMLElement} */
        this.sharetube_search_iframe;

        this.sharetube_search_iframe_container.setAttribute(
            "allow",
            "autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write"
        );
        this.sharetube_search_iframe_container.setAttribute("allowfullscreen", "true");
        this.appendTo(document.body);
        if (query) {
            this.openSearch(query);
        }
    }

    addToQueue() {
        this.app.enqueueUrl(this.sharetube_search_iframe.contentWindow.location.href);
        this.close();
    }

    openSearch(query) {
        this.sharetube_search_iframe.src = `https://www.youtube.com/results?search_query=${query}`;
        this.sharetube_search_iframe.focus();
    }

    remove() {
        this.sharetube_search_iframe_container.remove();
    }

    close() {
        this.remove();
    }
}
