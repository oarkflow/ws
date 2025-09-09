package ws

import (
	"fmt"
	"sync"
	"time"
)

// MessageStorage defines the interface for storing offline messages
type MessageStorage interface {
	StoreMessage(recipientID string, message Message) error
	GetMessages(recipientID string) ([]Message, error)
	DeleteMessages(recipientID string, messageIDs []string) error
	CleanupExpiredMessages() error
	Close() error
}

// InMemoryMessageStorage implements MessageStorage using in-memory storage
type InMemoryMessageStorage struct {
	messages map[string][]StoredMessage
	mu       sync.RWMutex
	maxAge   time.Duration
}

// StoredMessage represents a message stored for offline delivery
type StoredMessage struct {
	ID        string    `json:"id"`
	Recipient string    `json:"recipient"`
	Message   Message   `json:"message"`
	Timestamp time.Time `json:"timestamp"`
}

// NewInMemoryMessageStorage creates a new in-memory message storage
func NewInMemoryMessageStorage(maxAge time.Duration) *InMemoryMessageStorage {
	if maxAge == 0 {
		maxAge = 24 * time.Hour // Default 24 hours
	}
	return &InMemoryMessageStorage{
		messages: make(map[string][]StoredMessage),
		maxAge:   maxAge,
	}
}

// StoreMessage stores a message for offline delivery
func (s *InMemoryMessageStorage) StoreMessage(recipientID string, message Message) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	storedMsg := StoredMessage{
		ID:        generateMessageID(),
		Recipient: recipientID,
		Message:   message,
		Timestamp: time.Now(),
	}

	if s.messages[recipientID] == nil {
		s.messages[recipientID] = []StoredMessage{}
	}
	s.messages[recipientID] = append(s.messages[recipientID], storedMsg)

	return nil
}

// GetMessages retrieves all messages for a recipient
func (s *InMemoryMessageStorage) GetMessages(recipientID string) ([]Message, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	storedMsgs, exists := s.messages[recipientID]
	if !exists {
		return []Message{}, nil
	}

	messages := make([]Message, 0, len(storedMsgs))
	for _, storedMsg := range storedMsgs {
		messages = append(messages, storedMsg.Message)
	}

	return messages, nil
}

// DeleteMessages removes messages for a recipient
func (s *InMemoryMessageStorage) DeleteMessages(recipientID string, messageIDs []string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	storedMsgs, exists := s.messages[recipientID]
	if !exists {
		return nil
	}

	// Create a map of message IDs to delete
	toDelete := make(map[string]bool)
	for _, id := range messageIDs {
		toDelete[id] = true
	}

	// Filter out messages to delete
	filtered := make([]StoredMessage, 0)
	for _, msg := range storedMsgs {
		if !toDelete[msg.ID] {
			filtered = append(filtered, msg)
		}
	}

	if len(filtered) == 0 {
		delete(s.messages, recipientID)
	} else {
		s.messages[recipientID] = filtered
	}

	return nil
}

// CleanupExpiredMessages removes messages older than maxAge
func (s *InMemoryMessageStorage) CleanupExpiredMessages() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()
	for recipientID, storedMsgs := range s.messages {
		filtered := make([]StoredMessage, 0)
		for _, msg := range storedMsgs {
			if now.Sub(msg.Timestamp) < s.maxAge {
				filtered = append(filtered, msg)
			}
		}
		if len(filtered) == 0 {
			delete(s.messages, recipientID)
		} else {
			s.messages[recipientID] = filtered
		}
	}

	return nil
}

// Close cleans up resources
func (s *InMemoryMessageStorage) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.messages = make(map[string][]StoredMessage)
	return nil
}

// generateMessageID generates a unique message ID
func generateMessageID() string {
	return fmt.Sprintf("msg_%d", time.Now().UnixNano())
}
