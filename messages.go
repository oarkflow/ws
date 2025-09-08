package main

import (
	"encoding/json"
)

// Message types (compact protocol)
const (
	MsgBroadcast   = 1
	MsgPrivate     = 2
	MsgSystem      = 3
	MsgSubscribe   = 4
	MsgUnsubscribe = 5
	MsgPing        = 6
	MsgPong        = 7
	MsgError       = 8
	MsgAck         = 9
)

// UltraCompactMessage represents the most efficient message format using arrays
// Format: [type, topic?, data?, id?, to?, code?]
type UltraCompactMessage []interface{}

// Message type constants for ultra-compact
const (
	UCMsgBroadcast = iota + 1
	UCMsgPrivate
	UCMsgSystem
	UCMsgSubscribe
	UCMsgUnsubscribe
	UCMsgPing
	UCMsgPong
	UCMsgError
	UCMsgAck
)

// Helper functions for ultra-compact messages
func NewUCMsg(msgType int, args ...interface{}) UltraCompactMessage {
	msg := make(UltraCompactMessage, len(args)+1)
	msg[0] = msgType
	for i, arg := range args {
		msg[i+1] = arg
	}
	return msg
}

// Getters for ultra-compact messages
func (ucm UltraCompactMessage) Type() int {
	if len(ucm) > 0 {
		if t, ok := ucm[0].(int); ok {
			return t
		}
	}
	return 0
}

func (ucm UltraCompactMessage) Topic() string {
	if len(ucm) > 1 {
		if t, ok := ucm[1].(string); ok {
			return t
		}
	}
	return ""
}

func (ucm UltraCompactMessage) Data() interface{} {
	if len(ucm) > 2 {
		return ucm[2]
	}
	return nil
}

func (ucm UltraCompactMessage) ID() string {
	if len(ucm) > 3 {
		if id, ok := ucm[3].(string); ok {
			return id
		}
	}
	return ""
}

func (ucm UltraCompactMessage) To() string {
	if len(ucm) > 4 {
		if to, ok := ucm[4].(string); ok {
			return to
		}
	}
	return ""
}

func (ucm UltraCompactMessage) Code() int {
	if len(ucm) > 5 {
		if code, ok := ucm[5].(int); ok {
			return code
		}
	}
	return 0
}

// CompactMessage represents an efficient message format
type CompactMessage struct {
	T     int         `json:"t"`               // Message type
	Topic string      `json:"topic,omitempty"` // Topic for broadcasts
	To    string      `json:"to,omitempty"`    // Recipient for private messages
	Data  interface{} `json:"data,omitempty"`  // Message data
	Code  int         `json:"code,omitempty"`  // Error/system code
	ID    string      `json:"id,omitempty"`    // Message ID for tracking
}

// Legacy Message struct for backward compatibility
type Message struct {
	Event string      `json:"event"`
	Topic string      `json:"topic,omitempty"`
	Data  interface{} `json:"data"`
	ID    string      `json:"id,omitempty"`
}

// SendUltraCompact sends an ultra-compact message (array format)
func (s *Socket) SendUltraCompact(msg UltraCompactMessage) {
	if s.isBanned {
		return
	}

	if jsonData, err := json.Marshal(msg); err == nil {
		s.conn.writeAsync(jsonData)
	}
}

// stringToMsgType converts string event names to numeric types
func stringToMsgType(event string) int {
	switch event {
	case "broadcast":
		return MsgBroadcast
	case "private":
		return MsgPrivate
	case "system":
		return MsgSystem
	case "subscribed":
		return MsgAck
	case "unsubscribed":
		return MsgAck
	case "ping":
		return MsgPing
	case "pong":
		return MsgPong
	case "error":
		return MsgError
	default:
		return MsgSystem // Default to system message
	}
}

// msgTypeToString converts numeric message type to string
func msgTypeToString(msgType int) string {
	switch msgType {
	case MsgBroadcast:
		return "broadcast"
	case MsgPrivate:
		return "private"
	case MsgSystem:
		return "system"
	case MsgSubscribe:
		return "subscribe"
	case MsgUnsubscribe:
		return "unsubscribe"
	case MsgPing:
		return "ping"
	case MsgPong:
		return "pong"
	case MsgError:
		return "error"
	case MsgAck:
		return "ack"
	default:
		return "unknown"
	}
}

// ucMsgTypeToString converts ultra-compact message type to string
func ucMsgTypeToString(msgType int) string {
	switch msgType {
	case UCMsgBroadcast:
		return "broadcast"
	case UCMsgPrivate:
		return "private"
	case UCMsgSystem:
		return "system"
	case UCMsgSubscribe:
		return "subscribe"
	case UCMsgUnsubscribe:
		return "unsubscribe"
	case UCMsgPing:
		return "ping"
	case UCMsgPong:
		return "pong"
	case UCMsgError:
		return "error"
	case UCMsgAck:
		return "ack"
	default:
		return "unknown"
	}
}

// SendCompact sends a compact message directly
func (s *Socket) SendCompact(msg CompactMessage) {
	if s.isBanned {
		return
	}

	if jsonData, err := json.Marshal(msg); err == nil {
		s.conn.writeAsync(jsonData)
	}
}

// Send sends a message to the socket using compact format
func (s *Socket) Send(event string, data interface{}) {
	if s.isBanned {
		return
	}

	// Convert string event to numeric type
	msgType := stringToMsgType(event)
	compactMsg := CompactMessage{
		T:    msgType,
		Data: data,
		ID:   s.ID,
	}

	if jsonData, err := json.Marshal(compactMsg); err == nil {
		s.conn.writeAsync(jsonData)
	}
}

// Emit emits a custom event to the socket
func (s *Socket) Emit(event string, data interface{}) {
	s.Send(event, data)
}
