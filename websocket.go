package main

import (
	"bufio"
	"io"
	"net"
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

// Connection represents a WebSocket connection
type Connection struct {
	conn          net.Conn
	reader        *bufio.Reader
	writer        *bufio.Writer
	subscriptions map[string]bool
	mu            sync.Mutex
	writeChan     chan []byte
	binaryChan    chan []byte
	closeChan     chan bool
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
		case binary := <-c.binaryChan:
			c.writeMessage(BinaryMessage, binary)
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

// writeBinaryAsync writes binary data asynchronously
func (c *Connection) writeBinaryAsync(data []byte) {
	select {
	case c.binaryChan <- data:
	default:
		// Channel full, drop message to prevent blocking
	}
}
