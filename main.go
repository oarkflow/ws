package main

import (
	"log"
	"net/http"
	"time"
)

// Socket methods

func main() {
	server := NewServer()
	hub := server.GetHub()

	// Set up event handlers
	hub.OnConnect(func(socket *Socket) {
		log.Printf("Client connected: %s", socket.ID)
		welcomeMsg := CompactMessage{
			T: MsgSystem,
			Data: map[string]interface{}{
				"message": "Connected to WebSocket server",
				"id":      socket.ID,
				"type":    "welcome",
			},
		}
		socket.SendCompact(welcomeMsg)
	})

	hub.OnMessage(func(socket *Socket) {
		log.Printf("Message from %s", socket.ID)
	})

	hub.OnClose(func(socket *Socket) {
		log.Printf("Client disconnected: %s", socket.ID)
	})

	hub.OnDisconnect(func(socket *Socket) {
		log.Printf("Client disconnect event: %s", socket.ID)
	})

	// Custom event handler example
	hub.On("ping", func(socket *Socket) {
		pongMsg := CompactMessage{
			T:    MsgPong,
			Data: map[string]int64{"timestamp": time.Now().Unix()},
		}
		socket.SendCompact(pongMsg)
	})

	// Admin functionality example - broadcast every 30 seconds
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			heartbeatMsg := CompactMessage{
				T: MsgSystem,
				Data: map[string]interface{}{
					"timestamp":   time.Now().Unix(),
					"connections": server.GetConnectionCount(),
					"type":        "heartbeat",
				},
			}
			hub.BroadcastCompact(heartbeatMsg)
		}
	}()

	// Add a simple broadcast test endpoint
	http.HandleFunc("/broadcast", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			message := r.URL.Query().Get("message")
			if message == "" {
				message = "Test broadcast from HTTP endpoint"
			}
			broadcastMsg := CompactMessage{
				T: MsgSystem,
				Data: map[string]interface{}{
					"message":   message,
					"timestamp": time.Now().Unix(),
					"source":    "http_endpoint",
					"type":      "announcement",
				},
			}
			hub.BroadcastCompact(broadcastMsg)
			w.WriteHeader(200)
			w.Write([]byte("Broadcast sent"))
		} else {
			w.WriteHeader(405)
			w.Write([]byte("Method not allowed"))
		}
	})

	http.HandleFunc("/ws", server.HandleWebSocket)
	http.Handle("/", http.FileServer(http.Dir("./views")))

	log.Println("Secure WebSocket server with Hub starting on :8080")
	log.Fatal(http.ListenAndServeTLS(":8080", "cert.pem", "key.pem", nil))
}
