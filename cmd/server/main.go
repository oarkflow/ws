package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	_ "github.com/lib/pq" // PostgreSQL driver
	"github.com/oarkflow/ws"
	"github.com/oarkflow/ws/call"
)

func main() {
	// Database connection string from environment
	var db ws.Database
	dbConnStr := os.Getenv("DATABASE_URL")
	if dbConnStr == "" {
		// For demo purposes, run without database persistence
		log.Println("No DATABASE_URL provided, running without database persistence")
		db = nil
	} else {
		// Initialize database
		var err error
		db, err = ws.NewPostgresDatabase(dbConnStr)
		if err != nil {
			log.Fatalf("Failed to connect to database: %v", err)
		}
		defer db.Close()
	}

	// Initialize WebSocket server
	server := ws.NewServer()
	hub := server.GetHub()

	// Initialize call manager (will handle nil database gracefully)
	callManager := call.NewManager(db, hub)

	// Set call manager on server
	server.SetCallManager(callManager)

	// Set up event handlers
	hub.OnConnect(func(socket *ws.Socket) {
		log.Printf("Client connected: %s", socket.ID)
	})

	hub.OnMessage(func(socket *ws.Socket) {
		// Handle WebRTC signaling messages
		// This will be called for all messages, we need to filter
	})

	hub.OnClose(func(socket *ws.Socket) {
		log.Printf("Client disconnected: %s", socket.ID)
		callManager.HandleDisconnect(socket.ID)
	})

	// Override the message handler to route WebRTC messages to call manager
	server.OnMessage(func(socket *ws.Socket) {
		// This is a placeholder - in real implementation, we'd need to modify
		// the server to pass messages to call manager
	})

	// REST endpoints for token management
	http.HandleFunc("/auth/token", handleTokenRequest)
	http.HandleFunc("/calls", handleCreateCall)
	http.HandleFunc("/calls/", handleGetCall)

	// WebSocket endpoint
	http.HandleFunc("/ws", server.HandleWebSocket)

	// Serve call frontend
	http.HandleFunc("/call/", func(w http.ResponseWriter, r *http.Request) {
		// Remove /call/ prefix to get the file path
		filePath := strings.TrimPrefix(r.URL.Path, "/call/")
		if filePath == "" || filePath == "/" {
			filePath = "index.html"
		}

		// Serve files from call-frontend directory
		fullPath := filepath.Join("call-frontend", filePath)
		if _, err := os.Stat(fullPath); os.IsNotExist(err) {
			http.NotFound(w, r)
			return
		}

		http.ServeFile(w, r, fullPath)
	})

	// Static files
	http.Handle("/", http.FileServer(http.Dir("./views")))

	log.Println("WebRTC Call Management Backend starting on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}

// handleTokenRequest issues JWT tokens
func handleTokenRequest(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", 405)
		return
	}

	// TODO: Implement JWT token issuance
	// This would validate user credentials and issue a JWT

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"token": "jwt_token_here"}`))
}

// handleCreateCall creates a new call
func handleCreateCall(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", 405)
		return
	}

	// TODO: Implement call creation
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"call_id": "uuid_here"}`))
}

// handleGetCall retrieves call information
func handleGetCall(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", 405)
		return
	}

	// TODO: Implement call retrieval
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"call": {}}`))
}
