import logging

# Monkey patch geventwebsocket to fix KeyError: '' during disconnect
# See https://github.com/wumbl3/ShareTube/issues/new (or internal tracking)
try:
    import geventwebsocket.handler
    from geventwebsocket.handler import Client

    def _patched_run_websocket(self):
        """
        Patched version of WebSocketHandler.run_websocket to handle KeyError
        when deleting client from server.clients.
        """
        if getattr(self, 'prevent_wsgi_call', False):
            return

        # In case WebSocketServer is not used
        if not hasattr(self.server, 'clients'):
            self.server.clients = {}

        # Since we're now a websocket connection, we don't care what the
        # application actually responds with for the http response

        try:
            self.server.clients[self.client_address] = Client(
                self.client_address, self.websocket)
            list(self.application(self.environ, lambda s, h, e=None: []))
        finally:
            try:
                del self.server.clients[self.client_address]
            except KeyError:
                # This can happen if client_address is '' or if it was already removed
                pass

            if not self.websocket.closed:
                self.websocket.close()
            self.environ.update({
                'wsgi.websocket': None
            })
            self.websocket = None

    geventwebsocket.handler.WebSocketHandler.run_websocket = _patched_run_websocket
    logging.info("Patched geventwebsocket.handler.WebSocketHandler.run_websocket")
except ImportError:
    # geventwebsocket might not be installed if using a different async mode
    pass
except Exception:
    logging.exception("Failed to patch geventwebsocket")
