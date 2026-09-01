# EttoreRocchi.github.io - local development
# The published site is plain HTML/CSS/JS. Pages are rendered from
# templates/ + data/ by `make build` (Python + jinja2), then committed.
# A local HTTP server is required because links are root-relative (/css/...).

PORT     ?= 8000
URL      := http://localhost:$(PORT)
PIDFILE  := .serve.pid
LOGFILE  := .serve.log

# A small inline server that adds Cache-Control: no-store on every response.
# This prevents the browser (and VS Code's Simple Browser) from showing a
# cached old version of your pages after you edit them - no more
# "but I changed it, why is it not updating?".
define NO_CACHE_SERVER
import http.server, sys
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0, must-revalidate")
        self.send_header("Pragma", "no-cache")
        super().end_headers()
http.server.test(H, port=int(sys.argv[1]), bind="127.0.0.1")
endef
export NO_CACHE_SERVER

.PHONY: help serve serve-bg stop restart status open vscode dev dev-vscode clean build build-pubs

help:
	@echo "EttoreRocchi.github.io - local dev"
	@echo ""
	@echo "Quick start:"
	@echo "  make dev          start server (bg) + open in default browser"
	@echo "  make dev-vscode   start server (bg) + show VS Code Simple Browser hint"
	@echo ""
	@echo "Server control:"
	@echo "  make serve        run HTTP server in foreground (Ctrl+C to stop)"
	@echo "  make serve-bg     run HTTP server in background"
	@echo "  make stop         stop the background server"
	@echo "  make restart      stop + serve-bg"
	@echo "  make status       show whether a background server is running"
	@echo ""
	@echo "Open the site:"
	@echo "  make open         open in the default system browser"
	@echo "  make vscode       hint to open in VS Code's Simple Browser"
	@echo ""
	@echo "Build:"
	@echo "  make build        render templates/ + data/ into the HTML pages"
	@echo "  make build-pubs   refresh data/publications.json from Scopus + CrossRef, then build"
	@echo ""
	@echo "  make clean        remove pid/log files and __pycache__"
	@echo ""
	@echo "Override port:  make serve PORT=9000"
	@echo ""
	@echo "URL: $(URL)"

serve:
	@echo ">>> Serving on $(URL)  (Ctrl+C to stop)"
	@echo ">>> Cache-Control: no-store - every refresh fetches fresh files"
	@python3 -c "$$NO_CACHE_SERVER" $(PORT)

serve-bg:
	@if [ -f $(PIDFILE) ] && kill -0 $$(cat $(PIDFILE)) 2>/dev/null; then \
		echo ">>> Server already running on $(URL)  (PID $$(cat $(PIDFILE)))"; \
	else \
		nohup python3 -c "$$NO_CACHE_SERVER" $(PORT) > $(LOGFILE) 2>&1 & echo $$! > $(PIDFILE); \
		sleep 0.4; \
		if kill -0 $$(cat $(PIDFILE)) 2>/dev/null; then \
			echo ">>> Server started on $(URL)  (PID $$(cat $(PIDFILE)))"; \
			echo ">>> Logs: tail -f $(LOGFILE)"; \
		else \
			echo "!!! Failed to start. Check $(LOGFILE):"; \
			cat $(LOGFILE); \
			rm -f $(PIDFILE); \
			exit 1; \
		fi; \
	fi

stop:
	@if [ -f $(PIDFILE) ]; then \
		PID=$$(cat $(PIDFILE)); \
		if kill -0 $$PID 2>/dev/null; then \
			kill $$PID && echo ">>> Server stopped (PID $$PID)."; \
		else \
			echo ">>> Server was not running."; \
		fi; \
		rm -f $(PIDFILE); \
	else \
		echo ">>> No background server tracked."; \
	fi

restart: stop serve-bg

status:
	@if [ -f $(PIDFILE) ] && kill -0 $$(cat $(PIDFILE)) 2>/dev/null; then \
		echo ">>> Server running on $(URL)  (PID $$(cat $(PIDFILE)))"; \
	else \
		echo ">>> No server running."; \
	fi

open:
	@( xdg-open "$(URL)" 2>/dev/null \
	   || open "$(URL)" 2>/dev/null \
	   || powershell.exe -c "Start-Process '$(URL)'" 2>/dev/null \
	   || echo "Open $(URL) in your browser." )

vscode:
	@echo ""
	@echo ">>> Open in VS Code's Simple Browser:"
	@echo "    1. Press Ctrl+Shift+P  (Cmd+Shift+P on Mac)"
	@echo "    2. Type:  Simple Browser: Show"
	@echo "    3. Paste: $(URL)"
	@echo ""
	@echo "    (Tip: VS Code's integrated terminal auto-detects the port and"
	@echo "     shows a 'Open in Browser' / 'Preview in Editor' notification"
	@echo "     when 'make serve' runs inside it.)"

dev: serve-bg open

dev-vscode: serve-bg vscode

clean: stop
	@rm -f $(PIDFILE) $(LOGFILE)
	@find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
	@find . -name "*.pyc" -delete 2>/dev/null || true
	@echo ">>> Cleaned."

build:
	@python3 scripts/build_site.py

build-pubs:
	@if [ ! -f scripts/.env ]; then \
		echo "!!! scripts/.env not found. Copy scripts/.env.example to scripts/.env and add your SCOPUS_API_KEY first."; \
		exit 1; \
	fi
	@python3 scripts/build_publications.py
	@$(MAKE) --no-print-directory build
