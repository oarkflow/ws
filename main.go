package main

import (
	"bufio"
	"crypto/sha1"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"strings"
	"sync"
)

// WebSocket opcodes
const (
	TextMessage   = 1
	BinaryMessage = 2
	CloseMessage  = 8
	PingMessage   = 9
	PongMessage   = 10
)

// Message represents a custom event message
type Message struct {
	Event string      `json:"event"`
	Topic string      `json:"topic,omitempty"`
	Data  interface{} `json:"data"`
}

// Connection represents a WebSocket connection
type Connection struct {
	conn          net.Conn
	reader        *bufio.Reader
	writer        *bufio.Writer
	subscriptions map[string]bool
	mu            sync.Mutex
	writeChan     chan []byte
	closeChan     chan bool
}

// Server manages WebSocket connections and topics
type Server struct {
	connections map[*Connection]bool
	topics      map[string]map[*Connection]bool
	mu          sync.RWMutex
	connCount   int64
	maxConns    int64
}

// NewServer creates a new WebSocket server
func NewServer() *Server {
	return &Server{
		connections: make(map[*Connection]bool),
		topics:      make(map[string]map[*Connection]bool),
		maxConns:    100000, // Support up to 100k connections
	}
}

// HandleWebSocket handles the WebSocket upgrade and connection
func (s *Server) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", 405)
		return
	}

	// Check authentication (header or query)
	token := r.Header.Get("Authorization")
	if token == "" {
		token = r.URL.Query().Get("token")
	}
	if token != "mysecrettoken" && token != "Bearer mysecrettoken" {
		http.Error(w, "Unauthorized", 401)
		return
	}

	// Check for WebSocket headers
	if !strings.EqualFold(r.Header.Get("Upgrade"), "websocket") ||
		!strings.EqualFold(r.Header.Get("Connection"), "Upgrade") {
		http.Error(w, "Bad request", 400)
		return
	}

	key := r.Header.Get("Sec-WebSocket-Key")
	if key == "" {
		http.Error(w, "Missing Sec-WebSocket-Key", 400)
		return
	}

	// Compute accept key
	h := sha1.New()
	h.Write([]byte(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
	accept := base64.StdEncoding.EncodeToString(h.Sum(nil))

	// Hijack the connection
	hj, ok := w.(http.Hijacker)
	if !ok {
		http.Error(w, "WebSocket upgrade failed", 500)
		return
	}

	conn, _, err := hj.Hijack()
	if err != nil {
		log.Println("Hijack error:", err)
		return
	}

	// Send upgrade response
	response := fmt.Sprintf("HTTP/1.1 101 Switching Protocols\r\n"+
		"Upgrade: websocket\r\n"+
		"Connection: Upgrade\r\n"+
		"Sec-WebSocket-Accept: %s\r\n\r\n", accept)
	conn.Write([]byte(response))

	// Create connection
	wsConn := &Connection{
		conn:          conn,
		reader:        bufio.NewReader(conn),
		writer:        bufio.NewWriter(conn),
		subscriptions: make(map[string]bool),
		writeChan:     make(chan []byte, 256), // Buffered channel for high throughput
		closeChan:     make(chan bool),
	}

	s.addConnection(wsConn)

	// Start writer goroutine for async writes
	go wsConn.writerLoop()

	// Handle connection in goroutine
	go s.handleConnection(wsConn)
}

// addConnection adds a connection to the server
func (s *Server) addConnection(conn *Connection) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Check connection limit
	if s.connCount >= s.maxConns {
		log.Println("Connection limit reached, rejecting connection")
		conn.conn.Close()
		return
	}

	s.connections[conn] = true
	s.connCount++
}

// removeConnection removes a connection from the server
func (s *Server) removeConnection(conn *Connection) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.connections, conn)
	s.connCount--
	for topic, conns := range s.topics {
		delete(conns, conn)
		if len(conns) == 0 {
			delete(s.topics, topic)
		}
	}
}

// subscribe subscribes a connection to a topic
func (s *Server) subscribe(conn *Connection, topic string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.topics[topic] == nil {
		s.topics[topic] = make(map[*Connection]bool)
	}
	s.topics[topic][conn] = true
	conn.mu.Lock()
	conn.subscriptions[topic] = true
	conn.mu.Unlock()
}

// unsubscribe unsubscribes a connection from a topic
func (s *Server) unsubscribe(conn *Connection, topic string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if conns, ok := s.topics[topic]; ok {
		delete(conns, conn)
		if len(conns) == 0 {
			delete(s.topics, topic)
		}
	}
	conn.mu.Lock()
	delete(conn.subscriptions, topic)
	conn.mu.Unlock()
}

// publish publishes a message to a topic
func (s *Server) publish(topic string, message []byte) {
	s.mu.RLock()
	conns := s.topics[topic]
	s.mu.RUnlock()

	// Send to all subscribers asynchronously
	for conn := range conns {
		conn.writeAsync(message)
	}
}

// handleConnection handles a WebSocket connection
func (s *Server) handleConnection(conn *Connection) {
	defer func() {
		conn.conn.Close()
		// Signal writer to stop
		close(conn.closeChan)
		// Send empty message to unblock writer
		select {
		case conn.writeChan <- []byte{}:
		default:
		}
		s.removeConnection(conn)
	}()

	for {
		opcode, payload, err := conn.readFrame()
		if err != nil {
			log.Println("Read frame error:", err)
			return
		}

		switch opcode {
		case TextMessage:
			// Handle custom events
			s.handleMessage(conn, payload)
		case CloseMessage:
			return
		case PingMessage:
			conn.writeMessage(PongMessage, payload)
		}
	}
}

// handleMessage handles incoming messages
func (s *Server) handleMessage(conn *Connection, payload []byte) {
	message := string(payload)

	// Try to parse as JSON first
	if strings.HasPrefix(message, "{") {
		var msg Message
		if err := json.Unmarshal(payload, &msg); err == nil {
			switch msg.Event {
			case "subscribe":
				s.subscribe(conn, msg.Topic)
				response := Message{Event: "subscribed", Topic: msg.Topic}
				if responseBytes, err := json.Marshal(response); err == nil {
					conn.writeMessage(TextMessage, responseBytes)
				}
			case "unsubscribe":
				s.unsubscribe(conn, msg.Topic)
				response := Message{Event: "unsubscribed", Topic: msg.Topic}
				if responseBytes, err := json.Marshal(response); err == nil {
					conn.writeMessage(TextMessage, responseBytes)
				}
			case "publish":
				s.publish(msg.Topic, payload)
			}
			return
		}
	}

	// Fallback to simple text protocol
	if strings.HasPrefix(message, "subscribe:") {
		topic := strings.TrimPrefix(message, "subscribe:")
		s.subscribe(conn, topic)
		conn.writeMessage(TextMessage, []byte("subscribed:"+topic))
	} else if strings.HasPrefix(message, "unsubscribe:") {
		topic := strings.TrimPrefix(message, "unsubscribe:")
		s.unsubscribe(conn, topic)
		conn.writeMessage(TextMessage, []byte("unsubscribed:"+topic))
	} else if strings.HasPrefix(message, "publish:") {
		parts := strings.SplitN(message, ":", 3)
		if len(parts) == 3 {
			topic := parts[1]
			data := parts[2]
			s.publish(topic, []byte(data))
		}
	}
}

// readFrame reads a WebSocket frame
func (c *Connection) readFrame() (opcode byte, payload []byte, err error) {
	// Read first byte
	b, err := c.reader.ReadByte()
	if err != nil {
		return 0, nil, err
	}
	opcode = b & 0x0F

	// Read second byte
	b, err = c.reader.ReadByte()
	if err != nil {
		return 0, nil, err
	}
	masked := (b & 0x80) != 0
	payloadLen := int(b & 0x7F)

	if payloadLen == 126 {
		// Read extended payload length (16 bits)
		lenBytes := make([]byte, 2)
		_, err = io.ReadFull(c.reader, lenBytes)
		if err != nil {
			return 0, nil, err
		}
		payloadLen = int(lenBytes[0])<<8 | int(lenBytes[1])
	} else if payloadLen == 127 {
		// Read extended payload length (64 bits)
		lenBytes := make([]byte, 8)
		_, err = io.ReadFull(c.reader, lenBytes)
		if err != nil {
			return 0, nil, err
		}
		payloadLen = int(lenBytes[0])<<56 | int(lenBytes[1])<<48 | int(lenBytes[2])<<40 | int(lenBytes[3])<<32 |
			int(lenBytes[4])<<24 | int(lenBytes[5])<<16 | int(lenBytes[6])<<8 | int(lenBytes[7])
	}

	// Read masking key if masked
	var maskKey []byte
	if masked {
		maskKey = make([]byte, 4)
		_, err = io.ReadFull(c.reader, maskKey)
		if err != nil {
			return 0, nil, err
		}
	}

	// Read payload
	payload = make([]byte, payloadLen)
	_, err = io.ReadFull(c.reader, payload)
	if err != nil {
		return 0, nil, err
	}

	// Unmask payload if masked
	if masked {
		for i := 0; i < payloadLen; i++ {
			payload[i] ^= maskKey[i%4]
		}
	}

	return opcode, payload, nil
}

// writeMessage writes a WebSocket message
func (c *Connection) writeMessage(opcode byte, payload []byte) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	payloadLen := len(payload)
	var frame []byte

	// First byte: FIN + opcode
	frame = append(frame, 0x80|opcode)

	// Second byte: payload length
	if payloadLen <= 125 {
		frame = append(frame, byte(payloadLen))
	} else if payloadLen <= 65535 {
		frame = append(frame, 126)
		frame = append(frame, byte(payloadLen>>8), byte(payloadLen&0xFF))
	} else {
		frame = append(frame, 127)
		for i := 7; i >= 0; i-- {
			frame = append(frame, byte(payloadLen>>(i*8)))
		}
	}

	// Payload
	frame = append(frame, payload...)

	_, err := c.writer.Write(frame)
	if err != nil {
		return err
	}
	return c.writer.Flush()
}

// writerLoop handles async message writing
func (c *Connection) writerLoop() {
	for {
		select {
		case data := <-c.writeChan:
			if len(data) == 0 {
				return // Empty message signals close
			}
			c.writeMessage(TextMessage, data)
		case <-c.closeChan:
			return
		}
	}
}

// writeAsync writes a message asynchronously
func (c *Connection) writeAsync(data []byte) {
	select {
	case c.writeChan <- data:
	default:
		// Channel full, drop message to prevent blocking
	}
}

func main() {
	server := NewServer()

	http.HandleFunc("/ws", server.HandleWebSocket)
	http.Handle("/", http.FileServer(http.Dir("./views")))

	log.Println("Secure WebSocket server starting on :8080")
	log.Fatal(http.ListenAndServeTLS(":8080", "cert.pem", "key.pem", nil))
}
