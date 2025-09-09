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
		welcomeMsg := Message{
			T: MsgSystem,
			Data: map[string]interface{}{
				"message": "Connected to WebSocket server",
				"id":      socket.ID,
				"type":    "welcome",
			},
		}
		socket.SendMessage(welcomeMsg)

		// Broadcast updated user list to all clients
		userList := hub.GetUserList()
		userListMsg := Message{
			T: MsgUserList,
			Data: map[string]interface{}{
				"users": userList,
			},
		}
		hub.BroadcastMessage(userListMsg)

		// Send current topic list to the new client
		allTopics := hub.GetAllTopics()
		topicListMsg := Message{
			T: MsgSystem,
			Data: map[string]interface{}{
				"type":   "topic_list_update",
				"topics": allTopics,
			},
		}
		socket.SendMessage(topicListMsg)
	})

	hub.OnMessage(func(socket *Socket) {
		// log.Printf("Message from %s", socket.ID)
	})

	hub.OnClose(func(socket *Socket) {
		log.Printf("Client disconnected: %s", socket.ID)

		// Broadcast updated user list to all remaining clients
		userList := hub.GetUserList()
		userListMsg := Message{
			T: MsgUserList,
			Data: map[string]interface{}{
				"users": userList,
			},
		}
		hub.BroadcastMessage(userListMsg)
	})

	hub.OnDisconnect(func(socket *Socket) {
		log.Printf("Client disconnect event: %s", socket.ID)
	})

	// Custom event handler example
	hub.On("ping", func(socket *Socket) {
		pongMsg := Message{
			T:    MsgPong,
			Data: map[string]int64{"timestamp": time.Now().Unix()},
		}
		socket.SendMessage(pongMsg)
	})

	// Admin functionality example - broadcast every 30 seconds
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			heartbeatMsg := Message{
				T: MsgSystem,
				Data: map[string]interface{}{
					"timestamp":   time.Now().Unix(),
					"connections": server.GetConnectionCount(),
					"type":        "heartbeat",
				},
			}
			hub.BroadcastMessage(heartbeatMsg)
		}
	}()

	// Cleanup expired offline messages every hour
	go func() {
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			if err := hub.storage.CleanupExpiredMessages(); err != nil {
				log.Printf("Error cleaning up expired messages: %v", err)
			} else {
				log.Println("Cleaned up expired offline messages")
			}
		}
	}()

	// Add a simple broadcast test endpoint
	http.HandleFunc("/broadcast", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			message := r.URL.Query().Get("message")
			if message == "" {
				message = "Test broadcast from HTTP endpoint"
			}
			broadcastMsg := Message{
				T: MsgSystem,
				Data: map[string]interface{}{
					"message":   message,
					"timestamp": time.Now().Unix(),
					"source":    "http_endpoint",
					"type":      "announcement",
				},
			}
			hub.BroadcastMessage(broadcastMsg)
			w.WriteHeader(200)
			w.Write([]byte("Broadcast sent"))
		} else {
			w.WriteHeader(405)
			w.Write([]byte("Method not allowed"))
		}
	})

	http.HandleFunc("/ws", server.HandleWebSocket)
	http.Handle("/", http.FileServer(http.Dir("./views")))

	log.Println("WebSocket server with Hub starting on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
