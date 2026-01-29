import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import API_URL from '../config/api';
import './ChatBox.css';

const ChatBox = ({ bookingId, currentUserId, otherUserName, onClose }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);
  const pollRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchMessages = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/api/messages/${bookingId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMessages(res.data);
      setError('');
    } catch (err) {
      if (err.response?.status !== 403) {
        setError('Failed to load messages');
      }
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  // Initial load + polling
  useEffect(() => {
    fetchMessages();
    // Poll every 5 seconds for new messages
    pollRef.current = setInterval(fetchMessages, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchMessages]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Focus input on open
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;

    setSending(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${API_URL}/api/messages/${bookingId}`,
        { text: newMessage.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMessages(prev => [...prev, res.data]);
      setNewMessage('');
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const formatTime = (dateStr) => {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();

    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    if (isToday) return time;
    if (isYesterday) return `Yesterday ${time}`;
    return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${time}`;
  };

  return (
    <div className="chatbox-container">
      <div className="chatbox-header">
        <div className="chatbox-header-info">
          <span className="chatbox-header-title">Chat with {otherUserName}</span>
        </div>
        <button className="chatbox-close" onClick={onClose}>&times;</button>
      </div>

      <div className="chatbox-messages">
        {loading ? (
          <div className="chatbox-loading">Loading messages...</div>
        ) : messages.length === 0 ? (
          <div className="chatbox-empty">
            <p>No messages yet</p>
            <p className="chatbox-empty-hint">Send a message to start the conversation</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.sender?._id === currentUserId || msg.sender === currentUserId;
            return (
              <div key={msg._id} className={`chatbox-msg ${isMine ? 'chatbox-msg-mine' : 'chatbox-msg-theirs'}`}>
                {!isMine && (
                  <div className="chatbox-msg-avatar">
                    {msg.sender?.profileImage ? (
                      <img src={msg.sender.profileImage} alt="" />
                    ) : (
                      <span>{msg.sender?.firstName?.[0] || '?'}</span>
                    )}
                  </div>
                )}
                <div className="chatbox-msg-content">
                  <div className="chatbox-msg-bubble">
                    {msg.text}
                  </div>
                  <div className="chatbox-msg-time">{formatTime(msg.createdAt)}</div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && <div className="chatbox-error">{error}</div>}

      <form className="chatbox-input" onSubmit={handleSend}>
        <input
          ref={inputRef}
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message..."
          maxLength={1000}
          disabled={sending}
        />
        <button type="submit" disabled={!newMessage.trim() || sending}>
          {sending ? '...' : 'Send'}
        </button>
      </form>
    </div>
  );
};

export default ChatBox;
